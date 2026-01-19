import type { StudioChatController, StudioChatOptions, WorkflowChatController, WorkflowChatOptions } from "./copilotChatTypes";
import { useStudioCopilotChatController } from "./useStudioCopilotChatController";
import { useWorkflowChatController } from "./useWorkflowChatController";

export function useCopilotChat(options: StudioChatOptions): StudioChatController;
export function useCopilotChat(options: WorkflowChatOptions): WorkflowChatController;
export function useCopilotChat(options: StudioChatOptions | WorkflowChatOptions) {
  if (options.mode === "studio") {
    return useStudioCopilotChatController(options);
  }
  return useWorkflowChatController(options);
}
