import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { StudioChat } from "@/components/automations/StudioChat";
import { createEmptyCopilotAnalysisState } from "@/lib/blueprint/copilot-analysis";

describe("StudioChat", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders previously saved messages", async () => {
    fetchMock.mockImplementation((url, init) => {
      const method = init?.method ?? "GET";
      if (
        method === "GET" &&
        typeof url === "string" &&
        url === "/api/automation-versions/version-123/messages"
      ) {
        return Promise.resolve(
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
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

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

  it("appends assistant reply after sending a user message", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-abc/messages" && method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-abc/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "user-msg",
                role: "user",
                content: "Hi Copilot",
                createdAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-abc/copilot/reply" && method === "POST") {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  message: {
                    id: "assistant-msg",
                    role: "assistant",
                    content: "Hello! Let’s build this automation.",
                    createdAt: new Date().toISOString(),
                  },
                  blueprintUpdates: {
                    steps: [],
                    sections: {},
                    assumptions: [],
                  },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }, 100)
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-abc"
        blueprintEmpty={false}
        onDraftBlueprint={async () => {}}
        isDrafting={false}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText(/WRK Copilot is analyzing/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Map flow & core requirements")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Hello! Let’s build this automation.")).toBeInTheDocument());
  });

  it("strips blueprint JSON from loaded assistant messages", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-legacy/messages" && method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [
                {
                  id: "assistant-msg",
                  role: "assistant",
                  content: "- Summary\n```json blueprint_updates\n{\"steps\":[{\"id\":\"legacy\"}]}\n```\nQuestion?",
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-legacy"
        blueprintEmpty={false}
        onDraftBlueprint={async () => {}}
        isDrafting={false}
      />
    );

    await waitFor(() => expect(screen.getByText(/Question\?/)).toBeInTheDocument());
    expect(screen.queryByText(/blueprint_updates/i)).toBeNull();
  });

  it("invokes onBlueprintUpdates when AI returns updates", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-abc/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      if (target === "/api/automation-versions/version-abc/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: { id: "user-msg", role: "user", content: "Hi Copilot", createdAt: new Date().toISOString() },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-abc/copilot/reply" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "assistant-msg",
                role: "assistant",
                content: "Here is a summary.",
                createdAt: new Date().toISOString(),
              },
              blueprintUpdates: {
                steps: [{ id: "step_ai", title: "AI Suggested" }],
              },
              analysis: null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    const onBlueprintUpdates = vi.fn();

    render(
      <StudioChat
        automationVersionId="version-abc"
        blueprintEmpty={false}
        onDraftBlueprint={async () => {}}
        isDrafting={false}
        onBlueprintUpdates={onBlueprintUpdates}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(onBlueprintUpdates).toHaveBeenCalledWith({ steps: [{ id: "step_ai", title: "AI Suggested" }] }));
  });

  it("invokes onCopilotAnalysis when analysis payload is returned", async () => {
    const analysis = createEmptyCopilotAnalysisState();
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-abc/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      if (target === "/api/automation-versions/version-abc/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: { id: "user-msg", role: "user", content: "Hi Copilot", createdAt: new Date().toISOString() },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-abc/copilot/reply" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "assistant-msg",
                role: "assistant",
                content: "Here is a summary.",
                createdAt: new Date().toISOString(),
              },
              blueprintUpdates: null,
              analysis,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    const onCopilotAnalysis = vi.fn();

    render(
      <StudioChat
        automationVersionId="version-abc"
        blueprintEmpty={false}
        onDraftBlueprint={async () => {}}
        isDrafting={false}
        onCopilotAnalysis={onCopilotAnalysis}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(onCopilotAnalysis).toHaveBeenCalledWith(analysis));
  });
});

