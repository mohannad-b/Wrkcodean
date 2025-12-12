import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, X, Download, MoreHorizontal, Trash2, FileText, Upload, History } from "lucide-react";
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
  const [fileItems, setFileItems] = useState<FileGroup[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<FileVersionItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [fileBusyAction, setFileBusyAction] = useState<"idle" | "uploading" | "deleting">("idle");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setStatus(task.status);
    setNotes(task.metadata?.notes ?? "");
    setDocuments(task.metadata?.documents ?? []);
    setAssignee(task.metadata?.assigneeEmail ?? "");
    setDescription(task.description ?? "");
  }, [task]);

  type FileVersionItem = {
    fileId: string;
    versionId: string;
    filename: string;
    sizeBytes: number;
    version: number;
    storageUrl?: string | null;
    createdAt?: string;
    isLatest?: boolean;
    uploaderName?: string | null;
    uploaderAvatar?: string | null;
  };

  type FileGroup = {
    fileId: string;
    versions: FileVersionItem[];
  };

  const fetchFiles = async () => {
    setFileLoading(true);
    setFileError(null);
    try {
      const res = await fetch(
        `/api/uploads?${new URLSearchParams({
          resourceType: "task",
          resourceId: task.id,
          purpose: "task_attachment",
        }).toString()}`
      );
      const data = await res.json();
      const files = (data.files ?? []) as any[];
      const groups = await Promise.all(
        files.map(async (f) => {
          const base: FileVersionItem = {
            fileId: f.id,
            versionId: f.latest?.id ?? f.id,
            filename: f.latest?.filename ?? f.title ?? "Attachment",
            sizeBytes: f.latest?.sizeBytes ?? 0,
            version: f.latest?.version ?? f.latestVersion ?? 1,
            storageUrl: f.latest?.storageUrl ?? f.storageUrl,
            createdAt: f.latest?.createdAt ?? f.createdAt,
            isLatest: true,
            uploaderName: f.latest?.uploaderName ?? f.uploaderName,
            uploaderAvatar: f.latest?.uploaderAvatar ?? f.uploaderAvatar,
          };
          try {
            const historyRes = await fetch(`/api/uploads/history/${f.id}`);
            const historyJson = await historyRes.json().catch(() => ({}));
            const versionsRaw = (historyJson.versions ?? []) as any[];
            const versions: FileVersionItem[] = versionsRaw
              .map((v) => ({
                fileId: f.id,
                versionId: v.id,
                filename: v.filename ?? base.filename,
                sizeBytes: v.sizeBytes ?? 0,
                version: v.version ?? 1,
                storageUrl: v.storageUrl,
                createdAt: v.createdAt,
                isLatest: v.version === base.version,
                uploaderName: v.uploaderName,
                uploaderAvatar: v.uploaderAvatar,
              }))
              .sort((a, b) => b.version - a.version);
            const merged = versions.length > 0 ? versions : [base];
            return { fileId: f.id, versions: merged };
          } catch {
            return { fileId: f.id, versions: [base] };
          }
        })
      );
      const newCollapsed: Record<string, boolean> = {};
      groups.forEach((g) => {
        newCollapsed[g.fileId] = collapsedGroups[g.fileId] ?? true; // default collapsed to show latest only
      });
      setCollapsedGroups(newCollapsed);
      setFileItems(groups);
    } catch (err) {
      setFileError("Unable to load attachments.");
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    void fetchFiles();
  }, [task.id]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setFileError(null);
    setFileLoading(true);
    setFileBusyAction("uploading");
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setFileBusyAction("uploading");
        setFileError(null);
        setFileLoading(true);
        const label = `Uploading file ${i + 1} of ${files.length}...`;
        // eslint-disable-next-line no-console
        console.info(label);
        const form = new FormData();
        form.append("purpose", "task_attachment");
        form.append("resourceType", "task");
        form.append("resourceId", task.id);
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Upload failed");
        }
      }
      await fetchFiles();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setFileLoading(false);
      setFileBusyAction("idle");
    }
  };

  const handleDeleteFile = async (versionId: string) => {
    setFileError(null);
    setFileLoading(true);
    setFileBusyAction("deleting");
    try {
      const res = await fetch(`/api/uploads/${versionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      await fetchFiles();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setFileLoading(false);
      setFileBusyAction("idle");
      setConfirmDeleteId(null);
    }
  };

  const handleUploadNewVersion = async (fileId: string, file: File) => {
    setFileError(null);
    setFileLoading(true);
    setFileBusyAction("uploading");
    try {
      const form = new FormData();
      form.append("purpose", "task_attachment");
      form.append("resourceType", "task");
      form.append("resourceId", task.id);
      form.append("versionOfFileId", fileId);
      form.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }
      await fetchFiles();
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setFileLoading(false);
      setFileBusyAction("idle");
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** i;
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const formatDate = (value?: string) => {
    if (!value) return "";
    const d = new Date(value);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const openHistory = async (fileId: string) => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryItems([]);
    setFileError(null);
    try {
      const res = await fetch(`/api/uploads/history/${fileId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to load history");
      }
      const versions = (data.versions ?? []) as any[];
      const mapped: FileVersionItem[] = versions.map((v) => ({
        fileId,
        versionId: v.id,
        filename: v.filename,
        sizeBytes: v.sizeBytes ?? 0,
        version: v.version ?? 1,
        storageUrl: v.storageUrl,
        createdAt: v.createdAt,
        uploaderName: v.uploaderName,
        uploaderAvatar: v.uploaderAvatar,
      }));
      setHistoryItems(mapped);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Unable to load history.");
    } finally {
      setHistoryLoading(false);
    }
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
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#0A0A0A]">Attachments</div>
                <div className="text-xs text-gray-500">{fileItems.length} file(s) attached</div>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm hover:border-gray-300 cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,video/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {fileBusyAction !== "idle" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#E43632]" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {fileBusyAction === "uploading"
                      ? "Uploading..."
                      : fileBusyAction === "deleting"
                      ? "Deleting..."
                      : "Choose Files"}
                  </label>
                  {fileError && <p className="text-xs text-red-600">{fileError}</p>}
                  {fileLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading attachments...
                    </div>
                  ) : fileItems.length === 0 ? (
                    <p className="text-xs text-gray-400">No files attached.</p>
                  ) : (
                    <div className="space-y-3">
                      {fileItems.map((group) => {
                        const collapsed = collapsedGroups[group.fileId] ?? true;
                        const latest = group.versions[0];
                        const previous = group.versions.slice(1);
                        return (
                          <div key={group.fileId} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <div className="flex items-start gap-3 p-4">
                              <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                <FileText size={20} />
                              </div>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-base font-semibold text-[#0A0A0A] truncate">{latest.filename}</p>
                                    <div className="text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
                                      <span>{latest.uploaderName ?? "Unknown"}</span>
                                      <span>•</span>
                                      <span>{latest.createdAt ? formatDate(latest.createdAt) : "—"}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="rounded-full bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1">
                                      v{latest.version}
                                    </span>
                                    <div className="relative">
                                      <button
                                        type="button"
                                        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-[#0A0A0A]"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const menu = e.currentTarget.nextElementSibling as HTMLDivElement | null;
                                          if (menu) menu.classList.toggle("hidden");
                                        }}
                                      >
                                        <MoreHorizontal size={16} />
                                      </button>
                                      <div className="absolute right-0 top-10 w-44 rounded-xl border border-gray-200 bg-white shadow-lg hidden z-10">
                                        {latest.storageUrl ? (
                                          <a
                                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                                            href={latest.storageUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <Download size={14} /> Download
                                          </a>
                                        ) : null}
                                        <button
                                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                                          type="button"
                                          onClick={() => openHistory(latest.fileId)}
                                        >
                                          <FileText size={14} /> View History
                                        </button>
                                        <label className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 cursor-pointer">
                                          <input
                                            type="file"
                                            accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,video/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const f = e.target.files?.[0];
                                              if (f) handleUploadNewVersion(latest.fileId, f);
                                            }}
                                          />
                                          <Upload size={14} /> Upload New Version
                                        </label>
                                        <button
                                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                          type="button"
                                          onClick={() => setConfirmDeleteId(latest.versionId)}
                                        >
                                          <Trash2 size={14} /> Delete
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {previous.length > 0 && (
                              <div className="border-t border-gray-100">
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                  onClick={() =>
                                    setCollapsedGroups((prev) => ({
                                      ...prev,
                                      [group.fileId]: !collapsed,
                                    }))
                                  }
                                >
                                  <span
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition transform ${
                                      collapsed ? "rotate-0" : "-rotate-90"
                                    }`}
                                  >
                                    <History size={12} />
                                  </span>
                                  {previous.length} previous version{previous.length > 1 ? "s" : ""}
                                </button>
                                {!collapsed && (
                                  <div className="space-y-2 px-4 pb-4">
                                    {previous.map((file) => (
                                      <div key={file.versionId} className="flex items-start gap-3 border border-gray-100 rounded-xl bg-gray-50 px-3 py-3">
                                        <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                          <FileText size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[#0A0A0A]">
                                              v{file.version}{" "}
                                              <span className="ml-2 rounded-full bg-gray-200 text-gray-700 text-[11px] px-2 py-0.5 align-middle">
                                                Previous
                                              </span>
                                            </p>
                                            <div className="text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
                                              <span>{file.uploaderName ?? "Unknown"}</span>
                                              <span>•</span>
                                              <span>{file.createdAt ? formatDate(file.createdAt) : "—"}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
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
      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-[520px] max-w-full rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">File Actions</p>
                <p className="text-xl font-bold text-[#0A0A0A]">Version History</p>
              </div>
              <Button variant="ghost" size="icon" className="text-gray-500" onClick={() => setHistoryOpen(false)}>
                <X size={16} />
              </Button>
            </div>
            <div className="max-h-[460px] overflow-y-auto divide-y divide-gray-100">
              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">No history yet.</div>
              ) : (
                historyItems.map((item) => (
                  <div key={item.versionId} className="px-6 py-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileText size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0A0A0A] truncate">{item.filename}</p>
                      <div className="text-[11px] text-gray-600 flex items-center gap-2 flex-wrap">
                        <span>v{item.version}</span>
                        <span>•</span>
                        <span>{formatBytes(item.sizeBytes)}</span>
                        {item.createdAt ? (
                          <>
                            <span>•</span>
                            <span>{formatDate(item.createdAt)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-700">
                          {item.uploaderAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.uploaderAvatar} alt={item.uploaderName ?? "User"} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            (item.uploaderName ?? "User")
                              .split(" ")
                              .map((p) => p[0])
                              .join("")
                              .slice(0, 2)
                          )}
                        </div>
                        <div className="text-[11px] text-gray-600">{item.uploaderName ?? "Unknown"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.storageUrl && (
                          <a
                            href={item.storageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-[#0A0A0A] hover:underline"
                            title="Download"
                          >
                            <Download size={14} />
                          </a>
                        )}
                        <button
                          type="button"
                          title="Delete"
                          className="text-gray-500 hover:text-red-600"
                          onClick={() => setConfirmDeleteId(item.versionId)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
          <div className="w-[360px] max-w-full rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-lg font-bold text-[#0A0A0A]">Delete file?</p>
              <p className="text-sm text-gray-600 mt-1">This will remove the selected version.</p>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-3">
              <Button variant="ghost" className="text-sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                className="text-sm bg-red-600 hover:bg-red-700 text-white"
                disabled={fileBusyAction === "deleting"}
                onClick={() => handleDeleteFile(confirmDeleteId)}
              >
                {fileBusyAction === "deleting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


