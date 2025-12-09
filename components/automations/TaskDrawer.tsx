import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import type { VersionTask } from "@/db/schema";

export interface TaskDrawerProps {
  task: VersionTask;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: {
    status?: VersionTask["status"];
    description?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => Promise<void>;
}

export function TaskDrawer({ task, onClose, onSave, saving }: TaskDrawerProps) {
  const [status, setStatus] = useState<VersionTask["status"]>(task.status);
  const [notes, setNotes] = useState<string>(task.metadata?.notes ?? "");
  const [documents, setDocuments] = useState<string[]>(task.metadata?.documents ?? []);
  const [assignee, setAssignee] = useState<string>(task.metadata?.assigneeEmail ?? "");
  const [description, setDescription] = useState<string>(task.description ?? "");

  useEffect(() => {
    setStatus(task.status);
    setNotes(task.metadata?.notes ?? "");
    setDocuments(task.metadata?.documents ?? []);
    setAssignee(task.metadata?.assigneeEmail ?? "");
    setDescription(task.description ?? "");
  }, [task]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const names = files.map((file) => file.name);
    setDocuments((prev) => [...prev, ...names]);
  };

  const handleRemoveDoc = (name: string) => {
    setDocuments((prev) => prev.filter((doc) => doc !== name));
  };

  const handleSubmit = async (nextStatus?: VersionTask["status"]) => {
    const patchStatus = nextStatus ?? status;
    await onSave({
      status: patchStatus,
      description,
      metadata: {
        ...task.metadata,
        notes: notes || undefined,
        documents,
        assigneeEmail: assignee || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[420px] max-w-full h-full bg-white shadow-xl shadow-gray-200/50 border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-none px-6 py-5 border-b border-gray-100 bg-white sticky top-0 z-10 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Task</p>
            <h3 className="text-xl font-bold text-[#0A0A0A] leading-tight">{task.title}</h3>
            {task.metadata?.systemType ? (
              <p className="text-xs text-gray-500 mt-1 capitalize">System: {task.metadata.systemType}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A] transition-colors"
              onClick={onClose}
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 pb-10 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VersionTask["status"])}
                className="h-11 w-full rounded-lg bg-gray-50/50 border border-gray-200 px-3 text-sm hover:bg-white hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E43632] transition-all"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Task requirements / how to complete</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px] text-sm bg-white border-gray-200 shadow-sm hover:border-gray-300 focus-visible:ring-[#E43632] resize-none p-4 leading-relaxed rounded-xl transition-all"
                placeholder="Add instructions or requirements to complete this task."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Additional notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[90px] text-sm bg-gray-50/50 border-gray-200 focus-visible:ring-[#E43632] resize-none p-3 rounded-xl"
                placeholder="Internal notes or clarifications."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Documents</Label>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-200 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:border-gray-300 hover:file:bg-white"
              />
              {documents.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {documents.map((doc) => (
                    <div
                      key={doc}
                      className="flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-700"
                    >
                      <span>{doc}</span>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-500"
                        onClick={() => handleRemoveDoc(doc)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No documents attached.</p>
              )}
              <p className="text-[11px] text-gray-400">Uploads are captured as filenames for now; wire storage later.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Assign / invite</Label>
              <Input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="email@company.com"
                className="h-11 bg-gray-50/50 border-gray-200 hover:bg-white hover:border-gray-300 focus-visible:ring-[#E43632] transition-all text-sm"
              />
              <p className="text-[11px] text-gray-400">
                Enter teammate email to tag/invite (invites to be wired later).
              </p>
            </div>
          </div>
        </div>

        <div className="flex-none p-6 border-t border-gray-200 bg-white space-y-3">
          <Button
            variant="outline"
            className="w-full h-11 text-sm border-gray-300 text-gray-700 hover:text-[#0A0A0A]"
            disabled={saving}
            onClick={() => handleSubmit("complete")}
          >
            Mark Complete
          </Button>
          <Button
            className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white font-bold shadow-lg shadow-gray-900/10 h-11 text-sm rounded-lg transition-all hover:-translate-y-0.5"
            disabled={saving}
            onClick={() => handleSubmit()}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          <div className="flex items-center justify-center">
            <Button
              variant="link"
              className="text-xs text-gray-400 hover:text-gray-600 h-auto p-0 font-medium"
              onClick={onClose}
            >
              Discard Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


