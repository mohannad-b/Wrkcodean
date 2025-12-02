import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StudioChat } from "@/components/automations/StudioChat";

describe("StudioChat", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: "msg-1",
              role: "assistant",
              content: "Persisted hello",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders previously saved messages", async () => {
    render(
      <StudioChat
        automationVersionId="version-123"
        blueprintEmpty={false}
        onDraftBlueprint={async () => {}}
        isDrafting={false}
      />
    );

    await waitFor(() => expect(screen.getByText("Persisted hello")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/automation-versions/version-123/messages", { cache: "no-store" });
  });
});

