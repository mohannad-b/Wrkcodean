export const QUOTE_STATUSES = ["DRAFT", "SENT", "SIGNED", "REJECTED"] as const;
export type QuoteLifecycleStatus = (typeof QUOTE_STATUSES)[number];

const DB_STATUS_MAP: Record<QuoteLifecycleStatus, "draft" | "sent" | "accepted" | "rejected"> = {
  DRAFT: "draft",
  SENT: "sent",
  SIGNED: "accepted",
  REJECTED: "rejected",
};

const DB_TO_API = Object.fromEntries(Object.entries(DB_STATUS_MAP).map(([api, db]) => [db, api])) as Record<
  string,
  QuoteLifecycleStatus
>;

const QUOTE_TRANSITIONS: Record<QuoteLifecycleStatus, QuoteLifecycleStatus[]> = {
  DRAFT: ["SENT", "REJECTED"],
  SENT: ["SIGNED", "REJECTED"],
  SIGNED: [],
  REJECTED: [],
};

export function parseQuoteStatus(input: unknown): QuoteLifecycleStatus | null {
  if (typeof input !== "string") {
    return null;
  }
  const normalized = input.trim().toUpperCase();
  return (QUOTE_STATUSES as readonly string[]).includes(normalized) ? (normalized as QuoteLifecycleStatus) : null;
}

export function toDbQuoteStatus(status: QuoteLifecycleStatus): string {
  return DB_STATUS_MAP[status];
}

export function fromDbQuoteStatus(dbStatus: string): QuoteLifecycleStatus {
  return DB_TO_API[dbStatus] ?? "DRAFT";
}

export function canQuoteTransition(from: QuoteLifecycleStatus, to: QuoteLifecycleStatus): boolean {
  if (from === to) {
    return true;
  }
  const allowed = QUOTE_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}


