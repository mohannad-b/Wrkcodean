import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import type { StudioChatController, StudioChatOptions, WorkflowChatController, WorkflowChatOptions } from "./copilotChatTypes";
import { useStudioCopilotChatController } from "./useStudioCopilotChatController";
import { useWorkflowChatController } from "./useWorkflowChatController";

const DOUBLE_SEND_WINDOW_MS = 3000;
const SEND_COOLDOWN_MS = 500;

export function useCopilotChat(options: StudioChatOptions): StudioChatController;
export function useCopilotChat(options: WorkflowChatOptions): WorkflowChatController;
export function useCopilotChat(
  options: StudioChatOptions | WorkflowChatOptions
): StudioChatController | WorkflowChatController {
  if (options.mode === "studio") {
    const controller = useStudioCopilotChatController(options);
    const toast = useToast();
    const lastSentRef = useRef<{ content: string; at: number } | null>(null);
    const [sendCooldownUntil, setSendCooldownUntil] = useState<number | null>(null);

    useEffect(() => {
      if (sendCooldownUntil == null) return;
      const remaining = sendCooldownUntil - Date.now();
      if (remaining <= 0) {
        setSendCooldownUntil(null);
        return;
      }
      const t = setTimeout(() => setSendCooldownUntil(null), remaining);
      return () => clearTimeout(t);
    }, [sendCooldownUntil]);

    const handleSend = useCallback(async () => {
      const content = controller.input.trim();
      if (!content && controller.attachedFiles.length === 0) return;

      let messageContent = content;
      if (controller.attachedFiles.length > 0) {
        const fileReferences = controller.attachedFiles.map((f) => `[File: ${f.filename}]`).join(" ");
        messageContent = content ? `${content}\n\n${fileReferences}` : fileReferences;
      }

      const now = Date.now();
      if (
        lastSentRef.current &&
        lastSentRef.current.content === messageContent &&
        now - lastSentRef.current.at < DOUBLE_SEND_WINDOW_MS
      ) {
        return;
      }
      if (sendCooldownUntil != null && now < sendCooldownUntil) {
        return;
      }
      setSendCooldownUntil(Date.now() + SEND_COOLDOWN_MS);
      lastSentRef.current = { content: messageContent, at: now };

      controller.setInput("");
      controller.attachedFiles.forEach((file) => controller.handleRemoveFile(file.id));

      void controller
        .sendMessage(messageContent, "manual")
        .then((result) => {
          if (result?.ok) {
            return;
          }
          lastSentRef.current = null;
          toast({ title: "Message failed", description: "We could not send that message. Please try again.", variant: "error" });
          controller.setInput(messageContent);
        })
        .catch((error) => {
          lastSentRef.current = null;
          const message = error instanceof Error ? error.message : "We could not send that message. Please try again.";
          toast({ title: "Message failed", description: message, variant: "error" });
          controller.setInput(messageContent);
        });
    }, [controller, toast, sendCooldownUntil]);

    const sendDisabledForCooldown = sendCooldownUntil != null && Date.now() < sendCooldownUntil;

    return { ...controller, handleSend, sendDisabledForCooldown } satisfies StudioChatController;
  }
  return useWorkflowChatController(options);
}
