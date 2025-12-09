import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioInspector } from "@/components/automations/StudioInspector";
import type { BlueprintStep } from "@/lib/blueprint/types";

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
  taskIds: [],
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

    expect(screen.getByText("Wrk")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Human in the loop")).toBeInTheDocument();
    expect(screen.getByText(/Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Goal \/ Outcome/i)).toBeInTheDocument();
    expect(screen.getByText(/Notes \/ Exceptions/i)).toBeInTheDocument();
    expect(screen.getByText(/Systems Involved/i)).toBeInTheDocument();
    expect(screen.getByText(/Notes for Ops Team/i)).toBeInTheDocument();
  });
});

