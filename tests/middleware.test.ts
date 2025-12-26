import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const middlewareMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/lib/auth/auth0", () => ({
  default: {
    middleware: middlewareMock,
    getSession: getSessionMock,
  },
}));

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.AUTH0_MOCK_ENABLED = "false";
  });

  it("persists workspaceId from query into activeWorkspaceId cookie", async () => {
    middlewareMock.mockResolvedValue(NextResponse.next());
    getSessionMock.mockResolvedValue({ user: { sub: "u1" } });

    const { middleware } = await import("../middleware");
    const request = new NextRequest("http://localhost/dashboard?workspaceId=abc123");

    const response = await middleware(request);
    const cookie = response.cookies.get("activeWorkspaceId");
    expect(cookie?.value).toBe("abc123");
  });
});


