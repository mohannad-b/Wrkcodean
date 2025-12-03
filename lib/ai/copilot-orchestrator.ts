import type { Blueprint } from "@/lib/blueprint/types";
import type { BlueprintUpdates } from "@/lib/blueprint/ai-updates";
import type { CopilotMessage } from "@/db/schema";
import type { CopilotThinkingStep } from "@/types/copilot-thinking";
import {
  createEmptyCopilotAnalysisState,
  cloneCopilotAnalysisState,
  summarizeAnalysisForPrompt,
  type CopilotAnalysisState,
  type CopilotSectionsSnapshot,
  type CopilotSectionSnapshot,
  type CopilotHumanTouchpoint,
  type CopilotTodoItem,
  createEmptyReadiness,
} from "@/lib/blueprint/copilot-analysis";
import { callCopilotChat } from "./openai-client";
import { copilotDebug } from "./copilot-debug";
import { BLUEPRINT_SECTION_KEYS, BLUEPRINT_SECTION_TITLES, type BlueprintSectionKey } from "@/lib/blueprint/types";

type DbCopilotMessage = Pick<CopilotMessage, "role" | "content">;

type RunCopilotOrchestrationArgs = {
  blueprint: Blueprint;
  messages: DbCopilotMessage[];
  previousAnalysis?: CopilotAnalysisState | null;
  automationName?: string;
  automationStatus?: string;
};

type OrchestratorResult = {
  analysis: CopilotAnalysisState;
  blueprintUpdates: BlueprintUpdates | null;
  assistantDisplayText: string;
  thinkingSteps: CopilotThinkingStep[];
};

type SectionPatch = Partial<Omit<CopilotSectionSnapshot, "missingInfo">> & {
  textSummary?: string | null;
  missingInfo?: string[];
};

type PassOneResponse = {
  blueprintUpdates?: BlueprintUpdates | null;
  sections?: Partial<Record<BlueprintSectionKey, SectionPatch>>;
};

type PassTwoResponse = {
  sections?: Partial<Record<BlueprintSectionKey, SectionPatch>>;
};

type PassThreeResponse = {
  sections?: Partial<Record<BlueprintSectionKey, SectionPatch>>;
  humanTouchpoints?: CopilotHumanTouchpoint[];
  todos?: CopilotTodoItem[];
};

type PassFourResponse = {
  sections?: Partial<Record<BlueprintSectionKey, SectionPatch>>;
  readiness?: CopilotAnalysisState["readiness"];
  todos?: CopilotTodoItem[];
};

const MAX_CONTEXT_MESSAGES = 8;
const ANALYSIS_MODEL = process.env.COPILOT_ANALYSIS_MODEL ?? process.env.COPILOT_MODEL ?? "gpt-4.1-mini";
const PASS_CONFIG = {
  flow: { temperature: 0.15, maxTokens: 900 },
  objectives: { temperature: 0.2, maxTokens: 600 },
  touchpoints: { temperature: 0.25, maxTokens: 700 },
  readiness: { temperature: 0.2, maxTokens: 500 },
} as const;

const QUESTION_SECTION_PRIORITY: BlueprintSectionKey[] = [
  "business_objectives",
  "success_criteria",
  "business_requirements",
  "systems",
  "data_needs",
  "exceptions",
  "human_touchpoints",
];

const QUESTION_TODO_CATEGORY_PRIORITY: Array<CopilotTodoItem["category"]> = [
  "business_objectives",
  "success_criteria",
  "systems",
  "data_needs",
  "exceptions",
  "human_touchpoints",
];

const PASS_SYSTEM_PROMPT = `
You are the WRK Copilot analysis engine. Respond ONLY with valid JSON that matches the requested schema.
Infer missing details conservatively, label uncertainty via confidence levels, and keep text concise.
`.trim();

