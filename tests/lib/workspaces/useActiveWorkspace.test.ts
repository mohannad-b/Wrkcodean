import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("react-dom/client", () => ({
  createRoot: () => ({
    render: () => {},
    unmount: () => {},
  }),
}));
vi.mock("@testing-library/react", () => ({
  renderHook: (fn: any) => {
    const result = { current: fn() };
    return { result };
  },
  act: async (cb: any) => {
    await cb();
  },
}));
import { renderHook } from "@testing-library/react";
import { useActiveWorkspace } from "@/lib/workspaces/useActiveWorkspace";

const fetchMock = vi.fn();

describe.skip("useActiveWorkspace", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
    // Minimal DOM stubs for testing-library
    // @ts-expect-error
    global.document = {
      cookie: "",
      body: {
        appendChild: () => {},
        removeChild: () => {},
        nodeType: 1,
      },
      createElement: () => ({
        nodeType: 1,
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        innerHTML: "",
      }),
      querySelector: () => null,
    };
    // @ts-expect-error
    global.window = { document: global.document, navigator: { userAgent: "test" } };
  });

  it("loads memberships and can switch workspace", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tenants: [
          { tenantId: "t1", tenantName: "Alpha", role: "owner" },
          { tenantId: "t2", tenantName: "Beta", role: "editor" },
        ],
      }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }), headers: {} });

    const { result } = renderHook(() => useActiveWorkspace());

    // wait for load
    await act(async () => {});

    expect(result.current.memberships).toHaveLength(2);

    await act(async () => {
      await result.current.setActiveWorkspace("t2");
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/me/active-workspace",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-workspace-id": "t2" }),
      })
    );
  });
});

