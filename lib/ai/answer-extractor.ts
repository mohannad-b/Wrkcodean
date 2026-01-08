import OpenAI from "openai";

export type ChecklistExtraction = {
  key: string;
  value?: string | null;
  confidence: number;
  evidence?: string | null;
};

const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const SYSTEM_PROMPT = [
  "You extract confirmations for checklist items from a single user message.",
  "Return ONLY strict JSON: { items: { key: string; value?: string | null; confidence: number; evidence?: string | null }[] }",
  "Rules:",
  "- Focus on whether the user confirmed or provided values for the requested checklist keys.",
  "- Use the provided checklist_keys and question_text to stay on-topic.",
  "- confidence is 0.0-1.0; only include keys you detect in the message.",
  "- value should be short (<= 80 chars) and sanitized (no secrets/PII beyond emails/phones already provided).",
  "- evidence is a short quote or normalized value supporting the extraction.",
  "- If nothing is confirmed, return { items: [] }.",
  "- No markdown, no code fences, JSON only.",
].join("\n");

function sanitize(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

export async function extractChecklistAnswers(params: {
  userMessage: string;
  checklistKeys: string[];
  questionText?: string | null;
  candidateKey?: string | null;
}): Promise<ChecklistExtraction[] | null> {
  if (!openai) return null;
  const { userMessage, checklistKeys, questionText, candidateKey } = params;

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify(
        {
          checklist_keys: checklistKeys,
          candidate_key: candidateKey ?? null,
          question_text: questionText ?? null,
          user_message: userMessage,
        },
        null,
        2
      ),
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_INTENT ?? "gpt-4o-mini",
      temperature: 0,
      messages,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { items?: ChecklistExtraction[] };
    if (!parsed || !Array.isArray(parsed.items)) return null;

    return parsed.items
      .map((item) => ({
        key: item.key,
        value: sanitize(item.value),
        confidence: typeof item.confidence === "number" ? item.confidence : 0,
        evidence: sanitize(item.evidence),
      }))
      .filter((item) => typeof item.key === "string" && item.key.trim().length > 0);
  } catch (error) {
    console.debug("answer_extractor.failed", {
      reason: "openai_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
