import type React from "react";
import type { CopilotMessage, ChatRole } from "@/features/copilot/types";
import type { CopilotAnalysisState, ReadinessSignals, WorkflowProgressSnapshot } from "@/features/copilot/domain";
import type { Workflow } from "@/features/workflows/domain";
import type { Task } from "@/db/schema";
import type {
  AttachedFile,
  BuildActivity,
  RunPhase,
  WorkflowMessage,
  WorkflowTypingState,
} from "@/features/copilot/ui/chat/types";
import type { WorkflowUpdates } from "@/lib/workflows/ai-updates";

export type ApiCopilotMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type StudioChatOptions = {
  mode: "studio";
  automationVersionId: string | null;
  workflowEmpty: boolean;
  disabled?: boolean;
  onConversationChange?: (messages: CopilotMessage[]) => void;
  onWorkflowUpdates?: (updates: WorkflowUpdates | Workflow) => void;
  onWorkflowRefresh?: () => Promise<void> | void;
  onProgressUpdate?: (progress: WorkflowProgressSnapshot | null) => void;
  onTasksUpdate?: (tasks: Task[]) => void;
  injectedMessage?: CopilotMessage | null;
  onInjectedMessageConsumed?: () => void;
  onWorkflowUpdatingChange?: (isUpdating: boolean) => void;
  analysis?: CopilotAnalysisState | null;
  analysisLoading?: boolean;
  onRefreshAnalysis?: () => void | Promise<void>;
  onBuildActivityUpdate?: (activity: BuildActivity | null) => void;
  analysisUnavailable?: boolean;
  onReadinessUpdate?: (payload: {
    runId?: string;
    readinessScore?: number;
    proceedReady?: boolean;
    proceedReason?: string | null;
    proceedBasicsMet?: boolean;
    proceedThresholdMet?: boolean;
    signals?: ReadinessSignals;
  }) => void;
  onRequirementsUpdate?: (text: string) => void;
};

export type WorkflowChatOptions = {
  mode: "workflow";
  workflowId: string;
  disabled?: boolean;
  profile?: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
};

export type StudioChatController = {
  mode: "studio";
  messages: CopilotMessage[];
  displayMessages: CopilotMessage[];
  input: string;
  setInput: (value: string) => void;
  isSending: boolean;
  isAwaitingReply: boolean;
  isLoadingThread: boolean;
  buildActivity: BuildActivity | null;
  attachedFiles: AttachedFile[];
  isUploadingFile: boolean;
  analysisState: "loading" | "ready" | "idle";
  analysisStageLabel: string;
  analysisAssumptions: Array<{ text?: string }>;
  effectiveAnalysis: CopilotAnalysisState | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: (fileId: string) => void;
  handleSend: () => Promise<void>;
  sendDisabledForCooldown?: boolean;
  retryLastMessage: () => Promise<boolean>;
  sendMessage: (content: string, source: "manual" | "seed", options?: { reuseRunId?: string }) => Promise<
    | { ok: true; stepCount: number; nodeCount: number | null; persistenceError: boolean; runId: string }
    | { ok: false }
  >;
};

export type WorkflowChatController = {
  mode: "workflow";
  messages: WorkflowMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isSending: boolean;
  typingUsers: Map<string, WorkflowTypingState>;
  isAtBottom: boolean;
  hasNewMessages: boolean;
  handleScroll: (element: HTMLDivElement | null) => void;
  markScrolledToBottom: () => void;
  sendMessage: () => Promise<void>;
  sendDisabledForCooldown?: boolean;
  retryMessage: (message: WorkflowMessage) => Promise<void>;
};
