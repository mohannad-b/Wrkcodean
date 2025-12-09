export type AutomationTask = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "complete";
  priority: "blocker" | "important" | "optional";
  metadata?: Record<string, unknown> | null;
};

/**
 * Returns all non-completed tasks that block setup or are marked important.
 */
export function getAttentionTasks(tasks: AutomationTask[]): AutomationTask[] {
  return tasks.filter(
    (task) =>
      (task.priority === "blocker" || task.priority === "important") && task.status !== "complete"
  );
}

