export function normalizeProgressLine(line: string): string {
  return line
    .replace(/\u2026/g, "...")
    .replace(/\.{3,}/g, "...")
    .replace(/\s*\.\.\./g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function isIntentLine(line: string): boolean {
  return normalizeProgressLine(line).toLowerCase().startsWith("got it —");
}

function isTerminalLine(line: string): boolean {
  const norm = normalizeProgressLine(line);
  return /saved\. ready for review\./i.test(norm) || /run failed\. retry\?/i.test(norm);
}

export function appendDisplayLine(
  existing: string[],
  incoming: string,
  options?: { max?: number }
): string[] {
  const max = options?.max ?? 8;
  const normalizedIncoming = normalizeProgressLine(incoming).toLowerCase();
  if (normalizedIncoming.length === 0) return existing;

  const normalizedSet = new Set(existing.map((line) => normalizeProgressLine(line).toLowerCase()));
  if (normalizedSet.has(normalizedIncoming)) return existing;

  const tagged = [...existing, incoming].map((line) => ({
    line,
    keep: isIntentLine(line) || isTerminalLine(line),
  }));
  if (!Number.isFinite(max) || max === Number.POSITIVE_INFINITY || tagged.length <= max) {
    return tagged.map((t) => t.line);
  }

  let result = [...tagged];
  while (result.length > max) {
    const dropIdx = result.findIndex((t) => !t.keep);
    if (dropIdx === -1) break;
    result.splice(dropIdx, 1);
  }

  return result.map((t) => t.line);
}

