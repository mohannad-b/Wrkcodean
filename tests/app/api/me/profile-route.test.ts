import { describe, it, expect, beforeEach, vi } from "vitest";
import type { UserProfileResult } from "@/lib/user/profile";

const requireTenantSessionMock = vi.fn();
const getTenantScopedProfileMock = vi.fn();
const updateUserProfileMock = vi.fn();
const logAuditMock = vi.fn();
const handleApiErrorMock = vi.fn((error: { status?: number; message?: string }) => {
  const status = error?.status ?? 500;
  const body = JSON.stringify({ error: error?.message ?? "Unexpected error." });
  return new Response(body, { status });
});

class MockApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: handleApiErrorMock,
  ApiError: MockApiError,
}));

vi.mock("@/lib/user/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/user/profile")>("@/lib/user/profile");
  return {
    ...actual,
    getTenantScopedProfile: getTenantScopedProfileMock,
    updateUserProfile: updateUserProfileMock,
  };
});

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

async function loadHandlers() {
  return await import("@/app/api/me/profile/route");
}

const session = { userId: "user-1", tenantId: "tenant-1", roles: ["admin"] };
const profileResult: UserProfileResult = {
  profile: {
    id: "user-1",
    name: "Alex Morgan",
    email: "alex@example.com",
    title: "Automation Lead",
    avatarUrl: "https://example.com/avatar.png",
    timezone: "America/New_York",
    notificationPreference: "all",
  },
  lastUpdatedAt: "2024-11-15T12:00:00.000Z",
};

describe("/api/me/profile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getTenantScopedProfileMock.mockResolvedValue(profileResult);
    updateUserProfileMock.mockResolvedValue(profileResult);
    requireTenantSessionMock.mockResolvedValue(session);
  });

  describe("GET", () => {
    it("returns the current user's profile", async () => {
      const { GET } = await loadHandlers();
      const response = await GET();

      expect(response.status).toBe(200);
      const body = (await response.json()) as UserProfileResult;
      expect(body).toEqual(profileResult);
      expect(getTenantScopedProfileMock).toHaveBeenCalledWith(session);
    });

    it("returns 404 when the user is not scoped to the tenant", async () => {
      getTenantScopedProfileMock.mockResolvedValue(null);
      const { GET } = await loadHandlers();
      const response = await GET();

      expect(response.status).toBe(404);
    });

    it("propagates unauthorized errors from the session helper", async () => {
      requireTenantSessionMock.mockRejectedValue(new MockApiError(401, "Unauthorized"));
      const { GET } = await loadHandlers();
      const response = await GET();

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH", () => {
    const baseRequestInit = {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    };

    it("updates editable fields for the current user", async () => {
      const { PATCH } = await loadHandlers();
      const response = await PATCH(
        new Request("http://localhost/api/me/profile", {
          ...baseRequestInit,
          body: JSON.stringify({
            name: "Alexandra Morgan",
            title: "",
            avatarUrl: "https://example.com/new-avatar.png",
            timezone: "America/Chicago",
            notificationPreference: "mentions",
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(updateUserProfileMock).toHaveBeenCalledWith(session, {
        name: "Alexandra Morgan",
        title: null,
        avatarUrl: "https://example.com/new-avatar.png",
        timezone: "America/Chicago",
        notificationPreference: "mentions",
      });
      expect(logAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.profile.update",
          resourceId: profileResult.profile.id,
        })
      );
    });

    it("rejects unknown fields like email", async () => {
      const { PATCH } = await loadHandlers();
      const response = await PATCH(
        new Request("http://localhost/api/me/profile", {
          ...baseRequestInit,
          body: JSON.stringify({ email: "new@example.com" }),
        })
      );

      expect(response.status).toBe(400);
      expect(updateUserProfileMock).not.toHaveBeenCalled();
      const body = (await response.json()) as { formErrors: string[] };
      expect(body.formErrors?.[0]).toContain("Unrecognized");
    });

    it("validates timezone format", async () => {
      const { PATCH } = await loadHandlers();
      const response = await PATCH(
        new Request("http://localhost/api/me/profile", {
          ...baseRequestInit,
          body: JSON.stringify({ timezone: "NotATimezone" }),
        })
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { fieldErrors: Record<string, string[]> };
      expect(body.fieldErrors.timezone?.[0]).toContain("Timezone");
    });

    it("returns 400 when no editable fields are provided", async () => {
      const { PATCH } = await loadHandlers();
      const response = await PATCH(
        new Request("http://localhost/api/me/profile", {
          ...baseRequestInit,
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("No editable fields");
    });

    it("propagates unauthorized errors from the session helper", async () => {
      requireTenantSessionMock.mockRejectedValue(new MockApiError(401, "Unauthorized"));
      const { PATCH } = await loadHandlers();
      const response = await PATCH(
        new Request("http://localhost/api/me/profile", {
          ...baseRequestInit,
          body: JSON.stringify({ name: "Test" }),
        })
      );

      expect(response.status).toBe(401);
    });
  });
});

