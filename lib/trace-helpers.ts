export type StepLike = { id?: string; name?: string; stepNumber?: string };

export function previewText(value: string | null | undefined, max = 80): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

export function buildStepSignature(steps: StepLike[] = []) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const stepNames = safeSteps.map((step, idx) => {
    const num = (step.stepNumber ?? `${idx + 1}`).toString().trim() || `${idx + 1}`;
    const name = (step.name ?? `Step ${idx + 1}`).toString().trim() || `Step ${idx + 1}`;
    return `${num}:${name.replace(/\s+/g, " ")}`;
  });

  const stepsSig = stepNames.map((name) => name.toLowerCase()).join("|");
  return {
    stepCount: safeSteps.length,
    stepsSig,
    stepNames,
  };
}

export function summarizeStepDiff(prev: string[] = [], next: string[] = [], limit = 5) {
  const prevNormalized = prev.map((name) => name.toLowerCase());
  const nextNormalized = next.map((name) => name.toLowerCase());
  const prevSet = new Set(prevNormalized);
  const nextSet = new Set(nextNormalized);

  const addedStepNames = next.filter((_, idx) => !prevSet.has(nextNormalized[idx])).slice(0, limit);
  const removedStepNames = prev.filter((_, idx) => !nextSet.has(prevNormalized[idx])).slice(0, limit);

  const renamedStepPairs: Array<{ from: string; to: string }> = [];
  const pairLimit = Math.min(limit, Math.max(prev.length, next.length));
  for (let index = 0; index < pairLimit; index += 1) {
    const from = prev[index];
    const to = next[index];
    if (!from || !to) continue;
    if (from.toLowerCase() === to.toLowerCase()) continue;
    renamedStepPairs.push({ from, to });
    if (renamedStepPairs.length >= limit) break;
  }

  return { addedStepNames, removedStepNames, renamedStepPairs };
}

export function taskSignature(tasks: Array<{ title?: string | null }> = []) {
  const titles = tasks
    .map((task, idx) => (task.title ?? `task_${idx + 1}`).toString().trim().toLowerCase())
    .filter(Boolean);
  return titles.join("|");
}

export function assignmentSignature(assignments: Record<string, string[]> = {}) {
  const pairs = Object.entries(assignments)
    .map(([stepId, taskIds]) => `${stepId}:${(taskIds ?? []).length}`)
    .sort();
  return pairs.join("|");
}
