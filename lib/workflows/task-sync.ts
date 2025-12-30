import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, type Task, type TaskMetadata } from "@/db/schema";
import type { Blueprint } from "./types";
import type { AITask } from "./ai-builder-simple";

export type TaskAssignmentMap = Record<string, string[]>;

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

  for (const aiTask of aiTasks) {
    const title = aiTask.title?.trim();
    if (!title) {
      continue;
    }
    const normalizedTitle = title.toLowerCase();
    const normalizedSystemType = aiTask.systemType?.trim().toLowerCase();
    const relatedStepNumbers = Array.isArray(aiTask.relatedSteps)
      ? aiTask.relatedSteps
          .map((step) => step?.trim())
          .filter((value): value is string => Boolean(value))
      : [];
    const relatedStepIds = relatedStepNumbers
      .map((stepNumber) => stepIdByNumber.get(stepNumber))
      .filter((value): value is string => Boolean(value));

    const metadata: TaskMetadata = {
      systemType: normalizedSystemType,
      relatedSteps: relatedStepNumbers,
      isBlocker: mapTaskPriority(aiTask.priority) === "blocker",
    };

    const match = existingTasks.find((task) => {
      const taskSystem = task.metadata?.systemType?.toLowerCase();
      return task.title.toLowerCase() === normalizedTitle && taskSystem === normalizedSystemType;
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

