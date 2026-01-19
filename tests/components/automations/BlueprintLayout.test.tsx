import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioChat } from "@/features/copilot/ui/chat";
import { StudioCanvas } from "@/features/workflows/ui/canvas/StudioCanvas";
import { StudioInspector } from "@/components/automations/StudioInspector";

vi.mock("@/components/providers/user-profile-provider", () => ({
  useUserProfile: () => ({
    profile: {
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      avatarUrl: null,
    },
  }),
}));

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

    expect(screen.getByTestId("copilot-pane")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-pane")).toBeInTheDocument();
    expect(screen.getByText(/No Step Selected/i)).toBeInTheDocument();
    expect(screen.getByText(/Click on a block in the canvas to edit/i)).toBeInTheDocument();
  });
});

