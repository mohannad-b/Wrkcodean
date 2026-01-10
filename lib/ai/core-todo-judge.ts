import OpenAI from "openai";
import type { CopilotTodoItem, CoreTodoKey } from "@/lib/workflows/copilot-analysis";

export const REQUIREMENTS_CATEGORIES = [
  "goal_success",
  "trigger_inputs",
  "outputs_destinations",
  "systems_access",
  "rules_edge_cases",
  "data_mapping",
  "human_in_loop",
  "volume_performance",
  "ops_monitoring",
] as const;

export type RequirementsCategory = (typeof REQUIREMENTS_CATEGORIES)[number];

export type RequirementsCoverageStatus = "covered" | "partial" | "missing" | "n_a";

export type RequirementsCategoryCoverage = Record<RequirementsCategory, RequirementsCoverageStatus>;

export type MissingRequirementCategory = {
  category: RequirementsCategory;
  missing_detail: string;
  why_it_matters: string;
};

export type NextQuestionFocus = {
  category: RequirementsCategory;
  intent: string;
};

export type CoreTodoJudgeTodo = {
  key: CoreTodoKey;
  status: "open" | "resolved";
  confidence: number;
  value: string | null;
  evidence: string | null;
};

export type CoreTodoJudgeResult = {
  todos: CoreTodoJudgeTodo[];
  should_ask_followup: boolean;
  followup_question?: string | null;
  followup_key?: CoreTodoKey | null;
  category_coverage?: RequirementsCategoryCoverage;
  missing_categories?: MissingRequirementCategory[];
  next_question_focus?: NextQuestionFocus | null;
};

type EvalParams = {
  automationVersionId: string;
  userMessage: string;
  conversationSummary: string;
  workflowSummary?: string | null;
  stepsSummary?: string | null;
  todos: CopilotTodoItem[];
  lastQuestionKey?: string | null;
  lastQuestionText?: string | null;
};

const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const SYSTEM_PROMPT = [
  "You are a strict JSON judge for core automation readiness todos AND requirements categories.",
  "You do NOT write user-facing questions. You only judge coverage and recommend the next category focus.",
  "Return ONLY strict JSON, no markdown, no code fences.",
  "Rules for core todos:",
  "- Always return all four todos with their explicit status.",
  "- Keys are only: business_requirements, business_objectives, success_criteria, systems.",
  "- status is open or resolved; always include confidence 0-1 and short evidence (<160 chars).",
  "- Resolve business_requirements if the workflow description is concrete (sequence, trigger/cadence, systems, outputs, human-in-loop if any). If parameters are missing, mark requirements resolved when the flow is clear and capture the missing parameter in missing_categories instead of keeping it open.",
  "- business_objectives is inference-first: infer WHY the automation exists (monitoring, reporting, pricing decisions, operational handoff, compliance, notifications, downstream action, etc.). Never ask the user about “business objective(s)”, “objective(s)”, “primary business goal”, “business goal”, or close variants. If objective confidence ≥ 0.6, resolve it with a short inferred value (<=200 chars) and evidence (<=160 chars).",
  "- success_criteria gaps should be captured in missing_categories; do not output a user question.",
  "- Prefer resolving over re-asking if the answer is implicitly present. Never repeat last_question_text.",
  "- Treat trigger_inputs as covered when cadence/time is present anywhere in conversation_summary, workflow_summary, steps_summary, or implied in todos; do NOT mark trigger_inputs missing in that case.",
  "- Only one follow-up decision flag max; set should_ask_followup=false if everything is resolved.",
  "- followup_question must be null; followup_key must be null.",
  "",
  "Requirements categories to score (covered | partial | missing | n_a):",
  "- goal_success (goal + how we know it worked)",
  "- trigger_inputs (trigger, cadence, input source)",
  "- outputs_destinations (where results go + format)",
  "- systems_access (systems involved + access/auth)",
  "- rules_edge_cases (filters, dedupe, retries, exceptions)",
  "- data_mapping (fields/columns, IDs, transforms)",
  "- human_in_loop (approvals/review/notifications)",
  "- volume_performance (volume, SLAs, rate limits)",
  "- ops_monitoring (alerts, failure policy, ownership)",
  "",
  "Output requirements:",
  "- category_coverage: map every category to covered|partial|missing|n_a.",
  "- missing_categories: array of objects {category, missing_detail, why_it_matters}. Use n_a only when category truly irrelevant.",
  "- next_question_focus: choose ONE category with an intent string describing what to clarify next (not a question). Pick the one most blocking execution.",
  "- The judge NEVER writes the user-facing question; followup_question must be null.",
  "- If all core todos are resolved, followup_question must be null.",
].join("\n");

