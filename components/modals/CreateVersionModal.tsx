"use client";

import { useState, useEffect } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface CreateVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (version: string) => void;
  currentVersion: string;
}

export function CreateVersionModal({
  isOpen,
  onClose,
  onCreate,
  currentVersion,
}: CreateVersionModalProps) {
  const [version, setVersion] = useState("");
  const [desc, setDesc] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Suggest next version
  useEffect(() => {
    if (isOpen && currentVersion) {
      const parts = currentVersion.replace("v", "").split(".");
      if (parts.length === 2) {
        const nextMinor = parseInt(parts[1]) + 1;
        setVersion(`v${parts[0]}.${nextMinor}`);
      }
    }
  }, [isOpen, currentVersion]);

  const handleCreate = () => {
    if (!version.trim()) return;
    setIsLoading(true);
    setTimeout(() => {
      onCreate(version);
      setIsLoading(false);
      onClose();
      setDesc("");
    }, 800);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-white">
        <DialogHeader>
          <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center mb-2">
            <GitBranch size={20} className="text-gray-500" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#0A0A0A]">Start New Version</DialogTitle>
          <DialogDescription>
            Create a draft based on{" "}
            <span className="font-bold text-gray-700">{currentVersion}</span> to safely make
            changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Version Name</label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. v1.3"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">
              Description (Optional)
            </label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What are you changing?"
              className="resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!version.trim() || isLoading}
            className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20"
          >
            {isLoading ? (
              <Loader2 className="animate-spin mr-2" size={16} />
            ) : (
              <GitBranch className="mr-2" size={16} />
            )}
            Create Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



