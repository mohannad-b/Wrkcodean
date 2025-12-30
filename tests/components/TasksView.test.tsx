import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { TasksView } from "@/components/tasks/TasksView";

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({ push: vi.fn() }),
  };
});

describe("TasksView", () => {
  it("disables workflow navigation when task is not linked", async () => {
    render(<TasksView />);

    await userEvent.click(screen.getByText("Reconnect Xero Integration"));
    const button = await screen.findByRole("button", { name: /View in Workflow/i });

    expect(button).toBeDisabled();
  });
});