const CORE_TODO_ENUM = ["business_requirements", "business_objectives", "success_criteria", "systems"] as const;
const REQUIREMENTS_CATEGORY_ENUM = REQUIREMENTS_CATEGORIES as unknown as string[];

const CORE_TODO_JUDGE_SCHEMA = {
  name: "core_todo_judge",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "todos",
      "should_ask_followup",
      "followup_question",
      "followup_key",
      "category_coverage",
      "missing_categories",
      "next_question_focus",
    ],
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "status", "confidence", "value", "evidence"],
          properties: {
            key: { type: "string", enum: CORE_TODO_ENUM as unknown as string[] },
            status: { type: "string", enum: ["open", "resolved"] },
            confidence: { type: "number" },
            value: { type: ["string", "null"], maxLength: 200 },
            evidence: { type: ["string", "null"], maxLength: 160 },
          },
        },
      },
      should_ask_followup: { type: "boolean" },
      followup_question: { type: ["string", "null"] },
      followup_key: {
        anyOf: [{ type: "null" }, { type: "string", enum: CORE_TODO_ENUM as unknown as string[] }],
      },
      category_coverage: {
        type: "object",
        additionalProperties: false,
        required: REQUIREMENTS_CATEGORY_ENUM,
        properties: REQUIREMENTS_CATEGORY_ENUM.reduce(
          (acc, key) => ({
            ...acc,
            [key]: { type: "string", enum: ["covered", "partial", "missing", "n_a"] },
          }),
          {} as Record<string, unknown>
        ),
      },
      missing_categories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "missing_detail", "why_it_matters"],
          properties: {
            category: { type: "string", enum: REQUIREMENTS_CATEGORY_ENUM },
            missing_detail: { type: "string", maxLength: 240 },
            why_it_matters: { type: "string", maxLength: 240 },
          },
        },
      },
      next_question_focus: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["category", "intent"],
            properties: {
              category: { type: "string", enum: REQUIREMENTS_CATEGORY_ENUM },
              intent: { type: "string", maxLength: 240 },
            },
          },
        ],
      },
    },
  },
  strict: true,
} as const;

function sanitize(value: string | null | undefined, limit = 200): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
}

