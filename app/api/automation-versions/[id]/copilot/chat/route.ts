import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { buildRateLimitKey, ensureRateLimit } from "@/lib/rate-limit";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { createCopilotMessage, listCopilotMessages } from "@/lib/services/copilot-messages";
import { determineConversationPhase, generateThinkingSteps } from "@/lib/ai/copilot-orchestrator";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { createCopilotTrace } from "@/lib/ai/copilot-trace";
import { logAudit } from "@/lib/audit/log";
import { db } from "@/db";
import { automationVersions, copilotMessages, tasks as tasksTable, type CopilotRun } from "@/db/schema";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";
import type { Workflow } from "@/lib/workflows/types";
import { WorkflowSchema } from "@/lib/workflows/schema";
import { applyStepNumbers } from "@/lib/workflows/step-numbering";
import { parseCommand, isDirectCommand } from "@/lib/workflows/command-parser";
import { executeCommand } from "@/lib/workflows/command-executor";
import { buildWorkflowFromChat, type AITask } from "@/lib/workflows/ai-builder-simple";
import { syncAutomationTasks } from "@/lib/workflows/task-sync";
import { getWorkflowCompletionState } from "@/lib/workflows/completion";
import { evaluateWorkflowProgress } from "@/lib/ai/workflow-progress";
import { diffWorkflow } from "@/lib/workflows/diff";
import { withLegacyWorkflowAlias } from "@/lib/workflows/legacy";
import {
  createEmptyCopilotAnalysisState,
  createEmptyMemory,
  type CopilotAnalysisState,
  type CopilotMemory,
} from "@/lib/workflows/copilot-analysis";
import { getCopilotAnalysis, upsertCopilotAnalysis } from "@/lib/services/copilot-analysis";
import { parseCopilotReply } from "@/lib/ai/parse-copilot-reply";
import { createCopilotRun, getCopilotRunByClientMessageId } from "@/lib/services/copilot-runs";
import { logger } from "@/lib/logger";
import { createSSEStream } from "@/lib/http/sse";
import { generateIntentSummary, type IntentSummary } from "@/lib/ai/intent-summary";

const ChatRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  intakeNotes: z.string().max(20000).optional().nullable(),
  snippets: z.array(z.string().max(4000)).optional(),
  clientMessageId: z.string().max(128).optional(),
});

type ChatRequest = z.infer<typeof ChatRequestSchema>;

type CopilotMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const MIN_AUTOMATION_KEYWORDS = ["automation", "workflow", "process", "step", "system", "trigger", "action"];
const OFF_TOPIC_KEYWORDS = ["weather", "stock", "joke", "recipe", "story", "novel", "poem"];

const SYSTEM_PROMPT =
  "You are Wrk Copilot. You ONLY help users describe and design business processes to automate. If the user asks unrelated questions (general knowledge, advice, or chit chat) you politely redirect them to describing the workflow they want to automate. You return a JSON object that matches the provided Workflow schema exactly.";

type CopilotRunResult = Awaited<ReturnType<typeof buildIdempotentResponse>> & {
  runId: string;
  message: Awaited<ReturnType<typeof createCopilotMessage>>;
  workflow: Workflow;
  tasks: Awaited<ReturnType<typeof fetchTasksForVersion>>;
  completion: ReturnType<typeof getWorkflowCompletionState>;
  progress: Awaited<ReturnType<typeof evaluateWorkflowProgress>> | null;
  prompt: {
    system: string;
    contextSummary: string;
    messageCount: number;
  } | null;
  commandExecuted: boolean;
  thinkingSteps: ReturnType<typeof generateThinkingSteps>;
  conversationPhase: ReturnType<typeof determineConversationPhase>;
  persistenceError?: boolean;
};

type CopilotStatusPayload = {
  runId: string;
  requestId: string;
  phase: string;
  message: string;
  meta?: Record<string, unknown>;
};

type CopilotErrorPayload = {
  runId: string;
  requestId: string;
  message: string;
  code?: number | string;
};

type CopilotCallbacks = {
  onStatus?: (payload: CopilotStatusPayload) => void;
  onResult?: (payload: CopilotRunResult) => void;
  onError?: (payload: CopilotErrorPayload) => void;
};

function isStreamRequest(request: Request) {
  const url = new URL(request.url);
  const streamParam = url.searchParams.get("stream");
  const accept = request.headers.get("accept") ?? "";
  return streamParam === "1" || accept.includes("text/event-stream");
}

function deriveScheduleStatus(message: string): string | null {
  const lower = message.toLowerCase();
  const hasDaily = /daily/.test(lower);
  const hasWeekly = /weekly/.test(lower);
  const hasEvery = /\bevery\b/.test(lower);
  const timeMatch = message.match(/\b(\d{1,2})(:\d{2})?\s?(am|pm)?\b/i);
  const cronish = /(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)/.test(message);
  if (!(hasDaily || hasWeekly || hasEvery || timeMatch || cronish)) {
    return null;
  }
  const timeText = timeMatch ? timeMatch[0].trim() : null;
  if (hasDaily && timeText) return `Adding a daily schedule (${timeText})`;
  if (hasDaily) return "Adding a daily schedule";
  if (hasWeekly && timeText) return `Adding a weekly schedule (${timeText})`;
  if (hasWeekly) return "Adding a weekly schedule";
  if (cronish) return "Setting schedule from cron expression";
  if (hasEvery && timeText) return `Setting schedule: ${message.trim()}`;
  if (timeText) return `Setting schedule: ${timeText}`;
  return `Setting schedule: ${message.trim()}`;
}

function isSummaryRelevant(summary: string, userMessage: string): boolean {
  const STOPWORDS = new Set([
    "from",
    "with",
    "into",
    "data",
    "flow",
    "workflow",
    "process",
    "send",
    "sending",
    "add",
    "adding",
    "pulling",
    "using",
    "this",
    "that",
    "your",
    "work",
    "steps",
    "step",
  ]);

  const tokens = userMessage
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (tokens.length === 0) return true;

  const lowerSummary = summary.toLowerCase();
  const matches = tokens.filter((t) => lowerSummary.includes(t));
  return matches.length > 0;
}

