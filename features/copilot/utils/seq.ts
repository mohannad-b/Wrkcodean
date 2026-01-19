export function shouldAcceptSeq(
  seenSeqByRunId: Map<string, Set<number>>,
  runId: string,
  seq?: number | null
) {
  if (seq === undefined || seq === null) return true;
  let set = seenSeqByRunId.get(runId);
  if (!set) {
    set = new Set<number>();
    seenSeqByRunId.set(runId, set);
  }
  const already = set.has(seq);
  if (already) return false;
  set.add(seq);
  return true;
}
