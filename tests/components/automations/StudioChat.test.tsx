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
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }, 5)
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

    await waitFor(() => expect(screen.getByText("Copilot is thinking…")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Hello! Let’s build this automation.")).toBeInTheDocument());
  });
});

