import { renderTemplate } from "@/lib/email/render";
import { getTemplate } from "@/lib/email/templates/registry";
import { sendWithRoundRobin } from "@/lib/email/provider";
import type {
  BaseSendParams,
  MarketingSendParams,
  RenderedEmail,
  SenderIdentity,
} from "@/lib/email/types";

type IdempotencyCache = Map<string, { messageId: string }>;

const idempotencyCache: IdempotencyCache = new Map();

function resolveFrom(sender: SenderIdentity) {
  if (sender === "support") return process.env.EMAIL_SUPPORT_FROM || process.env.EMAIL_DEFAULT_FROM;
  if (sender === "notifications")
    return process.env.EMAIL_NOTIFICATIONS_FROM || process.env.EMAIL_DEFAULT_FROM;
  if (sender === "news") return process.env.EMAIL_NEWS_FROM || process.env.EMAIL_DEFAULT_FROM;
  return process.env.EMAIL_DEFAULT_FROM;
}

function requireFrom(from: string | undefined) {
  if (!from) throw new Error("No sender configured; set EMAIL_DEFAULT_FROM");
  return from;
}

async function sendOne(templateId: string, rendered: RenderedEmail, to: string, sender: SenderIdentity) {
  const from = requireFrom(resolveFrom(sender));
  const { provider } = await sendWithRoundRobin({
    ...rendered,
    to,
    from,
    category: getTemplate(templateId).category,
  });
  // Placeholder: persist EmailMessage + EmailEvent and provider info in DB.
  return { provider };
}

export const EmailService = {
  renderTemplate,
  validate(templateId: string, variables: unknown) {
    getTemplate(templateId); // throws if missing
    renderTemplate(templateId, variables as never);
    return true;
  },

  async sendTransactional<T extends BaseSendParams<any>>(params: T) {
    if (idempotencyCache.has(params.idempotencyKey)) return idempotencyCache.get(params.idempotencyKey);
    const rendered = renderTemplate(params.templateId, params.variables as never);
    const result = await sendOne(params.templateId, rendered, params.to, "support");
    const message = { messageId: crypto.randomUUID(), provider: result.provider.name };
    idempotencyCache.set(params.idempotencyKey, message);
    return message;
  },

  async sendNotification<T extends BaseSendParams<any>>(params: T) {
    if (idempotencyCache.has(params.idempotencyKey)) return idempotencyCache.get(params.idempotencyKey);
    const rendered = renderTemplate(params.templateId, params.variables as never);
    const result = await sendOne(params.templateId, rendered, params.to, "notifications");
    const message = { messageId: crypto.randomUUID(), provider: result.provider.name };
    idempotencyCache.set(params.idempotencyKey, message);
    return message;
  },

  async sendMarketing<T extends MarketingSendParams<any>>(params: T) {
    // Marketing audience fan-out is simplified for v1.
    const rendered = renderTemplate(params.templateId, params.variables as never);
    const messages = [];
    for (const to of params.audience) {
      const cacheKey = `${params.idempotencyKey}:${to}`;
      if (idempotencyCache.has(cacheKey)) {
        messages.push(idempotencyCache.get(cacheKey));
        continue;
      }
      const result = await sendOne(params.templateId, rendered, to, params.sender ?? "news");
      const message = { messageId: crypto.randomUUID(), provider: result.provider.name };
      idempotencyCache.set(cacheKey, message);
      messages.push(message);
    }
    return messages;
  },
};

