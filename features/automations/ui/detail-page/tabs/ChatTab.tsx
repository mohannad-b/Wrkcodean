"use client";

import { WorkflowChatView } from "@/components/workflow-chat/WorkflowChatView";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ChatTabProps {
  automationVersionId: string;
  automationName?: string;
  isChecking: boolean;
  hasAccess: boolean | null;
}

export function ChatTab({ automationVersionId, automationName, isChecking, hasAccess }: ChatTabProps) {
  if (isChecking) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Restricted</AlertTitle>
          <AlertDescription>
            You don't have permission to access chat for this workflow. Only workspace owners, admins, and editors can access chat.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <WorkflowChatView workflowId={automationVersionId} workflowName={automationName} />
    </div>
  );
}
