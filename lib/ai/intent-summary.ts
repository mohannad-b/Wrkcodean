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
  "- intent_summary <= 90 chars, concise, readable",
  "- Prefer 'System A → System B → Outcome' phrasing when possible",
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

export async function generateIntentSummary(userMessage: string): Promise<IntentSummary | null> {
  if (!openai) return null;

  const redacted = redactInput(userMessage);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_INTENT ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: redacted },
      ],
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }
    return sanitizeSummary(parsed as IntentSummary) ?? null;
  } catch {
    return null;
  }
}

