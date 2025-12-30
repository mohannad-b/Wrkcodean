import OpenAI from "openai";
import { z } from "zod";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { getBlueprintCompletionState, type BlueprintCompletionState } from "@/lib/workflows/completion";
import type { Blueprint } from "@/lib/workflows/types";
import {
  BLUEPRINT_PROGRESS_KEY_ORDER,
  BLUEPRINT_SECTION_TITLES,
  type BlueprintProgressKey,
  type BlueprintSectionKey,
} from "@/lib/workflows/types";
import type {
  BlueprintProgressSnapshot,
  BlueprintSectionProgressInsight,
  BlueprintSectionProgressStatus,
} from "@/lib/workflows/copilot-analysis";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROGRESS_RESPONSE_SCHEMA = z.object({
  sections: z.array(z.record(z.string(), z.any())).min(1),
  overallScore: z.number().min(0).max(1).default(0),
  missingInformation: z.array(z.string()).optional(),
});

type ParsedProgressResponse = z.infer<typeof PROGRESS_RESPONSE_SCHEMA>;

export interface EvaluateBlueprintProgressArgs {
  blueprint?: Blueprint;
  workflow?: Blueprint;
  completionState?: BlueprintCompletionState;
  latestUserMessage?: string | null;
  maxStepSamples?: number;
}

const DEFAULT_MODEL = process.env.OPENAI_BLUEPRINT_PROGRESS_MODEL ?? "gpt-4o-mini";
const STEP_SAMPLE_DEFAULT = 14;

const STATUS_VALUES: BlueprintSectionProgressStatus[] = ["not_started", "in_progress", "complete"];

const STATUS_THRESHOLDS: Record<BlueprintSectionProgressStatus, number> = {
  not_started: 0.35,
  in_progress: 0.8,
  complete: 1,
};

const SECTION_NAME_LOOKUP = (() => {
  const map = new Map<string, BlueprintProgressKey>();
  map.set("overview", "overview");
  Object.entries(BLUEPRINT_SECTION_TITLES).forEach(([key, title]) => {
    map.set(key.toLowerCase(), key as BlueprintSectionKey);
    map.set(title.toLowerCase(), key as BlueprintSectionKey);
  });
  return map;
})();

export async function evaluateBlueprintProgress(
  args: EvaluateBlueprintProgressArgs
): Promise<BlueprintProgressSnapshot | null> {
  const blueprint = args.workflow ?? args.blueprint;
  const { latestUserMessage, maxStepSamples = STEP_SAMPLE_DEFAULT } = args;
  if (!blueprint) {
    return null;
  }
  if (!process.env.OPENAI_API_KEY) {
    copilotDebug("progress.eval.skipped", "OPENAI_API_KEY missing");
    return null;
  }

  const completion = args.completionState ?? getBlueprintCompletionState(blueprint);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    blueprint,
    completion,
    latestUserMessage,
    maxStepSamples,
  });

  try {
    const completionResult = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const responseContent = completionResult.choices?.[0]?.message?.content;
    if (!responseContent) {
      throw new Error("LLM returned empty progress response");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseContent);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    const parseResult = PROGRESS_RESPONSE_SCHEMA.safeParse(parsedJson);
    if (!parseResult.success) {
      throw new Error(`Schema validation failed: ${parseResult.error.message}`);
    }

    const parsed = parseResult.data as ParsedProgressResponse;
    const snapshot = normalizeProgressSnapshot(parsed);
    return snapshot;
  } catch (error) {
    copilotDebug("progress.eval.failed", error instanceof Error ? error.message : error);
    return null;
  }
}

function buildSystemPrompt(): string {
  return `
You are WRK's senior process engineer. Audit automation blueprints and decide if each requirement section is ready for the build team.

Scoring rules:
- Score ranges 0-1. Use 0.0 when no signal, 1.0 when fully ready.
- "not_started": score < 0.25 or rationale indicates missing context.
- "in_progress": 0.25 ≤ score < 0.75.
- "complete": ≥ 0.75 AND rationale states why the build team has what they need.
- It's OK for exceptions/human touchpoints to be "complete" even if absent, as long as you explain why they are unnecessary.
- Prefer concise rationales highlighting concrete evidence (steps, systems, human owners, data, approvals).

Return valid JSON only with { "sections": [...], "overallScore": number, "missingInformation": [] }.
`.trim();
}

