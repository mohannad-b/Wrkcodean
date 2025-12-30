"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Upload, Link as LinkIcon, Loader2, FileText, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { UploadPurpose } from "@/lib/storage/file-service";
import { logger } from "@/lib/logger";

type FileVersionDto = {
  id: string;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl?: string | null;
  createdAt: string;
};

type FileDto = {
  id: string;
  title: string | null;
  purpose: UploadPurpose;
  resourceType: string | null;
  resourceId: string | null;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
  latest: FileVersionDto | null;
};

type Props = {
  purpose?: UploadPurpose;
  resourceType?: string;
  resourceId?: string;
  title?: string;
  accept?: string;
  maxSizeMb?: number;
  onUploaded?: (payload: { file: FileDto; version: FileVersionDto }) => void;
};

type UploadMode = "file" | "url";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export function SecureUploader({
  purpose = "generic",
  resourceType,
  resourceId,
  title,
  accept,
  maxSizeMb = 25,
  onUploaded,
}: Props) {
  const [mode, setMode] = useState<UploadMode>("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<FileDto[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const maxBytes = useMemo(() => maxSizeMb * 1024 * 1024, [maxSizeMb]);

  useEffect(() => {
    let cancelled = false;
    async function fetchExisting() {
      setRefreshing(true);
      const qs = new URLSearchParams();
      if (resourceType) qs.append("resourceType", resourceType);
      if (resourceId) qs.append("resourceId", resourceId);
      if (purpose) qs.append("purpose", purpose);
      try {
        const res = await fetch(`/api/uploads?${qs.toString()}`);
        if (!res.ok) throw new Error("Unable to fetch uploads");
        const data = (await res.json()) as { files: FileDto[] };
        if (!cancelled) setExisting(data.files ?? []);
      } catch (err) {
        logger.error("[uploader] failed to fetch existing uploads", err);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }
    fetchExisting();
    return () => {
      cancelled = true;
    };
  }, [resourceId, resourceType, purpose]);

  const latestPreview = useMemo(() => existing[0]?.latest, [existing]);

  async function handleSubmit() {
    setError(null);
    if (mode === "file" && !selectedFile) {
      setError("Choose a file to upload.");
      return;
    }
    if (mode === "url" && !remoteUrl) {
      setError("Provide a link to download.");
      return;
    }
    if (selectedFile && selectedFile.size > maxBytes) {
      setError(`File must be smaller than ${maxSizeMb}MB.`);
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("purpose", purpose);
      if (resourceType) form.append("resourceType", resourceType);
      if (resourceId) form.append("resourceId", resourceId);
      if (title) form.append("title", title);

      if (mode === "file" && selectedFile) {
        form.append("file", selectedFile);
      } else if (mode === "url") {
        form.append("url", remoteUrl);
      }

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Upload failed.");
      }

      const data = (await res.json()) as { file: FileDto; version: FileVersionDto };
      setExisting((prev) => {
        const others = prev.filter((f) => f.id !== data.file.id);
        return [{ ...data.file, latest: data.version }, ...others];
      });
      setSelectedFile(null);
      setRemoteUrl("");
      onUploaded?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Secure Uploads</p>
          <p className="text-xs text-gray-500">
            Encrypted at rest. Audit trail recorded for your tenant.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck size={14} /> SOC2-ready
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition",
            mode === "file" ? "border-[#E43632] bg-red-50 text-[#E43632]" : "border-gray-200 text-gray-700"
          )}
          onClick={() => setMode("file")}
          type="button"
        >
          <Upload size={16} /> Upload file
        </button>
        <button
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition",
            mode === "url" ? "border-[#E43632] bg-red-50 text-[#E43632]" : "border-gray-200 text-gray-700"
          )}
          onClick={() => setMode("url")}
          type="button"
        >
          <LinkIcon size={16} /> Provide link
        </button>
        <div className="hidden md:flex items-center justify-end text-xs text-gray-500">
          Max {maxSizeMb}MB · {accept || "Common documents, images, video"}
        </div>
      </div>

      {mode === "file" ? (
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">Choose a file</Label>
          <Input type="file" accept={accept} onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
          {selectedFile && (
            <p className="text-xs text-gray-500">
              Selected: <span className="font-medium">{selectedFile.name}</span> ({formatBytes(selectedFile.size)})
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">Public link</Label>
          <Input
            placeholder="https://example.com/file.pdf"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {mode === "file" ? "Upload" : "Fetch & Upload"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Refresh list"
          onClick={async () => {
            setExisting([]);
            setRefreshing(true);
            const res = await fetch(
              `/api/uploads?${new URLSearchParams({
                ...(resourceType ? { resourceType } : {}),
                ...(resourceId ? { resourceId } : {}),
                ...(purpose ? { purpose } : {}),
              }).toString()}`
            );
            if (res.ok) {
              const data = (await res.json()) as { files: FileDto[] };
              setExisting(data.files ?? []);
            }
            setRefreshing(false);
          }}
        >
          <RefreshCcw size={16} className={cn(refreshing && "animate-spin")} />
        </Button>
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700">Previous uploads</p>
          {latestPreview?.storageUrl && (
            <a
              href={latestPreview.storageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#E43632] hover:underline"
            >
              Latest file
            </a>
          )}
        </div>
        <ScrollArea className="h-40 rounded border border-dashed border-gray-200 bg-gray-50/60 p-2">
          {existing.length === 0 && (
            <div className="h-full flex items-center justify-center text-xs text-gray-400">No uploads yet</div>
          )}
          <div className="space-y-2">
            {existing.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border border-gray-200 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded bg-red-50 text-[#E43632]">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {file.latest?.filename ?? file.title ?? "Untitled file"}
                    </p>
                    <p className="text-xs text-gray-500">
                      v{file.latest?.version ?? file.latestVersion} · {file.latest ? formatBytes(file.latest.sizeBytes) : "—"}
                    </p>
                  </div>
                </div>
                {file.latest?.storageUrl && (
                  <a
                    href={file.latest.storageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#E43632] hover:underline shrink-0"
                  >
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}