function deriveEditIntent(message: string, options?: { fallback?: string }): string {
  const fallback = options?.fallback ?? "Updating your workflow…";
  if (!message || message.trim().length === 0) return fallback;

  const ensureEllipsis = (value: string) => (value.endsWith("…") ? value : `${value}…`);
  const normalized = message.toLowerCase();
  const scheduleIntent = deriveScheduleStatus(message);
  if (scheduleIntent) return ensureEllipsis(scheduleIntent);

  if (/retry|retries|fallback|failover/.test(normalized)) {
    return ensureEllipsis("Adding retries and fallback paths");
  }
  if (/rename|re-number|renumber/.test(normalized)) {
    return ensureEllipsis("Renaming steps and re-numbering");
  }
  if (/(map|mapping|sync|transform|convert).*(field|column|property|data)/.test(normalized)) {
    return ensureEllipsis("Mapping fields into your outputs");
  }
  if (/template/.test(normalized) && /(sms|email|message|notification)/.test(normalized)) {
    return ensureEllipsis("Updating templates with mapped fields");
  }
  if (/branch|path|conditional|decision/.test(normalized)) {
    return ensureEllipsis("Updating branch logic and step graph");
  }
  if (/input|form|capture|collect/.test(normalized)) {
    return ensureEllipsis("Recomputing required inputs");
  }

  const snippet = message.trim().replace(/\s+/g, " ");
  const compact = snippet.length > 120 ? `${snippet.slice(0, 117)}…` : snippet;
  return ensureEllipsis(`Updating workflow: ${compact}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ result: T | null; timedOut: boolean }> {
  let timeoutId: NodeJS.Timeout;
  let timedOut = false;

  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return { result, timedOut };
  } finally {
    clearTimeout(timeoutId!);
    if (timedOut) {
      // No-op: caller handles fallback behavior
    }
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const streaming = isStreamRequest(request);
  const sse = streaming ? createSSEStream({ signal: request.signal }) : null;
  const respondError = async (error: unknown) => {
    if (streaming && sse) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      const code = error instanceof ApiError ? error.status : undefined;
      void sse.send("error", { runId: "unknown", requestId: "unknown", message, code });
      void sse.close();
      return sse.response({ status: code ?? 500 });
    }
    if (error instanceof Error && error.message === "Automation version not found") {
      return handleApiError(new ApiError(404, error.message));
    }
    return handleApiError(error);
  };

  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    let payload: ChatRequest;
    let rawBody: any;
    try {
      rawBody = await request.json();
      payload = ChatRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
        throw new ApiError(400, `Invalid request body: ${issues}`);
      }
      throw new ApiError(400, "Invalid request body.");
    }

    try {
      ensureRateLimit({
        key: buildRateLimitKey("copilot:chat", session.tenantId),
        limit: Number(process.env.COPILOT_DRAFTS_PER_HOUR ?? 20),
        windowMs: 60 * 60 * 1000,
      });
    } catch {
      throw new ApiError(429, "Too many workflows requested. Please wait before trying again.");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }

    const callbacks: CopilotCallbacks | undefined =
      streaming && sse
        ? (() => {
            let statusCount = 0;
            const onStatus = (status: CopilotStatusPayload) => {
              statusCount += 1;
              return void sse.send("status", status);
            };
            const onResult = (result: CopilotRunResult) => void sse.send("result", result);
            const onError = (err: CopilotErrorPayload) => void sse.send("error", err);
            return { onStatus, onResult, onError };
          })()
        : undefined;

    const clientMessageId = payload.clientMessageId?.trim();
    const runId = clientMessageId || randomUUID();

    if (streaming && sse) {
      (async () => {
        const runnerStartedAt = Date.now();
        let statusCount = 0;
        copilotDebug("copilot_chat.sse_runner_started", { runId });
        try {
          await sse.send("status", {
            runId,
            requestId: "bootstrap",
            phase: "connected",
            message: "Connected — starting…",
          });
          await runCopilotChat({
            request,
            params,
            payload,
            session,
            detail,
            callbacks:
              callbacks &&
              ({
                onStatus: (status) => {
                  statusCount += 1;
                  return callbacks.onStatus?.(status);
                },
                onResult: callbacks.onResult,
                onError: callbacks.onError,
              } as CopilotCallbacks),
            runIdOverride: runId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected error.";
          const code = error instanceof ApiError ? error.status : undefined;
          try {
            await sse.send("error", { runId, requestId: "runner", message, code });
          } catch {
            // ignore
          }
        } finally {
          copilotDebug("copilot_chat.sse_runner_duration_ms", {
            runId,
            durationMs: Date.now() - runnerStartedAt,
            statusCount,
          });
          copilotDebug("copilot_chat.sse_runner_completed", { runId });
          await sse.close();
        }
      })();

      copilotDebug("copilot_chat.sse_response_returned", { runId });
      return sse.response();
    }

    const result = await runCopilotChat({
      request,
      params,
      payload,
      session,
      detail,
      callbacks,
      runIdOverride: runId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return respondError(error);
  }
}

type AutomationVersionDetail = NonNullable<Awaited<ReturnType<typeof getAutomationVersionDetail>>>;

async function runCopilotChat({
  request,
  params,
  payload,
  session,
  detail,
  callbacks,
  runIdOverride,
}: {
  request: Request;
  params: { id: string };
  payload: ChatRequest;
  session: Awaited<ReturnType<typeof requireTenantSession>>;
  detail: AutomationVersionDetail;
  callbacks?: CopilotCallbacks;
  runIdOverride?: string;
}): Promise<CopilotRunResult> {
  void request;
  const clientMessageId = payload.clientMessageId?.trim();
  const runId = runIdOverride || clientMessageId || randomUUID();
  const requestId = randomUUID();
  const baseTrace = createCopilotTrace({
    runId,
    requestId,
    automationVersionId: params.id,
    clientMessageId: clientMessageId ?? undefined,
    source: "copilot/chat",
    phase: "run",
  });
  baseTrace.event("run.started", { automationVersionId: params.id });

  const clampStatus = (value: string) => (value.length > 110 ? `${value.slice(0, 107)}...` : value);
  const emitStatus = (phase: string, message: string, meta?: Record<string, unknown>) =>
    callbacks?.onStatus?.({ runId, requestId, phase, message: clampStatus(message), meta });
  const emitError = (message: string, code?: number | string) =>
    callbacks?.onError?.({ runId, requestId, message, code });
  emitStatus("understanding", "Got it — working on this…");

  const existingRun =
    clientMessageId &&
    (await getCopilotRunByClientMessageId({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      clientMessageId,
    }));

  if (existingRun && existingRun.automationVersionId === params.id) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId,
        hypothesisId: "H1-idempotent",
        location: "copilot/chat/route.ts:runCopilotChat",
        message: "idempotent replay detected",
        data: { clientMessageId, assistantMessageId: existingRun.assistantMessageId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const replay = await buildIdempotentResponse({
      run: existingRun,
      tenantId: session.tenantId,
      automationVersionId: params.id,
      detail,
    });
    emitStatus("saving", "Replaying saved result…", { replay: true });
    callbacks?.onResult?.({ ...replay, runId } as CopilotRunResult);
    return { ...replay, runId } as CopilotRunResult;
  }

  if (existingRun && existingRun.automationVersionId !== params.id) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId,
        hypothesisId: "H1-idempotent",
        location: "copilot/chat/route.ts:runCopilotChat",
        message: "idempotent run ignored due to version mismatch",
        data: {
          clientMessageId,
          existingAutomationVersionId: existingRun.automationVersionId,
          currentAutomationVersionId: params.id,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  const currentWorkflow = detail.workflowView?.workflowSpec ?? createEmptyWorkflowSpec();
  const intakeNotes = payload.intakeNotes ?? detail.version.intakeNotes ?? undefined;

  const trimmedContent = payload.content.trim();
  if (!trimmedContent) {
    throw new ApiError(400, "Message content is required.");
  }

  const userMessage = await createCopilotMessage({
    tenantId: session.tenantId,
    automationVersionId: params.id,
    role: "user",
    content: trimmedContent,
    createdBy: session.userId,
  });

  const messages = await listCopilotMessages({
    tenantId: session.tenantId,
    automationVersionId: params.id,
  });

  const normalizedMessages = normalizeMessages(
    messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.role === "assistant" ? parseCopilotReply(message.content).displayText : message.content,
      }))
  );
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId,
      hypothesisId: "H2-payload",
      location: "copilot/chat/route.ts:runCopilotChat",
      message: "normalized messages ready",
      data: {
        clientMessageId: clientMessageId ?? null,
        messageCount: normalizedMessages.length,
        latestUserPreview: normalizedMessages.findLast((m) => m.role === "user")?.content.slice(0, 160) ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const understandingTrace = baseTrace.phase("understanding");
  understandingTrace.event("phase.entered", { messageCount: normalizedMessages.length });
  emitStatus("understanding", "Reviewing conversation and notes…", { messageCount: normalizedMessages.length });

  const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
  if (latestUserMessage && isOffTopic(latestUserMessage.content)) {
    const error = new ApiError(
      400,
      "Wrk Copilot only helps design automations. Tell me about the workflow you want to automate and I can draft a workflow."
    );
    emitError(error.message, error.status);
    throw error;
  }

  const contextSummary = buildConversationSummary(normalizedMessages, intakeNotes);
  const currentBlueprint = currentWorkflow ?? createEmptyWorkflowSpec();
  const userMessageContent = latestUserMessage?.content ?? trimmedContent;
  const deterministicEditIntent = deriveEditIntent(userMessageContent, { fallback: "Updating your workflow…" });
  let intentSummary: IntentSummary | null = null;
  let intentStatusEmitted = false;
  const lastAssistantMessage = [...normalizedMessages].reverse().find((message) => message.role === "assistant");
  const scheduleStatus = deriveScheduleStatus(userMessageContent);

  if (scheduleStatus) {
    intentSummary = { intent_summary: scheduleStatus };
    intentStatusEmitted = true;
    emitStatus("understanding", scheduleStatus);
    copilotDebug("copilot_chat.intent_summary_emitted", {
      runId,
      userMessage: userMessageContent,
      previousAssistantMessage: lastAssistantMessage?.content ?? null,
      intentSummary: scheduleStatus,
      deterministic: true,
    });
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId,
        hypothesisId: "H-intent",
        location: "copilot/chat/route.ts:runCopilotChat",
        message: "intent_summary_emitted",
        data: {
          userMessage: userMessageContent,
          previousAssistantMessage: lastAssistantMessage?.content ?? null,
          intentSummary: scheduleStatus,
          deterministic: true,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } else {
    const previousAssistantMessage =
      lastAssistantMessage?.content ??
      (intakeNotes ? "Missing schedule; user likely answering schedule" : undefined);
    let summary: IntentSummary | null = null;
    let summaryTimedOut = false;
    try {
      const intentResult = await withTimeout<IntentSummary | null>(
        generateIntentSummary(userMessageContent, {
          previousAssistantMessage,
          intakeNotes,
        }),
        300
      );
      summary = intentResult.result;
      summaryTimedOut = intentResult.timedOut;
      intentSummary = summary ?? intentSummary;
    } catch (error) {
      logger.warn("generateIntentSummary failed", { error });
    }

    if (summary && !intentStatusEmitted) {
      if (!isSummaryRelevant(summary.intent_summary, userMessageContent)) {
        copilotDebug("copilot_chat.intent_summary_rejected_irrelevant", {
          runId,
          userMessage: userMessageContent,
          previousAssistantMessage: previousAssistantMessage ?? null,
          intentSummary: summary.intent_summary,
        });
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H-intent",
            location: "copilot/chat/route.ts:runCopilotChat",
            message: "intent_summary_rejected_irrelevant",
            data: {
              userMessage: userMessageContent,
              previousAssistantMessage: previousAssistantMessage ?? null,
              intentSummary: summary.intent_summary,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      } else {
        intentStatusEmitted = true;
        emitStatus("understanding", summary.intent_summary);
        copilotDebug("copilot_chat.intent_summary_emitted", {
          runId,
          userMessage: userMessageContent,
          previousAssistantMessage: previousAssistantMessage ?? null,
          intentSummary: summary.intent_summary,
          deterministic: false,
        });
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId,
            hypothesisId: "H-intent",
            location: "copilot/chat/route.ts:runCopilotChat",
            message: "intent_summary_emitted",
            data: {
              userMessage: userMessageContent,
              previousAssistantMessage: previousAssistantMessage ?? null,
              intentSummary: summary.intent_summary,
              deterministic: false,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
    }

    if (!intentStatusEmitted) {
      const fallbackIntent = intentSummary?.intent_summary && intentSummary.intent_summary.length > 0
        ? intentSummary.intent_summary
        : deterministicEditIntent;
      intentSummary = { intent_summary: fallbackIntent };
      intentStatusEmitted = true;
      emitStatus("understanding", fallbackIntent);
      copilotDebug("copilot_chat.intent_summary_fallback", {
        runId,
        userMessage: userMessageContent,
        previousAssistantMessage: previousAssistantMessage ?? null,
        intentSummary: fallbackIntent,
        timedOut: summaryTimedOut,
      });
    }
  }

  const existingAnalysisRaw =
    (await getCopilotAnalysis({ tenantId: session.tenantId, automationVersionId: params.id })) ?? null;
  const mostRecentUserMessageId = [...messages].reverse().find((message) => message.role === "user")?.id ?? null;
  const workflowUpdatedAt = detail.version.updatedAt ? new Date(detail.version.updatedAt).toISOString() : null;
  const staleAnalysis =
    (existingAnalysisRaw?.workflowUpdatedAt && workflowUpdatedAt && existingAnalysisRaw.workflowUpdatedAt !== workflowUpdatedAt) ||
    (existingAnalysisRaw?.lastUserMessageId && mostRecentUserMessageId && existingAnalysisRaw.lastUserMessageId !== mostRecentUserMessageId);
  const existingAnalysis = staleAnalysis
    ? createEmptyCopilotAnalysisState()
    : existingAnalysisRaw ?? createEmptyCopilotAnalysisState();
  let analysisState: CopilotAnalysisState = {
    ...existingAnalysis,
    memory: existingAnalysis.memory ?? createEmptyMemory(),
  };

  const directCommand = Boolean(latestUserMessage?.content && isDirectCommand(latestUserMessage.content));
  let responseMessage = "";
  let commandExecuted = false;
  let workflowWithTasks: Workflow;
  let aiTasks: AITask[] = [];
  let updatedRequirementsText: string | null | undefined;

  const trace = baseTrace;

  if (directCommand && latestUserMessage) {
    commandExecuted = true;
    emitStatus("drafting", "Applying direct command to the workflow…");
    const command = parseCommand(latestUserMessage.content);
    const commandResult = executeCommand(currentWorkflow, command);
    if (!commandResult.success) {
      const error = new ApiError(400, commandResult.error ?? "Command failed");
      emitError(error.message, error.status);
      throw error;
    }
    workflowWithTasks = commandResult.workflow;
    responseMessage = commandResult.message ? `Done. ${commandResult.message}` : "Done.";

    if (commandResult.auditEvents.length) {
      await Promise.all(
        commandResult.auditEvents.map((event) =>
          logAudit({
            tenantId: session.tenantId,
            userId: session.userId,
            action: event.action,
            resourceType: "automation_version",
            resourceId: params.id,
            metadata: event.metadata,
          })
        )
      );
    }

    copilotDebug("copilot_chat.command_executed", {
      automationVersionId: params.id,
      command: command.type,
      message: responseMessage,
    });
  } else {
    try {
      const draftingTextBase =
        (intentSummary?.intent_summary && intentSummary.intent_summary.length > 0
          ? intentSummary.intent_summary
          : deterministicEditIntent) ?? "Updating your workflow…";
      const draftingStatusText = draftingTextBase.endsWith("…") ? draftingTextBase : `${draftingTextBase}…`;
      emitStatus("drafting", draftingStatusText, {
        intakeNotes: Boolean(intakeNotes),
        messages: normalizedMessages.length,
      });
      const draftingTrace = trace.phase("drafting");
      draftingTrace.event("phase.entered", { messageCount: normalizedMessages.length });

      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId,
          hypothesisId: "H3-llm",
          location: "copilot/chat/route.ts:runCopilotChat",
          message: "llm build starting",
          data: {
            userMessagePreview: userMessageContent.slice(0, 200),
            historyCount: normalizedMessages.length,
            hasIntakeNotes: Boolean(intakeNotes),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const buildSpan = draftingTrace.spanStart("llm.buildWorkflowFromChat", {
        messageCount: normalizedMessages.length,
        hasIntakeNotes: Boolean(intakeNotes),
      });

      const {
        workflow: aiGeneratedWorkflow,
        tasks: generatedTasks,
        chatResponse,
        followUpQuestion,
        sanitizationSummary,
        requirementsText: newRequirementsText,
      } = await buildWorkflowFromChat({
        userMessage: userMessageContent,
        currentWorkflow,
        currentBlueprint,
        conversationHistory: normalizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        requirementsText: detail.version.requirementsText ?? undefined,
        memorySummary: analysisState.memory?.summary_compact ?? null,
        memoryFacts: analysisState.memory?.facts ?? {},
        onStatus: ({ phase, text }) => emitStatus(phase, text),
      });
      updatedRequirementsText = newRequirementsText;

      draftingTrace.spanEnd(buildSpan, {
        tasksReturned: generatedTasks.length,
        stepsReturned: aiGeneratedWorkflow.steps?.length ?? 0,
      });

      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId,
          hypothesisId: "H3-llm",
          location: "copilot/chat/route.ts:runCopilotChat",
          message: "llm build completed",
          data: {
            chatResponsePreview: (chatResponse ?? "").slice(0, 160),
            followUpPreview: followUpQuestion?.slice(0, 160) ?? null,
            stepCount: aiGeneratedWorkflow.steps?.length ?? 0,
            taskCount: generatedTasks.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      copilotDebug("copilot_chat.post_build_metrics", {
        automationVersionId: params.id,
        userMessagePreview: userMessageContent.slice(0, 200),
        aiGeneratedStepCount: aiGeneratedWorkflow.steps?.length ?? 0,
        sanitizationSummary,
        tasksReturned: generatedTasks.length,
      });

      const numberedWorkflow = applyStepNumbers(aiGeneratedWorkflow);
      draftingTrace.event("workflow.stepNumbering.completed", { stepCount: numberedWorkflow.steps.length });
      emitStatus("structuring", "Adding edge cases + step numbers…", {
        stepCount: numberedWorkflow.steps.length,
      });
      aiTasks = generatedTasks;

      const taskSyncSpan = draftingTrace.spanStart("task.sync", { taskCount: aiTasks.length });
      const taskAssignments = await syncAutomationTasks({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        aiTasks,
        blueprint: numberedWorkflow,
        workflow: numberedWorkflow,
      });
      const tasksAssignedCount = Object.values(taskAssignments).reduce(
        (total, ids) => total + (ids?.length ?? 0),
        0
      );
      draftingTrace.spanEnd(taskSyncSpan, { tasksAssignedCount });

      workflowWithTasks = {
        ...numberedWorkflow,
        steps: numberedWorkflow.steps.map((step) => ({
          ...step,
          taskIds: Array.from(new Set(taskAssignments[step.id] ?? step.taskIds ?? [])),
        })),
      };
      const trimmedFollowUp = followUpQuestion?.trim();
      const nextFollowUp = chooseFollowUpQuestion({
        candidate: trimmedFollowUp,
        memory: analysisState.memory ?? createEmptyMemory(),
        workflow: workflowWithTasks,
        userMessage: userMessageContent,
      });

      analysisState = {
        ...analysisState,
        memory: refreshMemoryState({
          previous: analysisState.memory ?? createEmptyMemory(),
          workflow: workflowWithTasks,
          lastUserMessage: userMessageContent,
          appliedFollowUp: nextFollowUp,
        }),
      };

      responseMessage = nextFollowUp ? `${chatResponse} ${nextFollowUp}`.trim() : chatResponse;

      copilotDebug("copilot_chat.llm_response", {
        automationVersionId: params.id,
        chatResponse,
        followUpQuestion: trimmedFollowUp,
        stepCount: workflowWithTasks.steps.length,
        taskCount: aiTasks.length,
        sanitizationSummary,
      });
    } catch (error) {
      emitError(error instanceof Error ? error.message : "Failed to draft workflow");
      throw error;
    }
  }

  const validatedWorkflow = directCommand
    ? ({
        ...workflowWithTasks,
        status: workflowWithTasks.status ?? "Draft",
        updatedAt: new Date().toISOString(),
      } as Workflow)
    : WorkflowSchema.parse({
        ...workflowWithTasks,
        status: "Draft",
        updatedAt: new Date().toISOString(),
      });

  copilotDebug("copilot_chat.workflow_ready", {
    automationVersionId: params.id,
    stepCount: validatedWorkflow.steps?.length ?? 0,
    sectionCount: validatedWorkflow.sections?.length ?? 0,
  });
  const savingTextBase =
    (intentSummary?.intent_summary && intentSummary.intent_summary.length > 0
      ? intentSummary.intent_summary
      : deterministicEditIntent) ?? "Saving draft and messages…";
  const savingText = savingTextBase.endsWith("…") ? savingTextBase : `${savingTextBase}…`;
  emitStatus("saving", savingText, { stepCount: validatedWorkflow.steps?.length ?? 0 });
  const savingTrace = trace.phase("saving");
  const saveSpan = savingTrace.spanStart("workflow.save", { stepCount: validatedWorkflow.steps?.length ?? 0 });

  const updatePayload: any = {
    workflowJson: validatedWorkflow,
    updatedAt: new Date(),
  };

  if (commandExecuted === false && typeof updatedRequirementsText === "string") {
    const trimmed = updatedRequirementsText.trim();
    if (trimmed.length > 0) {
      updatePayload.requirementsText = trimmed;
    }
  }

  const [savedVersion] = await db
    .update(automationVersions)
    .set(updatePayload)
    .where(eq(automationVersions.id, params.id))
    .returning();

  savingTrace.spanEnd(saveSpan, { stepCount: validatedWorkflow.steps?.length ?? 0 });

  if (!savedVersion) {
    const error = new ApiError(500, "Failed to save workflow.");
    emitError(error.message, error.status);
    throw error;
  }

  revalidatePath(`/automations/${detail.automation?.id ?? savedVersion.automationId}`);

  const assistantMessage = await createCopilotMessage({
    tenantId: session.tenantId,
    automationVersionId: params.id,
    role: "assistant",
    content: responseMessage,
    createdBy: null,
  });
  savingTrace.event("assistantMessage.saved", { messageId: assistantMessage.id });

  if (clientMessageId) {
    let runResult = null;
    try {
      runResult = await createCopilotRun({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        clientMessageId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      });
    } catch (runError) {
      const isDuplicate =
        (runError as any)?.cause?.code === "23505" ||
        (runError instanceof Error && /duplicate key/i.test(runError.message));
      if (isDuplicate) {
        const existingRun = await getCopilotRunByClientMessageId({
          tenantId: session.tenantId,
          automationVersionId: params.id,
          clientMessageId,
        });
        if (existingRun) {
          const replay = await buildIdempotentResponse({
            run: existingRun,
            tenantId: session.tenantId,
            automationVersionId: params.id,
            detail,
          });
          callbacks?.onResult?.({ ...replay, runId } as CopilotRunResult);
          return { ...replay, runId } as CopilotRunResult;
        }
      }
      throw runError;
    }

    if (runResult && runResult.assistantMessageId !== assistantMessage.id) {
      const replay = await buildIdempotentResponse({
        run: runResult,
        tenantId: session.tenantId,
        automationVersionId: params.id,
        detail,
      });
      callbacks?.onResult?.({ ...replay, runId } as CopilotRunResult);
      return { ...replay, runId } as CopilotRunResult;
    }
  }

  copilotDebug("copilot_chat.persisted_message", {
    automationVersionId: params.id,
    messageId: assistantMessage.id,
    commandExecuted,
  });

  const augmentedMessages = [...normalizedMessages, { role: "assistant" as const, content: responseMessage }];
  const conversationPhase = determineConversationPhase(validatedWorkflow, augmentedMessages);
  const thinkingSteps = generateThinkingSteps(conversationPhase, latestUserMessage?.content, validatedWorkflow);

  if (!commandExecuted) {
    const diff = diffWorkflow(currentWorkflow, validatedWorkflow);
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.workflow.drafted",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "copilot",
        versionLabel: detail.version.versionLabel,
        summary: diff.summary,
        diff,
        changes: {
          stepsAdded: diff.stepsAdded?.length ?? 0,
          stepsRemoved: diff.stepsRemoved?.length ?? 0,
          stepsRenamed: diff.stepsRenamed?.length ?? 0,
          branchesAdded: diff.branchesAdded?.length ?? 0,
          branchesRemoved: diff.branchesRemoved?.length ?? 0,
        },
      },
    });
    savingTrace.event("audit.logged", { automationVersionId: params.id });
  }

  const completionState = getWorkflowCompletionState(validatedWorkflow);
  let progressSnapshot = null;
  try {
    progressSnapshot = await evaluateWorkflowProgress({
      workflow: validatedWorkflow,
      completionState,
      latestUserMessage: latestUserMessage?.content ?? null,
    });
  } catch (error) {
    copilotDebug("copilot_chat.progress_eval_failed", error instanceof Error ? error.message : error);
  }

  if (progressSnapshot) {
    analysisState = {
      ...analysisState,
      progress: progressSnapshot,
    };
  }

  analysisState = {
    ...analysisState,
    stage: analysisState.memory?.stage ?? "requirements",
    question_count: analysisState.memory?.question_count ?? 0,
    asked_questions_normalized: analysisState.memory?.asked_questions_normalized ?? [],
    facts: analysisState.memory?.facts ?? {},
    assumptions: analysisState.assumptions ?? [],
    lastUserMessageId: userMessage.id,
    lastAssistantMessageId: assistantMessage.id,
    workflowUpdatedAt: savedVersion.updatedAt?.toISOString ? savedVersion.updatedAt.toISOString() : new Date().toISOString(),
  };

  let analysisPersistenceError = false;
  const analysisPersistSpan = savingTrace.spanStart("analysis.persist", { automationVersionId: params.id });
  try {
    await upsertCopilotAnalysis({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      analysis: {
        ...analysisState,
        lastUpdatedAt: new Date().toISOString(),
      },
      workflowUpdatedAt: savedVersion.updatedAt ? new Date(savedVersion.updatedAt) : new Date(),
    });
    savingTrace.spanEnd(analysisPersistSpan, { ok: true });
  } catch (analysisError) {
    analysisPersistenceError = true;
    savingTrace.event("analysis.persist_failed", {
      automationVersionId: params.id,
      error: analysisError instanceof Error ? analysisError.message : String(analysisError),
    });
    logger.error("[copilot:chat] Failed to persist copilot analysis", {
      automationVersionId: params.id,
      error: analysisError,
      stack: analysisError instanceof Error ? analysisError.stack : null,
    });
    copilotDebug(
      "copilot_chat.progress_persist_failed",
      analysisError instanceof Error ? analysisError.message : analysisError
    );
  }

  const updatedTasks = await fetchTasksForVersion(session.tenantId, params.id);

  savingTrace.event("run.completed", {
    stepCount: validatedWorkflow.steps?.length ?? 0,
    persistenceError: analysisPersistenceError,
  });

  emitStatus("saving", "Run complete — preparing result…", {
    stepCount: validatedWorkflow.steps?.length ?? 0,
    persistenceError: analysisPersistenceError,
  });

  const result: CopilotRunResult = {
    runId,
    workflow: withLegacyWorkflowAlias(validatedWorkflow) as any,
    message: assistantMessage,
    tasks: updatedTasks,
    completion: completionState,
    progress: progressSnapshot,
    prompt: commandExecuted
      ? null
      : {
          system: SYSTEM_PROMPT,
          contextSummary,
          messageCount: normalizedMessages.length,
        },
    commandExecuted,
    thinkingSteps,
    conversationPhase,
    persistenceError: analysisPersistenceError,
  };

  callbacks?.onResult?.(result);
  return result;
}

async function buildIdempotentResponse(params: {
  run: CopilotRun;
  tenantId: string;
  automationVersionId: string;
  detail: AutomationVersionDetail;
}) {
  const workflowRow = await db
    .select({ workflowJson: automationVersions.workflowJson })
    .from(automationVersions)
    .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)))
    .limit(1);
  const workflow =
    workflowRow[0]?.workflowJson && typeof workflowRow[0].workflowJson === "object"
      ? (workflowRow[0].workflowJson as Workflow)
      : createEmptyWorkflowSpec();
  const messages = await listCopilotMessages({
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
  });
  const normalizedMessages = normalizeMessages(
    messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.role === "assistant" ? parseCopilotReply(message.content).displayText : message.content,
      }))
  );

  const assistantMessage =
    messages.find((message) => message.id === params.run.assistantMessageId) ??
    (await fetchAssistantMessage({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      assistantMessageId: params.run.assistantMessageId,
    }));

  if (!assistantMessage) {
    throw new ApiError(500, "Existing Copilot response not found for provided clientMessageId.");
  }

  const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
  const completionState = getWorkflowCompletionState(workflow);

  let progressSnapshot = null;
  try {
    progressSnapshot = await evaluateWorkflowProgress({
      workflow,
      completionState,
      latestUserMessage: latestUserMessage?.content ?? null,
    });
  } catch (error) {
    copilotDebug(
      "copilot_chat.progress_eval_failed_replay",
      error instanceof Error ? error.message : error
    );
  }

  const commandExecuted = false;
  const conversationPhase = determineConversationPhase(workflow, normalizedMessages);
  const thinkingSteps = generateThinkingSteps(conversationPhase, latestUserMessage?.content, workflow);
  const tasks = await fetchTasksForVersion(params.tenantId, params.automationVersionId);

  return {
    runId: params.run.clientMessageId,
    workflow: withLegacyWorkflowAlias(workflow),
    message: assistantMessage,
    tasks,
    completion: completionState,
    progress: progressSnapshot,
    prompt: commandExecuted
      ? null
      : {
          system: SYSTEM_PROMPT,
          contextSummary: buildConversationSummary(
            normalizedMessages,
            params.detail.version.intakeNotes ?? null
          ),
          messageCount: normalizedMessages.length,
        },
    commandExecuted,
    thinkingSteps,
    conversationPhase,
  };
}

async function fetchAssistantMessage(params: {
  tenantId: string;
  automationVersionId: string;
  assistantMessageId: string;
}) {
  const [message] = await db
    .select()
    .from(copilotMessages)
    .where(
      and(
        eq(copilotMessages.tenantId, params.tenantId),
        eq(copilotMessages.automationVersionId, params.automationVersionId),
        eq(copilotMessages.id, params.assistantMessageId)
      )
    )
    .limit(1);

  return message ?? null;
}

async function fetchTasksForVersion(tenantId: string, automationVersionId: string) {
  return db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.automationVersionId, automationVersionId)));
}

function normalizeMessages(messages: CopilotMessage[]): CopilotMessage[] {
  const trimmed = messages.slice(-MAX_MESSAGES).map((message) => {
    let content = message.content.trim();
    if (content.length > MAX_MESSAGE_CHARS) {
      content = `${content.slice(0, MAX_MESSAGE_CHARS)}…`;
    }
    return { ...message, content };
  });

  const totalChars = trimmed.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars <= MAX_TOTAL_CHARS) {
    return trimmed;
  }

  const result: CopilotMessage[] = [];
  let running = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const candidate = trimmed[index];
    if (running + candidate.content.length > MAX_TOTAL_CHARS) {
      break;
    }
    running += candidate.content.length;
    result.unshift(candidate);
  }

  return result.length > 0 ? result : trimmed.slice(-3);
}

function isOffTopic(content: string) {
  const lower = content.toLowerCase();
  const mentionsAutomation = MIN_AUTOMATION_KEYWORDS.some((keyword) => lower.includes(keyword));
  const clearlyOffTopic = OFF_TOPIC_KEYWORDS.some((keyword) => lower.includes(keyword));
  return !mentionsAutomation && clearlyOffTopic;
}

function buildConversationSummary(messages: CopilotMessage[], intakeNotes?: string | null) {
  const summaryParts: string[] = [];
  const userMessages = messages.filter((message) => message.role === "user");
  const clipped = userMessages.slice(-3);

  summaryParts.push("Latest user instructions:");
  clipped.forEach((message, index) => {
    summaryParts.push(`${index + 1}. ${message.content}`);
  });

  if (intakeNotes) {
    summaryParts.push("\nIntake notes:\n");
    summaryParts.push(intakeNotes.slice(0, 2000));
  }

  return summaryParts.join("\n");
}

type FollowUpChoiceArgs = {
  candidate?: string | null;
  memory: CopilotMemory;
  workflow: Workflow;
  userMessage: string;
};

function chooseFollowUpQuestion({ candidate, memory, workflow, userMessage }: FollowUpChoiceArgs): string | null {
  const trimmed = candidate?.trim();
  const normalizedCandidate = trimmed ? normalizeQuestionText(trimmed) : null;
  const reachedCap = memory.question_count >= 10;

  if (reachedCap) {
    return "This looks complete — want me to finalize or tweak anything?";
  }

  const mergedFacts = mergeFacts(memory.facts ?? {}, workflow, userMessage);
  const stage = computeStage(mergedFacts, memory.question_count);

  if (trimmed && normalizedCandidate && !memory.asked_questions_normalized.includes(normalizedCandidate)) {
    const assumptionCandidate = pickStageQuestion(stage, mergedFacts);
    if (assumptionCandidate) {
      const normalizedAssumption = normalizeQuestionText(assumptionCandidate);
      if (!memory.asked_questions_normalized.includes(normalizedAssumption)) {
        return assumptionCandidate;
      }
    }
    return trimmed;
  }

  const fallback = pickStageQuestion(stage, mergedFacts);
  if (!fallback) {
    return null;
  }
  const normalizedFallback = normalizeQuestionText(fallback);
  if (memory.asked_questions_normalized.includes(normalizedFallback)) {
    return null;
  }
  return fallback;
}

type RefreshMemoryArgs = {
  previous: CopilotMemory;
  workflow: Workflow;
  lastUserMessage: string;
  appliedFollowUp?: string | null;
};

function refreshMemoryState({ previous, workflow, lastUserMessage, appliedFollowUp }: RefreshMemoryArgs): CopilotMemory {
  const mergedFacts = mergeFacts(previous.facts ?? {}, workflow, lastUserMessage);
  const normalizedFollowUp = appliedFollowUp ? normalizeQuestionText(appliedFollowUp) : null;
  const newCount =
    appliedFollowUp && previous.question_count < 10 ? previous.question_count + 1 : previous.question_count;
  const nextStage = computeStage(mergedFacts, newCount);
  const asked = new Set(previous.asked_questions_normalized ?? []);
  if (normalizedFollowUp) {
    asked.add(normalizedFollowUp);
  }

  return {
    summary_compact: buildMemorySummary(workflow, mergedFacts, lastUserMessage, previous.summary_compact),
    facts: mergedFacts,
    question_count: newCount,
    asked_questions_normalized: Array.from(asked).slice(-30),
    stage: nextStage,
  };
}

function mergeFacts(existing: CopilotMemory["facts"], workflow: Workflow, lastUserMessage: string): CopilotMemory["facts"] {
  const facts: CopilotMemory["facts"] = { ...(existing ?? {}) };

  const lower = lastUserMessage.toLowerCase();
  if (/daily|every day/.test(lower)) {
    facts.trigger_cadence = facts.trigger_cadence ?? "daily";
  }
  if (/weekly/.test(lower)) {
    facts.trigger_cadence = facts.trigger_cadence ?? "weekly";
  }
  const timeMatch = lastUserMessage.match(/\b(\d{1,2})(:?(\d{2}))?\s?(am|pm)\b/i);
  if (timeMatch && !facts.trigger_time) {
    facts.trigger_time = timeMatch[0];
  }

  workflow.sections?.forEach((section) => {
    const content = section.content?.trim();
    if (!content) return;
    switch (section.key) {
      case "business_requirements":
        facts.primary_outcome = facts.primary_outcome ?? truncateText(content, 160);
        break;
      case "business_objectives":
        facts.primary_outcome = facts.primary_outcome ?? truncateText(content, 160);
        break;
      case "success_criteria":
        facts.success_criteria = facts.success_criteria ?? truncateText(content, 160);
        break;
      case "systems":
        facts.systems = facts.systems ?? content.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5);
        break;
      default:
        break;
    }
  });

  if (!facts.systems && workflow.steps?.length) {
    const systems = new Set<string>();
    workflow.steps.forEach((step) => {
      step.systemsInvolved?.forEach((system) => systems.add(system));
    });
    if (systems.size > 0) {
      facts.systems = Array.from(systems).slice(0, 5);
    }
  }

  if (!facts.storage_destination && workflow.summary) {
    const summaryLower = workflow.summary.toLowerCase();
    if (summaryLower.includes("sheet") || summaryLower.includes("excel")) {
      facts.storage_destination = "Google Sheets";
    }
  }

  if (!facts.samples) {
    const mentionsSamples = /invoice|receipt|ocr|pdf|document|template/i.test(lastUserMessage);
    facts.samples = mentionsSamples ? "required" : "skip";
  }

  return facts;
}

function computeStage(facts: CopilotMemory["facts"], questionCount: number): CopilotMemory["stage"] {
  if (questionCount >= 10) {
    return "done";
  }

  const hasRequirements = Boolean(facts.primary_outcome || facts.trigger_cadence || facts.trigger_time);
  const hasObjectives = Boolean(facts.primary_outcome);
  const hasSuccess = Boolean(facts.success_criteria);
  const hasSystems = Boolean(
    (facts.systems && facts.systems.length > 0) || facts.exception_policy || facts.human_review || facts.storage_destination
  );

  if (!hasRequirements) return "requirements";
  if (!hasObjectives) return "objectives";
  if (!hasSuccess) return "success";
  if (!hasSystems) return "systems";

  return facts.samples === "required" ? "samples" : "done";
}

function pickStageQuestion(stage: CopilotMemory["stage"], facts: CopilotMemory["facts"]): string | null {
  switch (stage) {
    case "requirements":
      return `I'm assuming this runs daily around 8am to ${facts.primary_outcome ?? "deliver the main result"} — okay?`;
    case "objectives":
      return `I'm assuming the business goal is ${facts.primary_outcome ?? "saving time"} — right?`;
    case "success":
      return "I'll target under 5% errors and finish within 10 minutes — sound right?";
    case "systems":
      return `I'll drop results into ${facts.storage_destination ?? "Google Sheets"} and notify ops on retries — good?`;
    case "samples":
      return "Do you want to share one sample file to calibrate?";
    default:
      return null;
  }
}

function buildMemorySummary(
  workflow: Workflow,
  facts: CopilotMemory["facts"],
  lastUserMessage: string,
  previous?: string | null
): string {
  const parts: string[] = [];
  const summary = workflow.summary?.trim() || previous || "";
  if (summary) {
    parts.push(truncateText(summary, 200));
  }
  if (facts.primary_outcome) {
    parts.push(`Outcome: ${truncateText(facts.primary_outcome, 160)}`);
  }
  if (facts.success_criteria) {
    parts.push(`Success: ${truncateText(facts.success_criteria, 160)}`);
  }
  if (facts.systems?.length) {
    parts.push(`Systems: ${facts.systems.slice(0, 5).join(", ")}`);
  }
  if (facts.storage_destination) {
    parts.push(`Destination: ${facts.storage_destination}`);
  }
  if (facts.trigger_cadence || facts.trigger_time) {
    parts.push(`Trigger: ${[facts.trigger_cadence, facts.trigger_time].filter(Boolean).join(" ")}`);
  }
  if (parts.length === 0) {
    parts.push(truncateText(lastUserMessage, 200));
  }
  return truncateText(parts.join(" | "), 1200);
}

function normalizeQuestionText(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, limit: number): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}