export async function runCopilotOrchestration(args: RunCopilotOrchestrationArgs): Promise<OrchestratorResult> {
  const baseAnalysis = args.previousAnalysis ? cloneCopilotAnalysisState(args.previousAnalysis) : createEmptyCopilotAnalysisState();
  const workingAnalysis = cloneCopilotAnalysisState(baseAnalysis);
  const highlights: string[] = [];

  let aggregatedUpdates: BlueprintUpdates | null = null;
  const thinkingSteps: CopilotThinkingStep[] = [];
  const thinkingContext = buildThinkingContext(args);

  const passOne = await runStructuredPass<PassOneResponse>(
    "flow_requirements",
    PASS_ONE_INSTRUCTIONS,
    buildPassContext({
      blueprint: args.blueprint,
      messages: args.messages,
      analysis: workingAnalysis,
      automationName: args.automationName,
      automationStatus: args.automationStatus,
    }),
    PASS_CONFIG.flow
  );
  if (passOne) {
    if (passOne.sections) {
      mergeSections(workingAnalysis.sections, passOne.sections);
    }
    if (passOne.blueprintUpdates) {
      aggregatedUpdates = mergeBlueprintUpdates(aggregatedUpdates, passOne.blueprintUpdates);
      highlights.push("Mapped the flow and filled in core requirements.");
    }
  }
  thinkingSteps.push({
    id: "flow_requirements",
    label: describeFlowThinkingStep(thinkingContext, passOne),
  });

  const passTwo = await runStructuredPass<PassTwoResponse>(
    "objectives_success",
    PASS_TWO_INSTRUCTIONS,
    buildPassContext({
      blueprint: args.blueprint,
      messages: args.messages,
      analysis: workingAnalysis,
      automationName: args.automationName,
      automationStatus: args.automationStatus,
    }),
    PASS_CONFIG.objectives
  );
  if (passTwo?.sections) {
    mergeSections(workingAnalysis.sections, passTwo.sections);
    highlights.push("Captured objectives and measurable success criteria.");
  }
  thinkingSteps.push({
    id: "objectives_success",
    label: describeObjectivesThinkingStep(thinkingContext, passTwo),
  });

  const passThree = await runStructuredPass<PassThreeResponse>(
    "human_touchpoints",
    PASS_THREE_INSTRUCTIONS,
    buildPassContext({
      blueprint: args.blueprint,
      messages: args.messages,
      analysis: workingAnalysis,
      automationName: args.automationName,
      automationStatus: args.automationStatus,
    }),
    PASS_CONFIG.touchpoints
  );
  if (passThree) {
    if (passThree.sections) {
      mergeSections(workingAnalysis.sections, passThree.sections);
    }
    if (passThree.humanTouchpoints?.length) {
      workingAnalysis.humanTouchpoints = mergeTouchpoints(workingAnalysis.humanTouchpoints, passThree.humanTouchpoints);
      highlights.push("Identified where humans need to review or intervene.");
    }
    if (passThree.todos?.length) {
      workingAnalysis.todos = mergeTodos(workingAnalysis.todos, passThree.todos);
    }
  }
  thinkingSteps.push({
    id: "human_touchpoints",
    label: describeHumanThinkingStep(thinkingContext, passThree),
  });

  const passFour = await runStructuredPass<PassFourResponse>(
    "readiness_check",
    PASS_FOUR_INSTRUCTIONS,
    buildPassContext({
      blueprint: args.blueprint,
      messages: args.messages,
      analysis: workingAnalysis,
      automationName: args.automationName,
      automationStatus: args.automationStatus,
    }),
    PASS_CONFIG.readiness,
    { salvageTruncated: true }
  );
  if (passFour) {
    if (passFour.sections) {
      mergeSections(workingAnalysis.sections, passFour.sections);
    }
    if (passFour.readiness) {
      workingAnalysis.readiness = normalizeReadiness(passFour.readiness, workingAnalysis.todos);
      highlights.push(`Readiness recalculated at ${workingAnalysis.readiness.score}/100.`);
    }
    if (passFour.todos?.length) {
      workingAnalysis.todos = mergeTodos(workingAnalysis.todos, passFour.todos);
    }
  }
  thinkingSteps.push({
    id: "readiness_check",
    label: describeReadinessThinkingStep(thinkingContext, passFour),
  });

  workingAnalysis.lastUpdatedAt = new Date().toISOString();

  const assistantDisplayText = composeAssistantDisplayText(highlights, workingAnalysis);

  return {
    analysis: workingAnalysis,
    blueprintUpdates: aggregatedUpdates,
    assistantDisplayText,
    thinkingSteps,
  };
}

