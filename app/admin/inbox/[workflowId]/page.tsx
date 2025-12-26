"use client";

import { useEffect, useState } from "react";
import { WorkflowChatView } from "@/components/workflow-chat/WorkflowChatView";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";

export default function WorkflowChatPage() {
  const params = useParams();
  const workflowId = params.workflowId as string;
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch workflow name
    const fetchWorkflow = async () => {
      try {
        // You might want to create an API endpoint to get workflow details
        // For now, we'll just use the workflowId
        setWorkflowName(null);
      } catch (error) {
        console.error("Failed to fetch workflow:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (workflowId) {
      fetchWorkflow();
    }
  }, [workflowId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return <WorkflowChatView workflowId={workflowId} workflowName={workflowName || undefined} />;
}