function hasTriggerInfo(params: EvalParams): boolean {
  const sources = [
    params.userMessage,
    params.conversationSummary,
    params.workflowSummary ?? "",
    params.stepsSummary ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bdaily\b|\bweekly\b|\bevery\b|\bcron\b|\bschedule\b|\b9am\b|\b10am\b|\bpm\b|\bam\b/.test(sources);
}

export async function evaluateCoreTodos(params: EvalParams): Promise<CoreTodoJudgeResult | null> {
  if (!openai) return null;

  const payload = {
    automation_version_id: params.automationVersionId,
    user_message: params.userMessage,
    conversation_summary: params.conversationSummary,
    workflow_summary: params.workflowSummary ?? null,
    steps_summary: params.stepsSummary ?? null,
    todos: (params.todos ?? []).map((todo) => ({
      key: todo.key ?? todo.id,
      status: todo.status,
      value: todo.value ?? null,
      evidence: todo.evidence ?? null,
      confidence: todo.confidence ?? 0,
    })),
    last_question_key: params.lastQuestionKey ?? null,
    last_question_text: params.lastQuestionText ?? null,
  };

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_INTENT ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_schema", json_schema: CORE_TODO_JUDGE_SCHEMA },
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.trim();
    let parsed: CoreTodoJudgeResult | null = null;
    try {
      parsed = JSON.parse(cleaned) as CoreTodoJudgeResult;
    } catch {
      console.debug("core_todo_judge.failed", { reason: "parse_error", cleaned });
      return null;
    }
    if (!parsed || !Array.isArray(parsed.todos)) {
      console.debug("core_todo_judge.failed", { reason: "invalid_shape" });
      return null;
    }

    const normalizedTodos = parsed.todos
      .map((todo) => {
        const status: "open" | "resolved" = todo.status === "resolved" ? "resolved" : "open";
        return {
          key: todo.key as CoreTodoKey,
          status,
          confidence: Math.min(Math.max(typeof todo.confidence === "number" ? todo.confidence : 0, 0), 1),
          value: sanitize(todo.value, 200),
          evidence: sanitize(todo.evidence, 160),
        };
      })
      .filter((todo) => todo.key && typeof todo.key === "string")
      .map((todo) => ({
        ...todo,
        value: todo.value ?? null,
        evidence: todo.evidence ?? null,
      }));

    const baseCoverage: RequirementsCategoryCoverage = REQUIREMENTS_CATEGORIES.reduce((acc, key) => {
      acc[key] = "missing";
      return acc;
    }, {} as RequirementsCategoryCoverage);

    const parsedCoverage = parsed.category_coverage ?? {};
    const normalizedCoverage: RequirementsCategoryCoverage = { ...baseCoverage };
    REQUIREMENTS_CATEGORIES.forEach((category) => {
      const status = (parsedCoverage as any)[category];
      if (status === "covered" || status === "partial" || status === "missing" || status === "n_a") {
        normalizedCoverage[category] = status;
      }
    });

    if (hasTriggerInfo(params)) {
      normalizedCoverage["trigger_inputs"] = "covered";
    }

    const normalizedMissing: MissingRequirementCategory[] = Array.isArray(parsed.missing_categories)
      ? parsed.missing_categories
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const category = (item as any).category;
            const missing_detail = sanitize((item as any).missing_detail, 240);
            const why_it_matters = sanitize((item as any).why_it_matters, 240);
            if (
              !REQUIREMENTS_CATEGORIES.includes(category as RequirementsCategory) ||
              !missing_detail ||
              !why_it_matters
            ) {
              return null;
            }
            return { category, missing_detail, why_it_matters } as MissingRequirementCategory;
          })
          .filter(Boolean) as MissingRequirementCategory[]
      : [];

    const filteredMissing = normalizedMissing.filter((item) => {
      if (item.category === "trigger_inputs" && normalizedCoverage["trigger_inputs"] === "covered") {
        return false;
      }
      return true;
    });

    const parsedFocus = parsed.next_question_focus;
    const normalizedFocus: NextQuestionFocus | null =
      parsedFocus &&
      typeof parsedFocus === "object" &&
      parsedFocus !== null &&
      REQUIREMENTS_CATEGORIES.includes((parsedFocus as any).category as RequirementsCategory) &&
      sanitize((parsedFocus as any).intent, 240)
        ? {
            category: (parsedFocus as any).category as RequirementsCategory,
            intent: sanitize((parsedFocus as any).intent, 240)!,
          }
        : null;

    return {
      todos: normalizedTodos,
      should_ask_followup: Boolean(parsed.should_ask_followup),
      followup_question: null,
      followup_key: null,
      category_coverage: normalizedCoverage,
      missing_categories: filteredMissing,
      next_question_focus: normalizedFocus,
    };
  } catch (error) {
    console.debug("core_todo_judge.failed", {
      reason: "openai_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
