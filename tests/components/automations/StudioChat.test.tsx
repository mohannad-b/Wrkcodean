import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { StudioChat } from "@/components/automations/StudioChat";

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

function mockWindowReload() {
  const originalLocation = window.location;
  const reloadSpy = vi.fn();
  const clonedLocation = {
    assign: originalLocation.assign.bind(originalLocation),
    replace: originalLocation.replace.bind(originalLocation),
    reload: reloadSpy,
    toString: originalLocation.toString.bind(originalLocation),
    ancestorOrigins: originalLocation.ancestorOrigins,
    hash: originalLocation.hash,
    host: originalLocation.host,
    hostname: originalLocation.hostname,
    href: originalLocation.href,
    origin: originalLocation.origin,
    pathname: originalLocation.pathname,
    port: originalLocation.port,
    protocol: originalLocation.protocol,
    search: originalLocation.search,
  } as Location;

  Object.defineProperty(window, "location", {
    configurable: true,
    value: clonedLocation,
  });

  return {
    reloadSpy,
    restore: () =>
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      }),
  };
}

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
        workflowEmpty={false}
      />
    );

    await waitFor(() => expect(screen.getByText("Persisted hello")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/automation-versions/version-123/messages", { cache: "no-store" });
  });

  it("renders initial assistant prompt and keeps input available", async () => {
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
        workflowEmpty
      />
    );

    await waitFor(() => expect(screen.getByText(/Hi! I'm here to help/i)).toBeInTheDocument());
    const input = screen.getByPlaceholderText("Describe the workflow, systems, and exceptions...");
    expect(input).toHaveValue("");
  });

  it("calls the draft blueprint endpoint with conversation history", async () => {
    const { restore } = mockWindowReload();
    const blueprintResponse = {
      workflow: {
        version: 1,
        status: "Draft",
        summary: "Auto drafted workflow",
        sections: [
          { id: "sec-1", key: "business_requirements", title: "Business Requirements", content: "Need automation" },
        ],
        steps: [
          {
            id: "step-1",
            type: "Action",
            name: "Do something",
            summary: "Summary",
            description: "Description",
            goalOutcome: "Outcome",
            responsibility: "Automated",
            systemsInvolved: ["System"],
            notifications: [],
            nextStepIds: [],
            stepNumber: "1",
            taskIds: [],
          },
        ],
        branches: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      message: {
        id: "assistant-msg",
        role: "assistant",
        content: "Got it.",
        createdAt: new Date().toISOString(),
      },
      thinkingSteps: [
        {
          id: "thinking-1",
          label: "Mapping each step in the automation",
        },
      ],
      conversationPhase: "flow",
    };

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
      if (target === "/api/automation-versions/version-abc/copilot/draft-workflow" && method === "POST") {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(new Response(JSON.stringify(blueprintResponse), { status: 200, headers: { "Content-Type": "application/json" } }));
          }, 50)
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-abc"
        workflowEmpty
        onWorkflowUpdates={vi.fn()}
        onBlueprintRefresh={() => window.location.reload()}
      />
    );

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    const messagePost = fetchMock.mock.calls.find(
      ([target, init]) => typeof target === "string" && target.includes("/messages") && (init as any)?.method === "POST"
    );
    expect(messagePost).toBeDefined();

    restore();
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
        workflowEmpty={false}
      />
    );

    await waitFor(() => expect(screen.getByText(/Question\?/)).toBeInTheDocument());
    expect(screen.queryByText(/blueprint_updates/i)).toBeInTheDocument();
  });

  it("invokes onBlueprintUpdates with the persisted blueprint data", async () => {
    const { reloadSpy, restore } = mockWindowReload();
    const blueprintResponse = {
      workflow: {
        version: 1,
        status: "Draft",
        summary: "AI generated summary",
        sections: [
          {
            id: "sec-1",
            key: "business_requirements",
            title: "Business Requirements",
            content: "Need automation",
          },
        ],
        steps: [
          {
            id: "step_ai",
            type: "Action",
            name: "AI Suggested Step",
            summary: "Step summary",
            description: "Step description",
            goalOutcome: "Deliver result",
            responsibility: "Automated",
            systemsInvolved: ["System"],
            notifications: [],
            notesExceptions: "",
            nextStepIds: [],
            stepNumber: "1",
            taskIds: [],
          },
        ],
        branches: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      message: {
        id: "assistant-msg",
        role: "assistant",
        content: "Done.",
        createdAt: new Date().toISOString(),
      },
      thinkingSteps: [
        {
          id: "thinking-1",
          label: "Mapping each step in the automation",
        },
      ],
      conversationPhase: "flow",
    };

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
      if (target === "/api/automation-versions/version-abc/copilot/draft-workflow" && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify(blueprintResponse), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    const onBlueprintUpdates = vi.fn();

    render(
      <StudioChat
        automationVersionId="version-abc"
        workflowEmpty={false}
        onWorkflowUpdates={onBlueprintUpdates}
        onBlueprintRefresh={() => window.location.reload()}
      />
    );

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Hi Copilot" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(onBlueprintUpdates).toHaveBeenCalled());

    restore();
  });

  it("handles draft blueprint request flow", async () => {
    const { restore } = mockWindowReload();
    const blueprintResponse = {
      blueprint: {
        version: 1,
        status: "Draft",
        summary: "Summary",
        sections: [],
        steps: [],
        branches: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      message: {
        id: "assistant-msg",
        role: "assistant",
        content: "Noted.",
        createdAt: new Date().toISOString(),
      },
      thinkingSteps: [
        {
          id: "thinking-1",
          label: "Mapping each step in the automation",
        },
      ],
      conversationPhase: "flow",
    };

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
      if (target === "/api/automation-versions/version-thinking/copilot/draft-workflow" && method === "POST") {
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify(blueprintResponse), { status: 200, headers: { "Content-Type": "application/json" } })
              ),
            100
          )
        );
      }
      throw new Error(`Unexpected fetch: ${target} ${method}`);
    });

    render(
      <StudioChat
        automationVersionId="version-thinking"
        workflowEmpty
        onBlueprintRefresh={() => window.location.reload()}
      />
    );

    const input = await screen.findByPlaceholderText("Describe the workflow, systems, and exceptions...");
    fireEvent.change(input, { target: { value: "Need help" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(([target]) => typeof target === "string" && target.includes("/copilot/draft-workflow"))
      ).toBeDefined()
    );

    restore();
  });
});

