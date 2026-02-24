import type OpenAI from "openai";
import getOpenAIClient from "@/lib/ai/openai-client";

export type IntentSummary = {
  intent_summary: string;
  verb?: string;
  object?: string;
  systems?: string[];
  cadence?: string;
};

const SYSTEM_PROMPT = [
  "You produce ONLY strict JSON matching this TypeScript type:",
  "type IntentSummary = { intent_summary: string; verb?: string; object?: string; systems?: string[]; cadence?: string }",
  "Rules:",
  "- Focus on the DELTA requested in the latest user message. Describe what is being added/updated/changed now.",
  "- If hasExistingWorkflow=false (initial build), you may summarize the requested workflow; otherwise, DO NOT restate the whole workflow—only the requested change.",
  "- intent_summary <= 70 chars, concise, readable, action/progress phrasing (e.g., 'Adding PDF report generation', 'Updating schedule to 8am daily').",
  "- Do NOT truncate mid-word; drop trailing words if needed to stay under 70 chars.",
  "- Use verbs like 'Adding', 'Updating', 'Including', 'Changing'.",
  "- No filler or acknowledgements (no 'Got it', 'working on this', 'processing').",
  "- Do NOT include emails, phone numbers, URLs, IDs, credentials, or user-provided tokens",
  "- Avoid guessing; omit fields if unclear",
  "- systems max 4 entries, short names only (no URLs, no secrets)",
  "- Return ONLY JSON, no prose, no markdown, no comments",
].join("\n");

const REDACTIONS: Array<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]"],
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]"],
  [/\bhttps?:\/\/\S+/gi, "[redacted-url]"],
  [/\b[A-Za-z0-9]{24,}\b/g, "[redacted-token]"],
];

function redactInput(input: string): string {
  return REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), input);
}

function sanitizeSummary(candidate: IntentSummary): IntentSummary | null {
  if (!candidate || typeof candidate !== "object") return null;
  let intentSummary = typeof candidate.intent_summary === "string" ? candidate.intent_summary.trim() : "";
  if (!intentSummary) return null;
  intentSummary = intentSummary.replace(/^got it\s*[—–-]?\s*/i, "").trim();
  const cappedIntent = clampIntent(intentSummary, 70);
  if (!cappedIntent) return null;

  const safe: IntentSummary = { intent_summary: cappedIntent };

  if (candidate.verb && typeof candidate.verb === "string") {
    const value = candidate.verb.trim().slice(0, 30);
    if (value) safe.verb = value;
  }
  if (candidate.object && typeof candidate.object === "string") {
    const value = candidate.object.trim().slice(0, 80);
    if (value) safe.object = value;
  }
  if (Array.isArray(candidate.systems)) {
    const systems = candidate.systems
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 4)
      .map((item) => item.slice(0, 40));
    if (systems.length > 0) safe.systems = systems;
  }
  if (candidate.cadence && typeof candidate.cadence === "string") {
    const value = candidate.cadence.trim().slice(0, 40);
    if (value) safe.cadence = value;
  }

  return safe;
}

type IntentContext = {
  intakeNotes?: string;
  workflowSummary?: string;
  contextSummary?: string;
  hasExistingWorkflow?: boolean;
};

function clampIntent(value: string, limit = 70): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 40) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}

export async function generateIntentSummary(
  userMessage: string,
  context?: IntentContext
): Promise<IntentSummary | null> {
  const openai = (getOpenAIClient as unknown as () => OpenAI | null)();
  if (!openai) {
    console.debug("intent_summary.skipped", {
      reason: "openai_unavailable",
    });
    return null;
  }

  const redacted = redactInput(userMessage);
  const redactedIntake = context?.intakeNotes ? redactInput(context.intakeNotes) : undefined;
  const redactedWorkflow = context?.workflowSummary ? redactInput(context.workflowSummary) : undefined;
  const redactedContext = context?.contextSummary ? redactInput(context.contextSummary) : undefined;

  try {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Latest user request:\n${redacted}` },
    ];

    if (typeof context?.hasExistingWorkflow === "boolean") {
      messages.push({
        role: "user",
        content: `Has existing workflow: ${context.hasExistingWorkflow ? "true" : "false"}`,
      });
    }

    if (redactedWorkflow) {
      messages.push({
        role: "user",
        content: `Existing workflow (context only, do not restate unless initial build):\n${redactedWorkflow}`,
      });
    }

    if (redactedContext) {
      messages.push({ role: "user", content: redactedContext });
    }

    if (redactedIntake) {
      messages.push({ role: "user", content: `Intake notes:\n${redactedIntake}` });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_INTENT ?? "gpt-4o-mini",
      temperature: 0,
      messages,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.debug("intent_summary.failed", {
        reason: "json_parse_failed",
      });
      return null;
    }
    const sanitized = sanitizeSummary(parsed as IntentSummary);
    if (sanitized) return sanitized;
    console.debug("intent_summary.failed", {
      reason: "sanitize_failed",
    });
    return null;
  } catch (error) {
    console.debug("intent_summary.failed", {
      reason: "openai_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

