type ProgressPhase = "connected" | "understanding" | "drafting" | "structuring" | "drawing" | "saving" | "done" | "error";
type SemanticKey = string;

export type ProgressEvent = {
  runId: string;
  requestId: string;
  phase: ProgressPhase;
  message: string;
  meta?: Record<string, unknown>;
  seq?: number;
};

export class ProgressPlanner {
  private lastMessage: string | null = null;
  private normalizedMessages = new Set<string>();
  private emittedKeys = new Set<SemanticKey>();
  private emittedCount = 0;
  private intentSummary: string | null = null;
  private maxEmits: number;
  private onEmit: (event: ProgressEvent) => void;
  private runId: string;
  private requestId: string;
  private seq = 0;
  private lastPhase: ProgressPhase | null = null;

  constructor(params: { runId: string; requestId: string; onEmit: (event: ProgressEvent) => void; maxEmits?: number }) {
    this.runId = params.runId;
    this.requestId = params.requestId;
    this.onEmit = params.onEmit;
    this.maxEmits = params.maxEmits ?? 8;
  }

  setIntentSummary(value: string | null) {
    if (value && value.trim().length > 0) {
      this.intentSummary = this.clamp(value.trim());
    }
  }

  emit(phase: ProgressPhase, providedMessage?: string, meta?: Record<string, unknown>, semanticKey?: SemanticKey) {
    if (this.emittedCount >= this.maxEmits) return null;
    if (semanticKey && this.emittedKeys.has(semanticKey)) return null;

    if (!providedMessage && this.emittedCount > 0 && this.lastPhase === phase) {
      return null;
    }

    const message = this.chooseMessage(phase, providedMessage);
    const normalized = this.normalize(message);
    if (this.lastMessage === normalized || this.normalizedMessages.has(normalized)) return null;

    if (!this.isValidEvent(message)) return null;

    this.lastMessage = normalized;
    this.lastPhase = phase;
    this.normalizedMessages.add(normalized);
    this.emittedCount += 1;
    if (semanticKey) this.emittedKeys.add(semanticKey);

    const event: ProgressEvent = {
      runId: this.runId,
      requestId: this.requestId,
      phase,
      message: this.clamp(message),
      meta,
      seq: ++this.seq,
    };
    this.onEmit(event);
    return event;
  }

  private chooseMessage(phase: ProgressPhase, provided?: string): string {
    if (provided && provided.trim().length > 0) return this.clamp(provided.trim());
    const intent = this.intentSummary;
    if (this.emittedCount === 0) {
      return intent ? `Got it — ${intent}` : "Got it — working on it";
    }

    const PHASE_COPY: Record<ProgressPhase, string> = {
      connected: "Working on your workflow…",
      understanding: "Reviewing your request",
      drafting: "Drafting workflow steps and branches",
      structuring: "Renumbering steps and updating the graph",
      drawing: "Updating the diagram",
      saving: "Saving workflow changes",
      done: "Saved. Ready for review.",
      error: "Run failed. Retry?",
    };
    const base = PHASE_COPY[phase] ?? "Working…";
    return this.clamp(base);
  }

  private clamp(value: string) {
    return value.length > 110 ? `${value.slice(0, 107)}...` : value;
  }

  private normalize(value: string) {
    return this.clamp(value)
      .replace(/\u2026/g, "...")
      .replace(/\.{3,}/g, "...")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private isValidEvent(message: string) {
    if (!this.runId || this.runId.trim().length === 0) return false;
    if (!message || message.trim().length === 0) return false;
    return true;
  }
}

export function validateStatusPayload(payload: ProgressEvent): boolean {
  if (!payload) return false;
  const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const seqValid = payload.seq === undefined ? true : Number.isFinite(payload.seq);
  return Boolean(runId && message) && seqValid;
}

