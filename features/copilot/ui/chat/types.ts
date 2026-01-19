import type { CopilotMessage, ChatRole } from "@/features/copilot/types";

export type { CopilotMessage, ChatRole };

export type RunPhase =
  | "connected"
  | "understanding"
  | "drafting"
  | "structuring"
  | "drawing"
  | "saving"
  | "done"
  | "error";

export type BuildActivity = {
  runId: string;
  phase: string;
  lastSeq?: number | null;
  rawPhase?: string | null;
  lastLine: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  isRunning: boolean;
};

export type AttachedFile = {
  id: string;
  filename: string;
  url: string;
  type: string;
};

export type WorkflowMessage = {
  id: string;
  conversationId: string;
  tenantId: string;
  automationVersionId: string;
  senderType: "client" | "wrk" | "system";
  senderUserId: string | null;
  body: string;
  attachments: Array<{ fileId: string; filename: string; mimeType: string; sizeBytes: number; url?: string }>;
  clientGeneratedId?: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  sender?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
  optimistic?: boolean;
  status?: "sending" | "sent" | "failed";
};

export type WorkflowTypingState = {
  userId: string;
  userName: string;
  timestamp: number;
};

export type WorkflowChatEvent = {
  type: string;
  conversationId?: string;
  data?: unknown;
  payload?: unknown;
  timestamp?: string;
  lastMessageId?: string | null;
  lastReadMessageId?: string | null;
  unreadCount?: number;
  resyncRecommended?: boolean;
};

export type CopilotSseEvent = {
  type: string;
  runId: string;
  payload: Record<string, unknown>;
  isPing: boolean;
};
