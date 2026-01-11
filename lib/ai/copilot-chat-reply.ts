import OpenAI from "openai";

type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export type GenerateCopilotChatReplyArgs = {
  userMessage: string;
  conversationHistory: ChatHistoryItem[];
  knownFactsHint?: string | null;
  requirementsStatusHint?: string | null;
  followUpMode?: "technical_opt_in" | null;
};

export type GenerateCopilotChatReplyResult = {
  chatResponse: string;
  followUpQuestion: string | null;
};

const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const SYSTEM_PROMPT = [
  "You are WRK Copilot, an automation design assistant.",
  "Draft a concise, friendly reply (2-3 sentences) that acknowledges the latest user message and moves the conversation forward.",
  "Return ONLY strict JSON matching this schema:",
  '{ "chatResponse": string, "followUpQuestion": string | null }',
  "Rules:",
  "- LLM-first follow-up: include at most ONE follow-up question in followUpQuestion, or null if none.",
  "- No staged/canned questions. Keep it natural.",
  '- If you ask a follow-up (and followUpMode is not "technical_opt_in"), append an invitation for other requirements in the same question.',
  "- Do not repeat questions already answered in the known facts or requirements hints.",
  "- Keep it short; avoid markdown, lists, or code fences.",
  "- Never include emails, phone numbers, URLs, tokens, or IDs in the response.",
].join("\n");

function buildContext(args: GenerateCopilotChatReplyArgs): string {
  const history = args.conversationHistory
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
    .join("\n");

  const facts = args.knownFactsHint ? `Known facts:\n${args.knownFactsHint}\n` : "";
  const requirements = args.requirementsStatusHint ? `Requirements status:\n${args.requirementsStatusHint}\n` : "";
  const mode =
    args.followUpMode === "technical_opt_in"
      ? "Follow-up must focus on getting technical opt-in/consent before technical details."
      : "Follow-up should include an 'other requirements' invitation if you ask a question.";

  return [
    "Conversation (trimmed):",
    history || "(no prior messages)",
    "",
    "Latest user message:",
    args.userMessage,
    "",
    facts || "",
    requirements || "",
    mode,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateCopilotChatReply(
  args: GenerateCopilotChatReplyArgs
): Promise<GenerateCopilotChatReplyResult | null> {
  if (!openai) {
    return null;
  }

  const prompt = buildContext(args);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.COPILOT_CHAT_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw.trim()) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const chatResponse = typeof parsed.chatResponse === "string" ? parsed.chatResponse.trim() : "";
    const followUpQuestion =
      typeof parsed.followUpQuestion === "string" && parsed.followUpQuestion.trim().length > 0
        ? parsed.followUpQuestion.trim()
        : null;

    if (!chatResponse) return null;

    return { chatResponse, followUpQuestion };
  } catch (error) {
    console.debug("generateCopilotChatReply.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
