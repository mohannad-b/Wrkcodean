import { buildCopilotSystemPrompt } from "./prompts";
import { copilotDebug } from "./copilot-debug";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const MAX_CONTEXT_MESSAGES = 20;
const COPILOT_MODEL = process.env.COPILOT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const COPILOT_MAX_TOKENS = sanitizeNumber(process.env.COPILOT_MAX_TOKENS, 768);
const COPILOT_TEMPERATURE = sanitizeNumber(process.env.COPILOT_TEMPERATURE, 0.4);

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CopilotDbMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionParams = {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
};

export class OpenAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIError";
  }
}

async function callChatCompletion(params: ChatCompletionParams): Promise<string> {
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
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
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

  copilotDebug("openai.raw_content", content);

  return content;
}

type GenerateCopilotReplyArgs = {
  dbMessages: CopilotDbMessage[];
  automationName?: string;
  automationStatus?: string;
};

export async function generateCopilotReply({
  dbMessages,
  automationName,
  automationStatus,
}: GenerateCopilotReplyArgs): Promise<string> {
  const systemPrompt = buildCopilotSystemPrompt({ automationName, automationStatus });
  const limitedMessages = limitContext(dbMessages);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...limitedMessages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    })),
  ];

  return callChatCompletion({
    messages,
    model: COPILOT_MODEL,
    temperature: COPILOT_TEMPERATURE,
    maxTokens: COPILOT_MAX_TOKENS,
  });
}

function limitContext(messages: CopilotDbMessage[]): CopilotDbMessage[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

function sanitizeNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

