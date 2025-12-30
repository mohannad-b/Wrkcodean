import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CopilotReadinessCard } from "@/components/automations/CopilotReadinessCard";
import { createEmptyCopilotAnalysisState } from "@/lib/workflows/copilot-analysis";

describe("CopilotReadinessCard", () => {
  it("renders readiness score and todos", () => {
    const analysis = createEmptyCopilotAnalysisState();
    analysis.readiness.score = 72;
    analysis.sections.business_requirements = {
      textSummary: "Need live booking-platform pricing feed.",
      confidence: "medium",
      source: "user_input",
      missingInfo: [],
    };
    analysis.sections.business_objectives = {
      textSummary: "Automate nightly car rental price scraping.",
      confidence: "high",
      source: "ai_inferred",
      missingInfo: [],
    };
    analysis.todos = [
      {
        id: "todo-1",
        category: "systems_access",
        description: "Connect booking-platform API credentials.",
        status: "open",
      },
      {
        id: "todo-2",
        category: "data_mapping",
        description: "Confirm fields needed for pricing table.",
        status: "open",
      },
      {
        id: "todo-3",
        category: "human_touchpoints",
        description: "Ops to review unusual price swings.",
        status: "resolved",
      },
    ];

    render(<CopilotReadinessCard analysis={analysis} />);

    expect(screen.getByText("72/100")).toBeInTheDocument();
    expect(screen.getByText("2/8")).toBeInTheDocument();
    expect(screen.getByText(/Connect booking-platform API credentials/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm fields needed/)).toBeInTheDocument();
  });
});


