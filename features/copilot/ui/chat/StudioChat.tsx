"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Send, Sparkles, Paperclip, Loader2 } from "lucide-react";
import { MessageList } from "@/features/copilot/ui/MessageList";
import { Composer } from "@/features/copilot/ui/Composer";
import { BuildActivityPanel } from "@/features/copilot/ui/BuildActivityPanel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { WorkflowUpdates } from "@/lib/workflows/ai-updates";
import type { Workflow } from "@/features/workflows/domain";
import type { CopilotMessage } from "@/features/copilot/types";
import type { BuildActivity } from "@/features/copilot/ui/chat/types";
import type { CopilotAnalysisState, ReadinessSignals, WorkflowProgressSnapshot } from "@/features/copilot/domain";
import type { Task } from "@/db/schema";
import { useCopilotChat } from "@/features/copilot/hooks/useCopilotChat";
import { AttachmentList } from "@/features/copilot/ui/chat/AttachmentList";
import { useBuildActivityStream } from "@/features/copilot/hooks/useBuildActivityStream";
import type { BuildActivityEvent } from "@/features/copilot/buildActivityContract";

interface StudioChatProps {
  automationVersionId: string | null;
  workflowEmpty: boolean;
  disabled?: boolean;
  onConversationChange?: (messages: CopilotMessage[]) => void;
  onWorkflowUpdates?: (updates: WorkflowUpdates | Workflow) => void;
  onWorkflowRefresh?: () => Promise<void> | void;
  onProgressUpdate?: (progress: WorkflowProgressSnapshot | null) => void;
  onTasksUpdate?: (tasks: Task[]) => void;
  injectedMessage?: CopilotMessage | null;
  onInjectedMessageConsumed?: () => void;
  onWorkflowUpdatingChange?: (isUpdating: boolean) => void;
  analysis?: CopilotAnalysisState | null;
  analysisLoading?: boolean;
  onRefreshAnalysis?: () => void | Promise<void>;
  onBuildActivityUpdate?: (activity: BuildActivity | null) => void;
  analysisUnavailable?: boolean;
  onProceedToBuild?: () => void;
  proceedToBuildDisabled?: boolean;
  proceedToBuildReason?: string | null;
  proceedingToBuild?: boolean;
  onReadinessUpdate?: (payload: {
    runId?: string;
    readinessScore?: number;
    proceedReady?: boolean;
    proceedReason?: string | null;
    proceedBasicsMet?: boolean;
    proceedThresholdMet?: boolean;
    signals?: ReadinessSignals;
  }) => void;
}

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const mapBuildEventToLegacy = (event: BuildActivityEvent | null): BuildActivity | null => {
  if (!event) return null;
  const lowerStatus = event.status.toLowerCase();
  const isTerminal = lowerStatus === "done" || lowerStatus === "error";
  return {
    runId: event.runId,
    phase: event.stage,
    rawPhase: event.stage,
    lastSeq: event.seq,
    lastLine: event.detail ?? event.title ?? null,
    startedAt: null,
    completedAt: isTerminal ? Date.now() : null,
    isRunning: !isTerminal,
  };
};

const mapLegacyToPanel = (activity: BuildActivity | null) => {
  if (!activity) return null;
  const status = activity.isRunning ? "running" : activity.phase.toLowerCase() === "error" ? "error" : "done";
  const detail = activity.lastLine ?? undefined;
  const title = activity.phase || "Working";
  return {
    title,
    detail,
    progress: undefined,
    currentStatus: status as "queued" | "running" | "waiting_user" | "done" | "error" | "blocked",
    recentUpdates: activity.lastLine
      ? [{ seq: activity.lastSeq ?? 0, title, detail }]
      : [],
    actionableCtas: [],
  };
};

