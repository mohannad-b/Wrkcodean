import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVersionWithRedirect } from "@/app/(app)/(studio)/automations/[automationId]/create-version";

const fetchAutomationMock = vi.fn();
const setSelectedVersionIdMock = vi.fn();
const toastMock = vi.fn();

describe("createVersionWithRedirect", () => {
  beforeEach(() => {
    fetchAutomationMock.mockReset();
    setSelectedVersionIdMock.mockReset();
    toastMock.mockReset();
  });

  it("creates a version and focuses the new version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: { id: "v-new" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createVersionWithRedirect({
      automationId: "a1",
      copyFromVersionId: "v1",
      notes: "notes",
      selectedVersion: { summary: "sum", intakeNotes: "i-notes" },
      fetchAutomation: fetchAutomationMock,
      setSelectedVersionId: setSelectedVersionIdMock,
      toast: toastMock,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/automations/a1/versions", expect.any(Object));
    expect(fetchAutomationMock).toHaveBeenCalledWith({ preserveSelection: true });
    expect(setSelectedVersionIdMock).toHaveBeenCalledWith("v-new");
    expect(toastMock).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("throws when the API responds with an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "boom" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createVersionWithRedirect({
        automationId: "a1",
        copyFromVersionId: null,
        notes: "notes",
        selectedVersion: null,
        fetchAutomation: fetchAutomationMock,
        setSelectedVersionId: setSelectedVersionIdMock,
        toast: toastMock,
      })
    ).rejects.toThrow("boom");

    vi.unstubAllGlobals();
  });
});

