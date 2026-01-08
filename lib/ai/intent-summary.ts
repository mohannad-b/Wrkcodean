import OpenAI from "openai";

export type IntentSummary = {
  intent_summary: string;
  verb?: string;
  object?: string;
  systems?: string[];
  cadence?: string;
};

const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const SYSTEM_PROMPT = [
  "You produce ONLY strict JSON matching this TypeScript type:",
  "type IntentSummary = { intent_summary: string; verb?: string; object?: string; systems?: string[]; cadence?: string }",
  "Rules:",
  "- intent_summary <= 90 chars, concise, readable, action/progress phrasing",
  "- The intent_summary must read like an operator status update (e.g., 'Mapping your workflow to crawl Kayak for rental prices', 'Adding a daily 8am schedule', 'Syncing systems → Generating steps').",
  "- Do NOT output generic filler such as 'working on this', 'processing', 'reviewing', or 'got it'.",
  "- Prefer 'System A → System B → Outcome' phrasing when possible.",
  "- Use context from previous assistant prompt if provided to reflect what is being acted on.",
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
  const intentSummary = typeof candidate.intent_summary === "string" ? candidate.intent_summary.trim() : "";
  if (!intentSummary) return null;
  const cappedIntent = intentSummary.slice(0, 90);

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
  previousAssistantMessage?: string;
  intakeNotes?: string;
};

function truncateWithEllipsis(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function deriveDeterministicFallback(userMessage: string): IntentSummary {
  const message = userMessage ?? "";
  const lower = message.toLowerCase();

  const ensureAction = (text: string) => (text.endsWith("…") ? text : `${text}…`);

  const timeMatch = message.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)?\b/i);
  const retryCountMatch = message.match(/(\d+)\s*(?:x|times|attempts|retries?)/i);
  const retryCount = retryCountMatch ? retryCountMatch[1] : "3";
  const uploadTargetMatch =
    message.match(/upload(?:ing)?\s+(?:to\s+)?([A-Za-z0-9][\w-]{0,40})/i) ??
    message.match(/to\s+([A-Za-z0-9][\w-]{0,40})\s+for\s+upload/i);

  if (/retry|retries|failover|fallback/.test(lower)) {
    return {
      intent_summary: truncateWithEllipsis(ensureAction(`Adding retry policy (up to ${retryCount} attempts)`), 90),
    };
  }

  if (/daily|schedule/.test(lower) || timeMatch) {
    const timeText = timeMatch ? timeMatch[0] : "8am";
    return {
      intent_summary: truncateWithEllipsis(ensureAction(`Updating schedule (daily at ${timeText})`), 90),
    };
  }

  if (/notify|notification|email|slack|teams|sms|text/.test(lower)) {
    const channelMatch = lower.match(/email|slack|teams|sms|text|pagerduty|webhook/);
    const channel = channelMatch ? channelMatch[0] : "preferred channel";
    return {
      intent_summary: truncateWithEllipsis(ensureAction(`Adding notification step via ${channel}`), 90),
    };
  }

  if (/upload/.test(lower)) {
    const target = uploadTargetMatch?.[1];
    if (target) {
      return {
        intent_summary: truncateWithEllipsis(ensureAction(`Adding upload to ${target}`), 90),
      };
    }
    return {
      intent_summary: truncateWithEllipsis(ensureAction("Adding upload step"), 90),
    };
  }

  return {
    intent_summary: truncateWithEllipsis(
      ensureAction("Updating workflow based on your latest instructions"),
      90
    ),
  };
}

export async function generateIntentSummary(
  userMessage: string,
  context?: IntentContext
): Promise<IntentSummary | null> {
  const deterministicFallback = deriveDeterministicFallback(userMessage);
  if (!openai) {
    console.debug("intent_summary.deterministic_fallback", {
      reason: "openai_unavailable",
      intent: deterministicFallback.intent_summary,
    });
    return deterministicFallback;
  }

  const redacted = redactInput(userMessage);
  const redactedPrev = context?.previousAssistantMessage ? redactInput(context.previousAssistantMessage) : undefined;
  const redactedIntake = context?.intakeNotes ? redactInput(context.intakeNotes) : undefined;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_INTENT ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: redacted },
        redactedPrev ? { role: "user", content: `Previous assistant message:\n${redactedPrev}` } : null,
        redactedIntake ? { role: "user", content: `Intake notes:\n${redactedIntake}` } : null,
      ].filter(Boolean) as { role: "system" | "user"; content: string }[],
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.debug("intent_summary.deterministic_fallback", {
        reason: "json_parse_failed",
        intent: deterministicFallback.intent_summary,
      });
      return deterministicFallback;
    }
    const sanitized = sanitizeSummary(parsed as IntentSummary);
    if (sanitized) return sanitized;
    console.debug("intent_summary.deterministic_fallback", {
      reason: "sanitize_failed",
      intent: deterministicFallback.intent_summary,
    });
    return deterministicFallback;
  } catch (error) {
    console.debug("intent_summary.deterministic_fallback", {
      reason: "openai_error",
      error: error instanceof Error ? error.message : String(error),
      intent: deterministicFallback.intent_summary,
    });
    return deterministicFallback;
  }
}

