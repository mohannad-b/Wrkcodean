import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveWorkspace } from "@/lib/workspaces/useActiveWorkspace";

const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("useActiveWorkspace", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
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

    await waitFor(() => {
      expect(result.current.memberships).toHaveLength(2);
    });

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

