import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StudioInspector } from "@/components/automations/StudioInspector";
import type { BlueprintStep } from "@/lib/workflows/types";

const baseStep: BlueprintStep = {
  id: "step-1",
  type: "Action",
  name: "Test step",
  summary: "Do something important",
  description: "",
  goalOutcome: "Goal",
  responsibility: "Automated",
  notesExceptions: "",
  systemsInvolved: [],
  timingSla: undefined,
  riskLevel: undefined,
  notifications: [],
  notesForOps: "",
  exceptionIds: [],
  nextStepIds: [],
  stepNumber: "1",
  taskIds: ["task-1"],
};

describe("StudioInspector", () => {
  it("renders responsibility tabs and key fields", () => {
    render(
      <StudioInspector
        step={baseStep}
        onClose={() => {}}
        onChange={vi.fn()}
        onDelete={() => {}}
        clientName="Acme"
      />
    );

    expect(screen.getAllByText("Wrk").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Acme").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Human in the loop")).toBeInTheDocument();
    expect(screen.getByText(/Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Goal \/ Outcome/i)).toBeInTheDocument();
    expect(screen.getByText(/Notes \/ Exceptions/i)).toBeInTheDocument();
    expect(screen.getByText(/Systems Involved/i)).toBeInTheDocument();
    expect(screen.getByText(/Notes for Ops Team/i)).toBeInTheDocument();
  });

  it("renders step tasks and calls onViewTask when clicked", () => {
    const onViewTask = vi.fn();
    render(
      <StudioInspector
        step={baseStep}
        onClose={() => {}}
        onChange={vi.fn()}
        onDelete={() => {}}
        clientName="Acme"
        tasks={[
          {
            id: "task-1",
            title: "Do thing",
            description: "Details",
            status: "pending",
            priority: "important",
            metadata: { relatedSteps: ["1"] },
          },
        ]}
        onViewTask={onViewTask}
      />
    );

    const task = screen.getByText(/Do thing/i);
    expect(task).toBeInTheDocument();
    fireEvent.click(task);
    expect(onViewTask).toHaveBeenCalledWith("task-1");
  });
});

