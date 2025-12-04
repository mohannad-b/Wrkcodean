import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { StudioChat } from "@/components/automations/StudioChat";

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
      />
    );

    await waitFor(() => expect(screen.getByText("Persisted hello")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/automation-versions/version-123/messages", { cache: "no-store" });
  });

  it("shows starter prompts and seeds the input", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-starter/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-starter"
        blueprintEmpty
      />
    );

    await waitFor(() => expect(screen.getByTestId("starter-prompt-0")).toBeInTheDocument());
    const promptButton = screen.getByTestId("starter-prompt-0");
    fireEvent.click(promptButton);
    const input = screen.getByPlaceholderText("Describe the workflow, systems, and exceptions...");
    expect(input).toHaveValue(
      "I receive invoices by email and need to extract the data into our accounting system."
    );
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
                  conversationPhase: "flow",
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
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText(/WrkCoPilot is thinking/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Digesting what you're trying to accomplish")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Hello! Let’s build this automation.")).toBeInTheDocument());
  });

  it("does not render a conversation phase banner even when the server provides one", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-phase/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      if (target === "/api/automation-versions/version-phase/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: { id: "user-msg", role: "user", content: "Need help", createdAt: new Date().toISOString() },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-phase/copilot/reply" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "assistant-msg",
                role: "assistant",
                content: "Here's the plan.",
                createdAt: new Date().toISOString(),
              },
              conversationPhase: "details",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-phase"
        blueprintEmpty={false}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Need help" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText("Here's the plan.")).toBeInTheDocument());
    expect(screen.queryByText(/Refining edge cases and handoffs/i)).toBeNull();
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
        onBlueprintUpdates={onBlueprintUpdates}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(onBlueprintUpdates).toHaveBeenCalledWith({ steps: [{ id: "step_ai", title: "AI Suggested" }] }));
  });

  it("keeps the lightweight thinking bubble even when server sends contextual labels", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-ctx/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      if (target === "/api/automation-versions/version-ctx/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "user-msg",
                role: "user",
                content: "Need to scrape a booking platform",
                createdAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-ctx/copilot/reply" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "assistant-msg",
                role: "assistant",
                content: "Here is a summary.",
                createdAt: new Date().toISOString(),
              },
              thinkingSteps: [
                { id: "flow_requirements", label: "Mapped scraping flow and requirements for booking-platform pricing" },
                { id: "objectives_success", label: "Captured lead gen objectives" },
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
        automationVersionId="version-ctx"
        blueprintEmpty={false}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Need to scrape a booking platform" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByText("Digesting what you're trying to accomplish")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText("Mapped scraping flow and requirements for booking-platform pricing")).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByText("Captured lead gen objectives")).toBeInTheDocument());
  });

  it("shows thinking bubble before assistant reply renders", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-thinking/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      if (target === "/api/automation-versions/version-thinking/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: { id: "user-msg", role: "user", content: "Need help", createdAt: new Date().toISOString() },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-thinking/copilot/reply" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "assistant-msg",
                role: "assistant",
                content: "Final reply for you.",
                createdAt: new Date().toISOString(),
              },
              thinkingSteps: [
                { id: "ts-1", label: "Analyzing your request for context" },
                { id: "ts-2", label: "Connecting it to the right systems" },
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
        automationVersionId="version-thinking"
        blueprintEmpty={false}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Need help" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByTestId("thinking-bubble")).toBeInTheDocument());
    const bubble = screen.getByTestId("thinking-bubble");
    const bubbleBody = bubble.querySelector("div.p-4");
    expect(screen.getAllByTestId("thinking-bubble")).toHaveLength(1);
    await waitFor(() => expect(screen.getByText(/WrkCoPilot is thinking/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Analyzing your request for context")).toBeInTheDocument());
    expect(screen.queryByText("Final reply for you.")).toBeNull();
    expect(bubbleBody).not.toBeNull();
    expect(bubbleBody).toHaveClass("bg-white");

    await waitFor(() => expect(screen.getByText("Final reply for you.")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("thinking-bubble")).toBeNull());
  });

  it("shows default bullets until server thinking steps arrive", async () => {
    fetchMock.mockImplementation((url, init) => {
      const target = typeof url === "string" ? url : url.url;
      const method = init?.method ?? "GET";
      if (target === "/api/automation-versions/version-default-thinking/messages" && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      if (target === "/api/automation-versions/version-default-thinking/messages" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: { id: "user-msg", role: "user", content: "Need help", createdAt: new Date().toISOString() },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (target === "/api/automation-versions/version-default-thinking/copilot/reply" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                id: "assistant-msg",
                role: "assistant",
                content: "Here you go.",
                createdAt: new Date().toISOString(),
              },
              thinkingSteps: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-default-thinking"
        blueprintEmpty={false}
      />
    );

    const input = await screen.findByPlaceholderText("Capture refinements or clarifications...");
    fireEvent.change(input, { target: { value: "Need help" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.getByTestId("thinking-bubble")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Digesting what you're trying to accomplish")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Mapping how the systems should connect")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Drafting the next blueprint updates")).toBeInTheDocument());

    await waitFor(() => expect(screen.getByText("Here you go.")).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("thinking-bubble")).toBeNull());
  });
});

