import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, type Task, type TaskMetadata } from "@/db/schema";
import type { Blueprint } from "./types";
import type { AITask } from "./ai-builder-simple";

export type TaskAssignmentMap = Record<string, string[]>;

const TITLE_STOP_WORDS = new Set([
  "provide", "request", "access", "connect", "add", "setup", "configure",
  "the", "a", "an", "to", "for", "and", "or", "oauth", "api", "credentials",
]);

function tokenizeTitle(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !TITLE_STOP_WORDS.has(t));
  return new Set(tokens);
}

function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = tokenizeTitle(a);
  const tokensB = tokenizeTitle(b);
  if (tokensA.size === 0 && tokensB.size === 0) return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export async function syncAutomationTasks({
  tenantId,
  automationVersionId,
  aiTasks,
  blueprint,
  workflow,
}: {
  tenantId: string;
  automationVersionId: string;
  aiTasks: AITask[];
  blueprint: Blueprint;
  workflow?: Blueprint;
}): Promise<TaskAssignmentMap> {
  const workflowSpec = workflow ?? blueprint;
  const assignments: TaskAssignmentMap = {};
  workflowSpec.steps.forEach((step) => {
    if (step.taskIds?.length) {
      assignments[step.id] = [...step.taskIds];
    }
  });

  if (aiTasks.length === 0) {
    return assignments;
  }

  const existingTasks: Task[] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.tenantId, tenantId), eq(tasks.automationVersionId, automationVersionId)));

  const stepIdByNumber = new Map<string, string>();
  workflowSpec.steps.forEach((step) => {
    if (step.stepNumber) {
      stepIdByNumber.set(step.stepNumber, step.id);
    }
  });
  const stepIdByNormalizedNumber = new Map<string, string>();
  const normalizeStepKey = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  workflowSpec.steps.forEach((step) => {
    if (step.stepNumber) {
      stepIdByNormalizedNumber.set(normalizeStepKey(step.stepNumber), step.id);
    }
  });

  let matchedCount = 0;
  let createdCount = 0;

  for (const aiTask of aiTasks) {
    const title = aiTask.title?.trim();
    if (!title) {
      continue;
    }
    const normalizedTitle = title.toLowerCase();
    const normalizedSystemType = aiTask.systemType?.trim().toLowerCase();
    const relatedStepNumbers = Array.isArray(aiTask.relatedSteps)
      ? aiTask.relatedSteps
          .map((step) => {
            if (typeof step === "string") return step.trim();
            if (typeof step === "number") return String(step).trim();
            return "";
          })
          .filter((value): value is string => Boolean(value))
      : [];
    const relatedStepIds = relatedStepNumbers
      .map((stepNumber) => stepIdByNumber.get(stepNumber) ?? stepIdByNormalizedNumber.get(normalizeStepKey(stepNumber)))
      .filter((value): value is string => Boolean(value));

    // Fallback: if no related steps resolved, attach to the last non-trigger step (or last step)
    let fallbackStepId: string | null = null;
    if (relatedStepIds.length === 0 && workflowSpec.steps.length > 0) {
      const nonTrigger = [...workflowSpec.steps].reverse().find((s) => s.type !== "Trigger");
      const lastStep = workflowSpec.steps[workflowSpec.steps.length - 1];
      fallbackStepId = nonTrigger?.id ?? lastStep.id;
      relatedStepIds.push(fallbackStepId);
    }

    const metadata: TaskMetadata = {
      systemType: normalizedSystemType,
      relatedSteps: relatedStepNumbers,
      isBlocker: mapTaskPriority(aiTask.priority) === "blocker",
    };

    const TITLE_SIMILARITY_THRESHOLD = 0.65;
    const match = existingTasks.find((task) => {
      const taskSystem = task.metadata?.systemType?.toLowerCase();
      if (taskSystem !== normalizedSystemType) return false;
      if (task.title.toLowerCase() === normalizedTitle) return true;
      return titleSimilarity(task.title, title) >= TITLE_SIMILARITY_THRESHOLD;
    });

    let taskId: string;
    if (match) {
      const mergedRelatedSteps = Array.from(
        new Set([...(match.metadata?.relatedSteps ?? []), ...relatedStepNumbers])
      );
      const shouldUpdate =
        match.description !== (aiTask.description ?? match.description) ||
        match.priority !== mapTaskPriority(aiTask.priority) ||
        (match.metadata?.systemType ?? undefined) !== normalizedSystemType ||
        (match.metadata?.isBlocker ?? false) !== metadata.isBlocker ||
        mergedRelatedSteps.length !== (match.metadata?.relatedSteps ?? []).length;

      if (shouldUpdate) {
        await db
          .update(tasks)
          .set({
            description: aiTask.description ?? match.description,
            priority: mapTaskPriority(aiTask.priority),
            metadata: {
              ...match.metadata,
              systemType: normalizedSystemType,
              relatedSteps: mergedRelatedSteps,
              isBlocker: metadata.isBlocker,
            },
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, match.id));

        match.description = aiTask.description ?? match.description;
        match.priority = mapTaskPriority(aiTask.priority);
        match.metadata = {
          ...match.metadata,
          systemType: normalizedSystemType,
          relatedSteps: mergedRelatedSteps,
          isBlocker: metadata.isBlocker,
        };
      }
      taskId = match.id;
      matchedCount += 1;
    } else {
      const [inserted] = await db
        .insert(tasks)
        .values({
          tenantId,
          automationVersionId,
          title,
          description: aiTask.description ?? "",
          status: "pending",
          priority: mapTaskPriority(aiTask.priority),
          metadata,
        })
        .returning();

      if (!inserted) {
        continue;
      }

      taskId = inserted.id;
      existingTasks.push(inserted);
      createdCount += 1;
    }

    relatedStepIds.forEach((stepId) => {
      if (!assignments[stepId]) {
        assignments[stepId] = [];
      }
      if (!assignments[stepId].includes(taskId)) {
        assignments[stepId].push(taskId);
      }
    });
  }

  return assignments;
}

export function mapTaskPriority(priority?: string): "blocker" | "important" | "optional" {
  const normalized = priority?.toLowerCase();
  if (normalized === "blocker" || normalized === "blocking" || normalized === "critical") {
    return "blocker";
  }
  if (normalized === "optional" || normalized === "nice_to_have") {
    return "optional";
  }
  return "important";
}