type PassContext = {
  blueprintSummary: string;
  conversation: string;
  analysisSummary: string;
  automationName?: string;
  automationStatus?: string;
};

function buildPassContext(args: {
  blueprint: Blueprint;
  messages: DbCopilotMessage[];
  analysis: CopilotAnalysisState;
  automationName?: string;
  automationStatus?: string;
}): PassContext {
  return {
    blueprintSummary: summarizeBlueprintForPrompt(args.blueprint),
    conversation: formatConversationForPrompt(args.messages),
    analysisSummary: summarizeAnalysisForPrompt(args.analysis),
    automationName: args.automationName,
    automationStatus: args.automationStatus,
  };
}

async function runStructuredPass<T>(
  label: string,
  instructions: string,
  context: PassContext,
  config: { temperature: number; maxTokens: number },
  options?: { salvageTruncated?: boolean }
): Promise<T | null> {
  const userContent = [
    context.automationName ? `Automation: ${context.automationName}` : null,
    context.automationStatus ? `Status: ${context.automationStatus}` : null,
    `Current blueprint (JSON):\n${context.blueprintSummary}`,
    `Recent conversation:\n${context.conversation || "(no recent conversation)"}`,
    `Current analysis snapshot:\n${context.analysisSummary}`,
    instructions,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = [
    { role: "system", content: PASS_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ] as const;

  const raw = await callCopilotChat({
    messages: messages.map((message) => ({ ...message })),
    model: ANALYSIS_MODEL,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
  copilotDebug(`copilot.orchestrator.${label}.raw`, raw);

  let parsed = safeParseJson<T>(raw);
  if (!parsed && options?.salvageTruncated) {
    parsed = safeParsePossiblyTruncatedJson<T>(raw);
    if (parsed) {
      copilotDebug(`copilot.orchestrator.${label}.salvaged`, { reason: "truncated_json" });
    }
  }
  if (!parsed) {
    copilotDebug(`copilot.orchestrator.${label}.parse_failed`, { raw });
  }
  return parsed;
}

function mergeSections(target: CopilotSectionsSnapshot, patch: Partial<Record<BlueprintSectionKey, SectionPatch>>) {
  for (const key of Object.keys(patch) as BlueprintSectionKey[]) {
    if (!BLUEPRINT_SECTION_KEYS.includes(key)) {
      continue;
    }
    const incoming = patch[key];
    if (!incoming) {
      continue;
    }
    const existing = target[key];
    const missingInfo = sanitizeStringArray(incoming.missingInfo ?? existing.missingInfo);
    target[key] = {
      ...existing,
      ...incoming,
      missingInfo,
      textSummary: incoming.textSummary ?? existing.textSummary,
      confidence: incoming.confidence ?? existing.confidence,
      source: incoming.source ?? existing.source,
    };
  }
}

function mergeBlueprintUpdates(current: BlueprintUpdates | null, incoming: BlueprintUpdates | null): BlueprintUpdates | null {
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  return {
    summary: incoming.summary ?? current.summary,
    steps: incoming.steps && incoming.steps.length > 0 ? incoming.steps : current.steps,
    sections: { ...(current.sections ?? {}), ...(incoming.sections ?? {}) },
    assumptions: mergeArrays(current.assumptions ?? [], incoming.assumptions ?? []),
  };
}

function mergeTouchpoints(existing: CopilotHumanTouchpoint[], incoming: CopilotHumanTouchpoint[]): CopilotHumanTouchpoint[] {
  const seen = new Set<string>();
  const combined: CopilotHumanTouchpoint[] = [];

  const append = (touchpoint: CopilotHumanTouchpoint) => {
    const normalized: CopilotHumanTouchpoint = {
      description: touchpoint.description?.trim() ?? "",
      who: touchpoint.who?.trim() ?? "TBD",
      channel: normalizeChannel(touchpoint.channel),
      when: touchpoint.when?.trim() ?? "unspecified",
    };
    if (!normalized.description) {
      return;
    }
    const key = `${normalized.description}|${normalized.who}|${normalized.when}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    combined.push(normalized);
  };

  [...existing, ...incoming].forEach((touchpoint) => append(touchpoint));

  return combined;
}

function mergeTodos(existing: CopilotTodoItem[], incoming: CopilotTodoItem[]): CopilotTodoItem[] {
  const map = new Map<string, CopilotTodoItem>();
  for (const todo of existing) {
    map.set(todo.id, { ...todo });
  }
  for (const todo of incoming) {
    const id = todo.id || generateTodoId();
    const next: CopilotTodoItem = {
      id,
      category: todo.category ?? "other",
      description: todo.description ?? "",
      status: todo.status === "resolved" ? "resolved" : "open",
      blockingStateItem: todo.blockingStateItem,
    };
    if (!next.description) {
      continue;
    }
    const existingTodo = map.get(id);
    map.set(id, existingTodo ? { ...existingTodo, ...next } : next);
  }
  return Array.from(map.values());
}

function normalizeReadiness(readiness: CopilotAnalysisState["readiness"], todos: CopilotTodoItem[]) {
  const normalized = {
    ...createEmptyReadiness(),
    ...readiness,
    score: clampNumber(readiness.score ?? 0, 0, 100),
    stateItemsSatisfied: sanitizeStringArray(readiness.stateItemsSatisfied),
    stateItemsMissing: sanitizeStringArray(readiness.stateItemsMissing),
    blockingTodos: sanitizeStringArray(
      readiness.blockingTodos?.length ? readiness.blockingTodos : todos.filter((todo) => todo.status === "open").map((todo) => todo.id)
    ),
  };
  return normalized;
}

function composeAssistantDisplayText(highlights: string[], analysis: CopilotAnalysisState): string {
  const lines: string[] = [];
  const dedupedHighlights = Array.from(new Set(highlights.filter(Boolean))).slice(0, 2);
  for (const highlight of dedupedHighlights) {
    lines.push(`- ${highlight}`);
  }
  if (lines.length === 0) {
    lines.push("- Captured the latest context and refreshed the blueprint.");
  }

  const question = chooseNextUserQuestion(analysis);
  if (question) {
    lines.push(question);
  }

  return lines.join("\n");
}

export function chooseNextUserQuestion(analysis: CopilotAnalysisState): string | null {
  const todoQuestion = buildQuestionFromBlockingTodos(analysis);
  if (todoQuestion) {
    return todoQuestion;
  }
  const sectionQuestion = buildQuestionFromSections(analysis);
  if (sectionQuestion) {
    return sectionQuestion;
  }
  return null;
}

function buildQuestionFromBlockingTodos(analysis: CopilotAnalysisState): string | null {
  const blockingIds = analysis.readiness.blockingTodos ?? [];
  if (blockingIds.length === 0) {
    return null;
  }
  const todosById = new Map(analysis.todos.map((todo) => [todo.id, todo]));
  for (const category of QUESTION_TODO_CATEGORY_PRIORITY) {
    const matchingTodo = blockingIds
      .map((id) => todosById.get(id))
      .find((todo) => todo && todo.category === category && todo.description?.trim());
    if (matchingTodo) {
      return formatTodoQuestion(matchingTodo.description);
    }
  }
  for (const id of blockingIds) {
    const fallback = todosById.get(id);
    if (fallback?.description?.trim()) {
      return formatTodoQuestion(fallback.description);
    }
  }
  return null;
}

function formatTodoQuestion(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.endsWith("?")) {
    return trimmed;
  }
  const sentence = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  const lowercase = sentence.charAt(0).toLowerCase() + sentence.slice(1);
  return `Can you ${lowercase}?`;
}

function buildQuestionFromSections(analysis: CopilotAnalysisState): string | null {
  for (const key of QUESTION_SECTION_PRIORITY) {
    const section = analysis.sections[key];
    if (!section) {
      continue;
    }
    const missingPrompt = section.missingInfo.find((prompt) => prompt?.trim().length);
    if (missingPrompt) {
      return formatMissingInfoQuestion(missingPrompt);
    }
    if (section.confidence === "low") {
      return formatLowConfidenceQuestion(key);
    }
  }
  return null;
}

function formatMissingInfoQuestion(prompt: string): string {
  const cleaned = prompt.trim();
  if (!cleaned) {
    return "";
  }
  if (cleaned.endsWith("?")) {
    return cleaned;
  }
  const sentence = cleaned.endsWith(".") ? cleaned.slice(0, -1) : cleaned;
  return `To move this forward, can you ${lowercaseFirst(sentence)}?`;
}

function formatLowConfidenceQuestion(sectionKey: BlueprintSectionKey): string {
  const title = BLUEPRINT_SECTION_TITLES[sectionKey];
  return `Can you share more detail so we can firm up the ${title} section?`;
}

function lowercaseFirst(input: string): string {
  if (!input) {
    return input;
  }
  return input.charAt(0).toLowerCase() + input.slice(1);
}

function summarizeBlueprintForPrompt(blueprint: Blueprint): string {
  const summary = {
    summary: blueprint.summary,
    sections: blueprint.sections.reduce<Record<string, string>>((acc, section) => {
      if (section.content?.trim()) {
        acc[section.key] = section.content.trim();
      }
      return acc;
    }, {}),
    steps: blueprint.steps.slice(0, 12).map((step) => ({
      id: step.id,
      name: step.name,
      type: step.type,
      summary: step.summary,
      systemsInvolved: step.systemsInvolved,
      nextStepIds: step.nextStepIds,
    })),
  };
  return JSON.stringify(summary, null, 2);
}

function formatConversationForPrompt(messages: DbCopilotMessage[]): string {
  const window = messages.slice(-MAX_CONTEXT_MESSAGES);
  return window
    .map((message) => `${message.role.toUpperCase()}: ${truncate(message.content.trim(), 800)}`)
    .join("\n---\n");
}

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    const trimmed = input.trim();
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      return null;
    }
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
}

export function safeParsePossiblyTruncatedJson<T>(input: string): T | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    return null;
  }
  let inString = false;
  let escapeNext = false;
  let depth = 0;
  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      if (depth === 0) {
        return null;
      }
      depth -= 1;
      if (depth === 0) {
        const candidate = trimmed.slice(firstBrace, index + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function sanitizeStringArray(values?: string[]): string[] {
  if (!values) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .slice(0, 5)
    )
  );
}

function mergeArrays<T>(a: T[], b: T[]): T[] {
  return [...a, ...b];
}

function generateTodoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `todo_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeChannel(channel: string | undefined): CopilotHumanTouchpoint["channel"] {
  if (!channel) {
    return "other";
  }
  const normalized = channel.toLowerCase() as CopilotHumanTouchpoint["channel"];
  return ["email", "sms", "slack", "phone", "other"].includes(normalized) ? normalized : "other";
}

type ThinkingContext = {
  subject: string;
  latestUserSnippet?: string | null;
};

function buildThinkingContext(args: RunCopilotOrchestrationArgs): ThinkingContext {
  const latestUserSnippet = extractLatestUserSnippet(args.messages);
  const candidate =
    args.automationName?.trim() ||
    latestUserSnippet ||
    args.blueprint.summary?.trim() ||
    args.automationStatus ||
    "this workflow";

  return {
    subject: truncateForLabel(candidate, 80),
    latestUserSnippet,
  };
}

function describeFlowThinkingStep(context: ThinkingContext, pass: PassOneResponse | null): string {
  const summary = pass?.blueprintUpdates?.summary?.trim() ?? extractSectionSummary(pass?.sections);
  if (summary) {
    return ensureSentence(`Mapped flow and requirements: ${truncateForLabel(summary, 110)}`);
  }
  return ensureSentence(`Mapped flow and requirements for ${context.subject}`);
}

function describeObjectivesThinkingStep(context: ThinkingContext, pass: PassTwoResponse | null): string {
  const objectiveSummary = pass?.sections?.business_objectives?.textSummary?.trim();
  const successSummary = pass?.sections?.success_criteria?.textSummary?.trim();
  const detail = objectiveSummary ?? successSummary;
  if (detail) {
    return ensureSentence(`Captured objectives and success metrics: ${truncateForLabel(detail, 110)}`);
  }
  return ensureSentence(`Captured objectives and success metrics for ${context.subject}`);
}

function describeHumanThinkingStep(context: ThinkingContext, pass: PassThreeResponse | null): string {
  const touchpoint = pass?.humanTouchpoints?.find((item) => item.description?.trim())?.description?.trim();
  const sectionSummary = pass?.sections?.human_touchpoints?.textSummary?.trim();
  const detail = touchpoint ?? sectionSummary;
  if (detail) {
    return ensureSentence(`Identified human touchpoints: ${truncateForLabel(detail, 110)}`);
  }
  return ensureSentence(`Identified human reviews and compliance needs for ${context.subject}`);
}

function describeReadinessThinkingStep(context: ThinkingContext, pass: PassFourResponse | null): string {
  const score = pass?.readiness?.score;
  const flowSummary = pass?.sections?.flow_complete?.textSummary?.trim();
  const todo = pass?.todos?.find((item) => item.description?.trim())?.description?.trim();
  const detail = flowSummary ?? todo;
  const scoreText = typeof score === "number" ? `Scored readiness at ${score}/100` : "Scored readiness and blocking tasks";
  if (detail) {
    return ensureSentence(`${scoreText}: ${truncateForLabel(detail, 90)}`);
  }
  return ensureSentence(`${scoreText} for ${context.subject}`);
}

function extractSectionSummary(sections?: Partial<Record<BlueprintSectionKey, SectionPatch>>): string | null {
  if (!sections) {
    return null;
  }
  for (const key of Object.keys(sections) as BlueprintSectionKey[]) {
    const summary = sections[key]?.textSummary?.trim();
    if (summary) {
      return summary;
    }
  }
  return null;
}

function extractLatestUserSnippet(messages: DbCopilotMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }
    const snippet = extractLeadingClause(message.content);
    if (snippet) {
      return snippet;
    }
  }
  return null;
}

function extractLeadingClause(input?: string | null): string | null {
  if (!input) {
    return null;
  }
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  const newlineIndex = normalized.indexOf("\n");
  const trimmedToNewline = newlineIndex === -1 ? normalized : normalized.slice(0, newlineIndex);
  const punctuationIndex = trimmedToNewline.search(/[.?!]/);
  const clause = punctuationIndex === -1 ? trimmedToNewline : trimmedToNewline.slice(0, punctuationIndex);
  return clause.trim() || normalized;
}

function truncateForLabel(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function ensureSentence(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const PASS_ONE_INSTRUCTIONS = `
Pass 1 – Flow & Requirements Extraction
Tasks:
1. Update the workflow blueprint if the conversation adds new steps or dependencies.
2. Refresh the sections for business_requirements, systems, data_needs, and exceptions (include others if relevant).
3. For each updated section, include up to 3 short missingInfo questions we still need answered.

BlueprintUpdates requirements:
- Always use the canonical schema below. NEVER emit the legacy {"step": 1, "description": "..."} format.
- Step IDs must be stable, human-readable slugs (e.g., "step_kayak_scrape") so later passes can enrich them.
- Fill summary, goal, systemsInvolved, and dependsOnIds. Use dependsOnIds to show sequence (previous step when unsure).
- Sections keys must be one of the standard blueprint sections (business_requirements, systems, data_needs, exceptions, etc.).
- Include a blueprint-level summary when you can describe the overall automation in one sentence.

BlueprintUpdates schema:
{
  "summary": string | null,
  "steps": [
    {
      "id": "step_identifier",
      "title": "Short step name",
      "type": "Trigger" | "Action" | "Logic" | "Human",
      "summary": "One sentence describing what happens in this step",
      "goal": "Desired outcome or output of this step",
      "systemsInvolved": ["System A", "System B"],
      "dependsOnIds": ["preceding_step_id"]
    }
  ],
  "sections": {
    "<blueprint_section_key>": string | string[]
  },
  "assumptions": string[]
}

- If the blueprint already has steps, reuse their IDs when possible and enrich them instead of inventing a totally different flow.
- If it's the first draft, create 3-7 steps that cover the flow end-to-end.

Return JSON:
{
  "blueprintUpdates": <BlueprintUpdates or null>,
  "sections": {
    "<section_key>": {
      "textSummary": string | null,
      "confidence": "low" | "medium" | "high",
      "source": "user_input" | "ai_inferred" | "confirmed",
      "missingInfo": string[]
    }
  }
}
`.trim();

const PASS_TWO_INSTRUCTIONS = `
Pass 2 – Objectives & Success Criteria
Tasks:
1. Distill business objectives from the conversation + blueprint.
2. Translate success expectations into measurable criteria (volumes, SLAs, KPIs).

Return JSON:
{
  "sections": {
    "business_objectives": { ...CopilotSectionSnapshot },
    "success_criteria": { ...CopilotSectionSnapshot }
  }
}
`.trim();

const PASS_THREE_INSTRUCTIONS = `
Pass 3 – Human Touchpoints
Tasks:
1. Identify any human reviews/approvals or manual interventions and specify who + communication channel.
2. Create user-facing TODOs for missing systems access, templates, or playbooks tied to those touchpoints.
3. Update the human_touchpoints section summary.

Return JSON:
{
  "humanTouchpoints": [
    { "description": string, "who": string, "channel": "email"|"sms"|"slack"|"phone"|"other", "when": string }
  ],
  "todos": [
    { "id": string, "category": "systems_access"|"exceptions_mapping"|"data_mapping"|"human_touchpoints"|"requirements"|"other", "description": string, "status": "open"|"resolved", "blockingStateItem": string? }
  ],
  "sections": {
    "human_touchpoints": { ...CopilotSectionSnapshot }
  }
}
`.trim();

const PASS_FOUR_INSTRUCTIONS = `
Pass 4 – Readiness & Checklist
Tasks:
1. Evaluate each of the 8 blueprint sections and decide what is "ready to build".
2. Produce a readiness score from 0-100 with brief reasoning baked into the section summaries.
3. Specify which checklist/state items are satisfied vs missing.
4. Emit TODOs that would unblock the missing items.

Return JSON:
{
  "readiness": {
    "score": number,
    "stateItemsSatisfied": string[],
    "stateItemsMissing": string[],
    "blockingTodos": string[]
  },
  "todos": [ ...CopilotTodoItem ],
  "sections": {
    "flow_complete": { ...CopilotSectionSnapshot }
  }
}
`.trim();


