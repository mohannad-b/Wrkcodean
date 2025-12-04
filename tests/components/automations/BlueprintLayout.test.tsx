import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioChat } from "@/components/automations/StudioChat";
import { StudioCanvas } from "@/components/automations/StudioCanvas";
import { StudioInspector } from "@/components/automations/StudioInspector";

describe("Blueprint workspace shell", () => {
  it("renders Copilot, canvas, and inspector without legacy create cards", () => {
    render(
      <div className="flex w-full h-[600px]">
        <div className="w-[320px] border">
          <StudioChat
            automationVersionId={null}
            blueprintEmpty
          />
        </div>
        <div className="flex-1 border">
          <StudioCanvas nodes={[]} edges={[]} />
        </div>
        <div className="w-[320px] border">
          <StudioInspector step={null} onClose={() => {}} onChange={() => {}} onDelete={() => {}} />
        </div>
      </div>
    );

    expect(screen.queryByText(/Create Blueprint/i)).toBeNull();
    expect(screen.getByTestId("copilot-pane")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-pane")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-placeholder")).toBeInTheDocument();
    expect(screen.getByText(/Select a step to edit/i)).toBeInTheDocument();
  });
});

