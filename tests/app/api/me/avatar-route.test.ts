import { describe, it, expect, beforeEach, vi } from "vitest";

const requireTenantSessionMock = vi.fn();
const handleApiErrorMock = vi.fn((error: { status?: number; message?: string }) => {
  const status = error?.status ?? 500;
  return new Response(JSON.stringify({ error: error?.message ?? "Unexpected error." }), { status });
});

class MockApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const storeAvatarFileMock = vi.fn();
const updateUserProfileMock = vi.fn();
const getTenantScopedProfileMock = vi.fn();
const logAuditMock = vi.fn();

class MockAvatarStorageError extends Error {}

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: handleApiErrorMock,
  ApiError: MockApiError,
}));

vi.mock("@/lib/storage/avatar-upload", () => ({
  storeAvatarFile: storeAvatarFileMock,
  AvatarStorageError: MockAvatarStorageError,
}));

vi.mock("@/lib/user/profile", () => ({
  updateUserProfile: updateUserProfileMock,
  getTenantScopedProfile: getTenantScopedProfileMock,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

async function loadAvatarHandlers() {
  vi.resetModules();
  return await import("@/app/api/me/avatar/route");
}

async function loadProfileHandlers() {
  return await import("@/app/api/me/profile/route");
}

const session = { userId: "user-1", tenantId: "tenant-1", roles: ["viewer"] };

const profileResult = {
  profile: {
    id: "user-1",
    name: "Alex Morgan",
    email: "alex@example.com",
    title: "Ops Lead",
    avatarUrl: "https://example.com/avatar.png",
    timezone: "America/New_York",
    notificationPreference: "all" as const,
  },
  lastUpdatedAt: "2024-12-01T00:00:00.000Z",
};

function createFormDataRequest(formData: FormData) {
  return {
    formData: async () => formData,
  } as unknown as Request;
}

describe("POST /api/me/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue(session);
    storeAvatarFileMock.mockResolvedValue({ url: profileResult.profile.avatarUrl });
    updateUserProfileMock.mockResolvedValue(profileResult);
    getTenantScopedProfileMock.mockResolvedValue(profileResult);
  });

  it("requires authentication", async () => {
    requireTenantSessionMock.mockRejectedValue(new MockApiError(401, "Unauthorized"));
    const { POST } = await loadAvatarHandlers();
    const response = await POST(createFormDataRequest(new FormData()));

    expect(response.status).toBe(401);
  });

  it("rejects requests without a file", async () => {
    const { POST } = await loadAvatarHandlers();
    const formData = new FormData();
    const response = await POST(createFormDataRequest(formData));

    expect(response.status).toBe(400);
    expect(storeAvatarFileMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME types", async () => {
    const { POST } = await loadAvatarHandlers();
    const file = new File(["hello"], "avatar.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(createFormDataRequest(formData));

    expect(response.status).toBe(400);
    expect(storeAvatarFileMock).not.toHaveBeenCalled();
  });

  it("rejects files that exceed the size limit", async () => {
    const { POST } = await loadAvatarHandlers();
    const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(createFormDataRequest(formData));

    expect(response.status).toBe(400);
    expect(storeAvatarFileMock).not.toHaveBeenCalled();
  });

  it("uploads the avatar and updates the profile", async () => {
    const { POST } = await loadAvatarHandlers();
    const file = new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(createFormDataRequest(formData));

    expect(response.status).toBe(200);
    expect(storeAvatarFileMock).toHaveBeenCalledWith({
      file,
      tenantId: session.tenantId,
      userId: session.userId,
    });
    expect(updateUserProfileMock).toHaveBeenCalledWith(session, { avatarUrl: profileResult.profile.avatarUrl });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.avatar.update",
        resourceId: profileResult.profile.id,
      })
    );
  });

  it("surfaces storage failures", async () => {
    storeAvatarFileMock.mockRejectedValue(new MockAvatarStorageError("storage offline"));
    const { POST } = await loadAvatarHandlers();
    const file = new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(createFormDataRequest(formData));

    expect(response.status).toBe(503);
    expect(updateUserProfileMock).not.toHaveBeenCalled();
  });

  it("returns the updated avatar via the profile endpoint", async () => {
    const { POST } = await loadAvatarHandlers();
    const file = new File([new Uint8Array([9, 9, 9])], "avatar.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const updatedProfile = {
      ...profileResult,
      profile: {
        ...profileResult.profile,
        avatarUrl: "https://example.com/new-avatar.png",
      },
    };

    updateUserProfileMock.mockResolvedValueOnce(updatedProfile);

    const postResponse = await POST(createFormDataRequest(formData));

    expect(postResponse.status).toBe(200);

    getTenantScopedProfileMock.mockResolvedValueOnce(updatedProfile);
    const { GET } = await loadProfileHandlers();
    const getResponse = await GET();
    const body = (await getResponse.json()) as typeof updatedProfile;

    expect(body.profile.avatarUrl).toBe(updatedProfile.profile.avatarUrl);
  });
});

