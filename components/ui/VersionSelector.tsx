"use client";

import { ChevronDown, Check, GitBranch, Plus, Clock } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";

type VersionStatus = "active" | "draft" | "superseded";

export interface VersionOption {
  id: string;
  label: string;
  status?: VersionStatus;
  updated?: string;
}

interface VersionSelectorProps {
  currentVersionId: string | null;
  versions: VersionOption[];
  onChange: (versionId: string) => void;
  onNewVersion?: () => void;
}

export function VersionSelector({ currentVersionId, versions, onChange, onNewVersion }: VersionSelectorProps) {
  const hasVersions = versions.length > 0;
  const selectedVersion = hasVersions
    ? versions.find((version) => version.id === currentVersionId) ?? versions[0]
    : null;

  const buttonLabel = selectedVersion?.label ?? "Select version";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] h-5"
          >
            Active
          </Badge>
        );
      case "draft":
        return (
          <Badge
            variant="outline"
            className="bg-gray-100 text-gray-600 border-gray-200 text-[10px] h-5"
          >
            Draft
          </Badge>
        );
      case "superseded":
        return (
          <Badge
            variant="outline"
            className="bg-gray-50 text-gray-400 border-gray-100 text-[10px] h-5"
          >
            Superseded
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-8 bg-white border-gray-200 text-[#0A0A0A] hover:bg-gray-50 px-3 gap-2 font-medium"
          disabled={!hasVersions}
        >
          <GitBranch size={14} className="text-gray-400" />
          {buttonLabel}
          <ChevronDown size={14} className="text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-0 bg-white z-[100]">
        <div className="p-3 border-b border-gray-100 bg-gray-50/50">
          <h4 className="text-xs font-bold text-gray-900">Switch Version</h4>
          <p className="text-[10px] text-gray-500">Select a version to view its configuration.</p>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {hasVersions ? (
            versions.map((version) => (
              <div key={version.id} className="group relative">
                <DropdownMenuItem
                  onClick={() => onChange(version.id)}
                  className={cn(
                    "px-4 py-3 cursor-pointer flex items-start justify-between hover:bg-gray-50",
                    currentVersionId === version.id && "bg-red-50/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 relative">
                      {currentVersionId === version.id && (
                        <Check size={14} className="text-[#E43632] absolute -left-4 top-0.5" />
                      )}
                      <span
                        className={cn(
                          "text-sm font-bold block",
                          currentVersionId === version.id ? "text-[#E43632]" : "text-[#0A0A0A]"
                        )}
                      >
                        {version.label}
                      </span>
                      {version.updated ? (
                        <span className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock size={10} /> {version.updated}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {version.status ? getStatusBadge(version.status) : null}
                  </div>
                </DropdownMenuItem>

                <div className="hidden group-hover:flex items-center gap-1 px-4 pb-2">
                  <button className="text-[10px] text-blue-600 hover:underline">View Changes</button>
                  <span className="text-gray-300">•</span>
                  <button className="text-[10px] text-blue-600 hover:underline">Build Status</button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-500 px-4 py-6">No versions available.</p>
          )}
        </div>
        {onNewVersion ? (
          <div className="p-3 border-t border-gray-100 bg-gray-50">
            <Button
              onClick={onNewVersion}
              className="w-full bg-[#E43632] hover:bg-[#C12E2A] text-white h-8 text-xs"
            >
              <Plus size={14} className="mr-2" /> Start New Version
            </Button>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
