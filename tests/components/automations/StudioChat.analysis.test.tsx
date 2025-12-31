import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioChat } from "@/components/automations/StudioChat";

vi.mock("@/components/providers/user-profile-provider", () => ({
  useUserProfile: () => ({ profile: null }),
}));

describe("StudioChat analysis rendering", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // @ts-ignore
    global.fetch = fetchMock;
  });

  it("renders analysis from props and does not fetch analysis on mount", () => {
    render(
      <StudioChat
        automationVersionId="version-1"
        workflowEmpty={false}
        analysis={{
          sections: {},
          todos: [],
          humanTouchpoints: [],
          readiness: { score: 0, stateItemsSatisfied: [], stateItemsMissing: [], blockingTodos: [] },
          version: "v1",
          lastUpdatedAt: new Date().toISOString(),
          memory: {
            summary_compact: null,
            facts: {},
            question_count: 0,
            asked_questions_normalized: [],
            stage: "systems",
          },
          stage: "systems",
          assumptions: [{ text: "Assume daily run", status: "assumed" }],
          facts: { trigger_cadence: "daily" },
          progress: { assessedAt: new Date().toISOString(), overallScore: 0.5, missingInformation: [], sections: [] },
        }}
        analysisLoading={false}
      />
    );

    expect(screen.getByText("SYSTEMS")).toBeInTheDocument();
    expect(screen.getByText(/Assume daily run/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

