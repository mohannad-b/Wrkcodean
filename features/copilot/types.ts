export type ChatRole = "user" | "assistant" | "system";

export interface CopilotMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  optimistic?: boolean;
  transient?: boolean;
  clientMessageId?: string | null;
  kind?: "proceed_cta";
  proceedMeta?: {
    uiStyle?: string | null;
  };
}
