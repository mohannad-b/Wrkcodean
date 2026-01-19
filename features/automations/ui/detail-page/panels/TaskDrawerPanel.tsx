import { TaskDrawer } from "@/components/automations/TaskDrawer";
import type { VersionTask } from "../types";

interface TaskDrawerPanelProps {
  task: VersionTask | null;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: { status?: VersionTask["status"]; description?: string | null; metadata?: Record<string, unknown> | null }) => void;
}

export function TaskDrawerPanel({ task, saving, onClose, onSave }: TaskDrawerPanelProps) {
  if (!task) return null;

  const handleSave = async (
    patch: { status?: VersionTask["status"]; description?: string | null; metadata?: Record<string, unknown> | null }
  ) => {
    onSave(patch);
  };

  return <TaskDrawer task={task} saving={saving} onClose={onClose} onSave={handleSave} />;
}
