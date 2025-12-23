import { z } from "zod";

export type EmailCategory = "transactional" | "notification" | "marketing";

export type EmailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complaint"
  | "suppressed"
  | "failed";

export type EmailEventType = EmailStatus;

export type SenderIdentity =
  | "default"
  | "support"
  | "notifications"
  | "news"
  | (string & {});

export interface TemplateMetadata<Schema extends z.ZodTypeAny> {
  templateId: string;
  category: EmailCategory;
  subject: string;
  sender: SenderIdentity;
  requiredVariables: Schema;
  sampleVariables: z.input<Schema>;
  description?: string;
  filePath: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface BaseSendParams<Schema extends z.ZodTypeAny> {
  to: string;
  templateId: string;
  variables: z.input<Schema>;
  idempotencyKey: string;
  tenantId?: string;
  userId?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
}

export interface Attachment {
  filename: string;
  content: string; // base64
  mimeType?: string;
}

export interface MarketingSendParams<Schema extends z.ZodTypeAny> {
  audience: string[]; // explicit list for v1; future: audience query
  templateId: string;
  variables: z.input<Schema>;
  campaignId: string;
  idempotencyKey: string;
  sender?: SenderIdentity;
  attachments?: Attachment[];
}

export interface ProviderSendRequest extends RenderedEmail {
  to: string;
  from: string;
  category: EmailCategory;
  headers?: Record<string, string>;
  attachments?: Attachment[];
  metadata?: Record<string, string>;
}

export interface ProviderSendResponse {
  providerMessageId: string;
}

export interface EmailProvider {
  name: string;
  send(request: ProviderSendRequest): Promise<ProviderSendResponse>;
}

