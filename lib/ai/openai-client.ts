const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const MAX_CONTEXT_MESSAGES = 20;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class OpenAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIError";
  }
}

async function callChatCompletion(messages: ChatMessage[]): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new OpenAIError("Missing OPENAI_API_KEY");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new OpenAIError(
      `OpenAI request failed with status ${response.status}${errorText ? `: ${errorText}` : ""}`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new OpenAIError("OpenAI response missing content");
  }

  return content;
}

export async function generateCopilotReply(args: { messages: ChatMessage[] }): Promise<string> {
  const truncated =
    args.messages.length > MAX_CONTEXT_MESSAGES ? args.messages.slice(-MAX_CONTEXT_MESSAGES) : args.messages;
  return callChatCompletion(truncated);
}