export function StudioChat({
  automationVersionId,
  workflowEmpty,
  disabled = false,
  onConversationChange,
  onWorkflowUpdates,
  onWorkflowRefresh: _onWorkflowRefresh,
  onProgressUpdate,
  onTasksUpdate,
  injectedMessage = null,
  onInjectedMessageConsumed,
  onWorkflowUpdatingChange,
  onRefreshAnalysis,
  onBuildActivityUpdate,
  analysis,
  analysisLoading = false,
  onProceedToBuild,
  proceedToBuildDisabled = false,
  proceedToBuildReason = null,
  proceedingToBuild = false,
  onReadinessUpdate,
}: StudioChatProps) {
  const { profile } = useUserProfile();
  const {
    displayMessages,
    input,
    setInput,
    isSending,
    isAwaitingReply,
    isLoadingThread,
    buildActivity,
    attachedFiles,
    isUploadingFile,
    analysisState,
    analysisStageLabel,
    analysisAssumptions,
    effectiveAnalysis,
    handleFileSelect,
    handleRemoveFile,
    handleSend,
  } = useCopilotChat({
    mode: "studio",
    automationVersionId,
    workflowEmpty,
    disabled,
    onConversationChange,
    onWorkflowUpdates,
    onProgressUpdate,
    onTasksUpdate,
    injectedMessage,
    onInjectedMessageConsumed,
    onWorkflowUpdatingChange,
    analysis,
    analysisLoading,
    onRefreshAnalysis,
    onReadinessUpdate,
  });

  const buildStreamFallbackEnabled = process.env.NEXT_PUBLIC_BUILD_ACTIVITY_FALLBACK === "1";
  const { activity: buildStreamActivity, viewModel: buildStreamViewModel } = useBuildActivityStream({
    automationVersionId,
  });
  const legacyFromStream = useMemo(() => mapBuildEventToLegacy(buildStreamActivity), [buildStreamActivity]);
  const fallbackPanelActivity = useMemo(() => mapLegacyToPanel(buildActivity), [buildActivity]);
  const panelActivity = buildStreamViewModel ?? (buildStreamFallbackEnabled ? fallbackPanelActivity : null);
  const effectiveLegacyActivity = legacyFromStream ?? (buildStreamFallbackEnabled ? buildActivity : null);

  useEffect(() => {
    if (typeof onBuildActivityUpdate === "function") {
      onBuildActivityUpdate(effectiveLegacyActivity ?? null);
    }
  }, [effectiveLegacyActivity, onBuildActivityUpdate]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUserInitials = useCallback(() => {
    if (!profile) return "ME";
    if (profile.firstName && profile.lastName) {
      return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
    }
    if (profile.name) {
      const parts = profile.name.split(/\s+/).filter(Boolean);
      return parts
        .slice(0, 2)
        .map((segment) => segment.charAt(0).toUpperCase())
        .join("");
    }
    return profile.email.charAt(0).toUpperCase();
  }, [profile]);

  const renderMessages = useMemo(() => displayMessages, [displayMessages]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [renderMessages.length]);

  return (
    <div
      className="flex flex-col h-full bg-[#F9FAFB] border-r border-gray-200 overflow-hidden"
      data-testid="copilot-pane"
      data-analysis-state={analysisState}
      data-has-analysis={effectiveAnalysis ? "true" : "false"}
    >
      <div className="p-4 border-b border-gray-200 bg-white flex flex-col gap-3 shadow-sm z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-[#E43632] to-[#FF5F5F] text-white p-1.5 rounded-lg shadow-sm animate-pulse">
              <Sparkles size={16} fill="currentColor" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#0A0A0A] block leading-none">WRK Copilot</span>
              <span className="text-[10px] text-gray-400 font-medium">AI Assistant</span>
            </div>
          </div>
        </div>
      </div>

      {effectiveAnalysis ? (
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {analysisStageLabel || "ANALYSIS"}
          </div>
          {analysisAssumptions.length > 0 ? (
            <div className="mt-2 space-y-1">
              {analysisAssumptions.map((assumption, index) => (
                <div key={`${assumption.text ?? "assumption"}-${index}`} className="text-xs text-gray-600">
                  {assumption.text ?? ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <MessageList className="flex-1 min-h-0 bg-[#F9FAFB]" contentClassName="space-y-6 pb-4 px-4 py-4" endRef={scrollEndRef}>
        {isLoadingThread ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-[#E43632] animate-spin" />
              <p className="text-sm text-gray-500">Loading conversation history...</p>
            </div>
          </div>
        ) : (
          <>
            {renderMessages.map((msg) => {
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  data-testid="copilot-message-bubble"
                  data-id={msg.id}
                  data-role={msg.role}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0 mt-0.5">
                      <Sparkles size={14} />
                    </div>
                  )}
                  {msg.role === "user" && (
                    <Avatar className="w-8 h-8 mt-0.5 border-2 border-white shadow-sm shrink-0">
                      {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={profile.name} /> : null}
                      <AvatarFallback>{getUserInitials()}</AvatarFallback>
                    </Avatar>
                  )}

                  <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                    {msg.kind === "proceed_cta" ? (
                      <div className="p-4 text-sm shadow-sm relative leading-relaxed rounded-2xl rounded-tl-sm border bg-emerald-50 border-emerald-200 text-emerald-900">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-[13px]">Proceed to build</span>
                          <span className="text-[11px] uppercase tracking-wide text-emerald-700">Ready</span>
                        </div>
                        <p className="mt-2 text-[13px]">{msg.content}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-[12px] bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={onProceedToBuild}
                            disabled={proceedToBuildDisabled || proceedingToBuild || disabled || !automationVersionId}
                          >
                            {proceedingToBuild ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                Submitting…
                              </>
                            ) : (
                              "Proceed to Build"
                            )}
                          </Button>
                          {proceedToBuildDisabled && proceedToBuildReason ? (
                            <span className="text-[11px] text-emerald-900/80">{proceedToBuildReason}</span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className={`p-4 text-sm shadow-sm relative leading-relaxed ${
                            msg.role === "user"
                              ? "bg-white text-[#0A0A0A] rounded-2xl rounded-tr-sm border border-gray-200"
                              : "bg-[#F3F4F6] text-[#0A0A0A] rounded-2xl rounded-tl-sm border border-transparent"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <span className="text-[10px] text-gray-400 px-1 block">
                          {msg.optimistic ? "Sending…" : formatTimestamp(msg.createdAt)}
                        </span>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </MessageList>

      {panelActivity ? <BuildActivityPanel activity={panelActivity} /> : null}

      <Composer
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
          className="hidden"
        />

        <AttachmentList files={attachedFiles} onRemove={handleRemoveFile} />

        <div className="relative flex items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || !automationVersionId || isUploadingFile || isSending || isAwaitingReply}
              className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
              title="Attach file"
            >
              {isUploadingFile ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
            </button>
          </div>
          <input
            type="text"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={
              workflowEmpty ? "Describe the workflow, systems, and exceptions..." : "Capture refinements or clarifications..."
            }
            className="w-full bg-white text-[#0A0A0A] placeholder:text-gray-400 text-sm rounded-xl py-3 pl-10 pr-12 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E43632]/10 focus:border-[#E43632] transition-all shadow-sm hover:border-gray-300"
            disabled={disabled || !automationVersionId || isSending || isAwaitingReply}
          />
          <button
            onClick={() => handleSend()}
            disabled={(!input.trim() && attachedFiles.length === 0) || disabled || isSending || !automationVersionId || isAwaitingReply}
            className="absolute right-1.5 p-2 bg-[#E43632] text-white rounded-lg hover:bg-[#C12E2A] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </Composer>
    </div>
  );
}
