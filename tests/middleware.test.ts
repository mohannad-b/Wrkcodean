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
    delete process.env.AUTH0_MOCK_ENABLED;
  });

  it("returns 401 for protected API routes without a session", async () => {
    middlewareMock.mockResolvedValue(NextResponse.next());
    getSessionMock.mockResolvedValue(null);

    const { middleware } = await import("../middleware");
    const request = new NextRequest("http://localhost/api/automations");

    const response = await middleware(request);
    expect(response.status).toBe(401);
  });
});


