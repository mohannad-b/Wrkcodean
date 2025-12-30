import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConditionEdge from "@/components/flow/ConditionEdge";
import { ReactFlowProvider } from "reactflow";

function renderEdge() {
  render(
    <ReactFlowProvider>
      <svg>
        <ConditionEdge
          id="edge-a-b"
          source="a"
          target="b"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={100}
          sourcePosition="bottom"
          targetPosition="top"
          selected
          data={{ label: "Approve Branch", conditionText: "Amount exceeds $1,000" }}
        />
      </svg>
    </ReactFlowProvider>
  );
}

describe("ConditionEdge", () => {
  it("shows explain popover with condition text", async () => {
    renderEdge();
    await userEvent.click(screen.getByText("Approve Branch"));
    await userEvent.click(screen.getByText("Explain"));

    expect(await screen.findByText(/Amount exceeds/i)).toBeVisible();
  });
});

