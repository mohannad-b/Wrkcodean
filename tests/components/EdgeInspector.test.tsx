import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EdgeInspector } from "@/components/automations/EdgeInspector";

describe("EdgeInspector", () => {
  it("renders selected edge and forwards edits", async () => {
    const handleChange = vi.fn();
    render(
      <EdgeInspector
        edge={{
          id: "edge-a-b",
          label: "Approve",
          branchLetter: "A",
          condition: "Amount > $1000",
          sourceName: "Decision",
          targetName: "Approve path",
        }}
        onChange={handleChange}
        onDelete={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText(/Branch label/i), " Updated");
    await userEvent.type(screen.getByLabelText(/Condition/i), " and flagged");

    expect(handleChange).toHaveBeenCalled();
  });
});

