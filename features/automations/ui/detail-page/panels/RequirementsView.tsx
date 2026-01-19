"use client";

import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const Markdown = dynamic(() => import("react-markdown").then((m) => m.default), { ssr: false });

interface RequirementsViewProps {
  requirementsText: string;
  onRequirementsChange: (text: string) => void;
  onSave: () => void;
  saving: boolean;
  automationVersionId: string | null;
}

export function RequirementsView({
  requirementsText,
  onRequirementsChange,
  onSave,
  saving,
  automationVersionId,
}: RequirementsViewProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Requirements</h2>
            <p className="text-sm text-gray-500">
              Edit in Markdown (single view). Include triggers, steps, systems, and desired outcomes.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Textarea
              value={requirementsText}
              onChange={(e) => onRequirementsChange(e.target.value)}
              placeholder="Describe your workflow in detail. Markdown supported."
              className="min-h-[600px] resize-none font-mono text-sm bg-white"
              disabled={!automationVersionId}
            />
            <div className="min-h-[600px] rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 overflow-y-auto">
              <Markdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
                {requirementsText?.trim() || "_No requirements yet._"}
              </Markdown>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
        <Button onClick={onSave} disabled={saving || !automationVersionId} className="bg-gray-900 text-white hover:bg-gray-800">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Save Requirements
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
