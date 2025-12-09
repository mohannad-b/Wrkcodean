import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskDrawer } from "@/app/(studio)/automations/[automationId]/page";
import type { VersionTask } from "@/db/schema";

const baseTask: VersionTask = {
  id: "task-1",
  tenantId: "t1",
  automationVersionId: "ver-1",
  title: "Sample task",
  description: "Do the thing",
  status: "pending",
  priority: "important",
  metadata: { notes: "initial", relatedSteps: ["1"] },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("TaskDrawer", () => {
  it("saves with current status when Save Changes clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TaskDrawer task={baseTask} onClose={() => {}} onSave={onSave} saving={false} />);

    fireEvent.click(screen.getByText("Save Changes"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        description: "Do the thing",
        metadata: expect.objectContaining({ notes: "initial" }),
      })
    );
  });

  it("saves as complete when Mark Complete clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TaskDrawer task={baseTask} onClose={() => {}} onSave={onSave} saving={false} />);

    fireEvent.click(screen.getByText("Mark Complete"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "complete" }));
  });

  it("calls onClose when Discard Changes is clicked", () => {
    const onClose = vi.fn();
    render(<TaskDrawer task={baseTask} onClose={onClose} onSave={vi.fn()} saving={false} />);

    fireEvent.click(screen.getByText("Discard Changes"));

    expect(onClose).toHaveBeenCalled();
  });
});