function buildUserPrompt(params: {
  blueprint: Blueprint;
  completion: BlueprintCompletionState;
  latestUserMessage?: string | null;
  maxStepSamples: number;
}): string {
  const { blueprint, completion, latestUserMessage, maxStepSamples } = params;
  const sectionsSummary = blueprint.sections
    .map((section) => {
      const content = section.content?.trim() || "MISSING";
      const snippet = content.length > 500 ? `${content.slice(0, 500)}…` : content;
      return `- ${section.title}: ${snippet}`;
    })
    .join("\n");

  const sampledSteps = blueprint.steps.slice(0, maxStepSamples);
  const remainingSteps = Math.max(0, blueprint.steps.length - sampledSteps.length);
  const stepSummaryLines = sampledSteps
    .map((step, index) => {
      const systems = step.systemsInvolved.length > 0 ? step.systemsInvolved.join(", ") : "Unknown";
      return `${index + 1}. [${step.type}] ${step.stepNumber || step.name} — ${step.summary || "No summary"} | Goal: ${step.goalOutcome || "Unknown"} | Systems: ${systems} | Responsibility: ${step.responsibility}`;
    })
    .join("\n");

  const stats = [
    `Total steps: ${blueprint.steps.length}`,
    `Triggers: ${blueprint.steps.filter((step) => step.type === "Trigger").length}`,
    `Actions: ${blueprint.steps.filter((step) => step.type === "Action").length}`,
    `Decisions: ${blueprint.steps.filter((step) => step.type === "Decision").length}`,
    `Exceptions: ${blueprint.steps.filter((step) => step.type === "Exception").length}`,
    `Human steps: ${
      blueprint.steps.filter(
        (step) => step.type === "Human" || step.responsibility === "HumanReview" || step.responsibility === "Approval"
      ).length
    }`,
  ];

  const completionStats = [
    `Completion score: ${completion.score}`,
    `Summary complete: ${completion.summaryComplete}`,
    `Has trigger: ${completion.hasTrigger}`,
    `Has action: ${completion.hasAction}`,
    `Step depth: ${completion.stepCoverage}`,
  ];

  const latestNote = latestUserMessage ? `Latest user message: ${latestUserMessage}` : "Latest user message: N/A";

  return `
${latestNote}

Blueprint summary:
${blueprint.summary || "MISSING"}

Sections:
${sectionsSummary}

Steps (showing up to ${maxStepSamples}${remainingSteps > 0 ? `, +${remainingSteps} more` : ""}):
${stepSummaryLines || "No steps defined"}

Structural stats:
${stats.join(", ")}

Heuristic completion metrics:
${completionStats.join(", ")}

Decide readiness for each section plus overall score.
`.trim();
}

function normalizeProgressSnapshot(input: ParsedProgressResponse): BlueprintProgressSnapshot {
  const now = new Date().toISOString();
  const sectionsMap = new Map<BlueprintProgressKey, BlueprintSectionProgressInsight>();

  input.sections.forEach((rawSection) => {
    const resolvedKey = resolveProgressKey(rawSection);
    if (!resolvedKey) {
      return;
    }
    const score = clamp(asNumber(rawSection.score));
    const status = coerceStatus(rawSection.status, score);
    const rationale = typeof rawSection.rationale === "string" && rawSection.rationale.trim().length > 0
      ? rawSection.rationale.trim()
      : "LLM did not provide a rationale.";
    const missingData = Array.isArray(rawSection.missingData)
      ? rawSection.missingData.map((entry) => `${entry}`.trim()).filter(Boolean)
      : undefined;

    sectionsMap.set(resolvedKey, {
      key: resolvedKey,
      score,
      status,
      rationale,
      missingData,
    });
  });

  BLUEPRINT_PROGRESS_KEY_ORDER.forEach((key) => {
    if (sectionsMap.has(key)) {
      return;
    }
    sectionsMap.set(
      key,
      fallbackSectionInsight(key, key === "overview" ? 0 : 0, "not_started", "No assessment returned from model.")
    );
  });

  return {
    assessedAt: now,
    overallScore: clamp(input.overallScore),
    missingInformation: input.missingInformation ?? [],
    sections: Array.from(sectionsMap.values()),
  };
}

function fallbackSectionInsight(
  key: BlueprintProgressKey,
  score: number,
  status: BlueprintSectionProgressStatus,
  rationale: string
): BlueprintSectionProgressInsight {
  return {
    key,
    score: clamp(score),
    status,
    rationale,
  };
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(3));
}

export function deriveStatusFromScore(score: number): BlueprintSectionProgressStatus {
  if (score >= STATUS_THRESHOLDS.complete) {
    return "complete";
  }
  if (score >= STATUS_THRESHOLDS.in_progress) {
    return "in_progress";
  }
  return "not_started";
}

function resolveProgressKey(section: Record<string, unknown>): BlueprintProgressKey | null {
  const possible = [
    section.key,
    section.section,
    section.label,
    section.title,
  ];

  for (const candidate of possible) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      const match = SECTION_NAME_LOOKUP.get(normalized);
      if (match) {
        return match;
      }
      if (normalized.endsWith("_complete") && normalized !== "flow_complete") {
        const stripped = normalized.replace(/_complete$/, "");
        const fallback = SECTION_NAME_LOOKUP.get(stripped);
        if (fallback) {
          return fallback;
        }
      }
    }
  }

  return null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function coerceStatus(value: unknown, score: number): BlueprintSectionProgressStatus {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const match = STATUS_VALUES.find((status) => status === normalized);
    if (match) {
      return match;
    }
  }
  return deriveStatusFromScore(score);
}

