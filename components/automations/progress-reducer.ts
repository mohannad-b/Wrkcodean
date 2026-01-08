export function normalizeProgressLine(line: string): string {
  return line
    .replace(/\u2026/g, "...")
    .replace(/\.{3,}/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function isIntentLine(line: string): boolean {
  return normalizeProgressLine(line).startsWith("got it —");
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
  const normalizedIncoming = normalizeProgressLine(incoming);
  if (normalizedIncoming.length === 0) return existing;

  const normalizedSet = new Set(existing.map(normalizeProgressLine));
  if (normalizedSet.has(normalizedIncoming)) return existing;

  const tagged = [...existing, incoming].map((line) => ({
    line,
    keep: isIntentLine(line) || isTerminalLine(line),
  }));
  if (!Number.isFinite(max) || max === Number.POSITIVE_INFINITY || tagged.length <= max) {
    return tagged.map((t) => t.line);
  }

  const center = Math.floor(tagged.length / 2);
  const removable = tagged
    .map((t, idx) => ({ idx, distance: Math.abs(idx - center), keep: t.keep }))
    .filter((t) => !t.keep)
    .sort((a, b) => {
      if (a.distance === b.distance) return a.idx - b.idx;
      return a.distance - b.distance;
    });

  let result = [...tagged];
  let removeIdx = 0;
  while (result.length > max && removeIdx < removable.length) {
    const idx = removable[removeIdx].idx;
    if (idx >= 0 && idx < result.length && !result[idx].keep) {
      result.splice(idx, 1);
      // shift remaining indices
      for (let j = removeIdx + 1; j < removable.length; j++) {
        if (removable[j].idx > idx) removable[j].idx -= 1;
      }
    }
    removeIdx += 1;
  }

  // Final guard: if still over cap (unlikely), drop earliest non-kept items from the front.
  while (result.length > max) {
    const dropIdx = result.findIndex((t) => !t.keep);
    if (dropIdx === -1) break;
    result.splice(dropIdx, 1);
  }

  return result.map((t) => t.line);
}

