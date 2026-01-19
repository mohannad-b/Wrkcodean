import { FileText, Image as ImageIcon, X } from "lucide-react";
import type { AttachedFile } from "@/features/copilot/ui/chat/types";

interface AttachmentListProps {
  files: AttachedFile[];
  onRemove?: (fileId: string) => void;
}

const isImageFile = (mimeType: string) => mimeType.startsWith("image/");

export function AttachmentList({ files, onRemove }: AttachmentListProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-2 px-2 py-1.5 bg-white rounded-md border border-gray-200 text-xs"
        >
          {isImageFile(file.type) ? (
            <ImageIcon className="h-3.5 w-3.5 text-[#E43632]" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-[#E43632]" />
          )}
          <span className="text-gray-700 max-w-[150px] truncate">{file.filename}</span>
          {onRemove ? (
            <button
              onClick={() => onRemove(file.id)}
              className="p-0.5 text-gray-400 hover:text-red-600 transition-colors"
              type="button"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
