import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: any[]) => any>(fn: T) => fn,
}));

const membershipRows: Array<{ role: string; tenantId: string }> = [];

const selectMock = vi.fn(() => ({
  from: () => ({
    where: () => Promise.resolve([...membershipRows]),
  }),
}));

const usersFindFirstMock = vi.fn();
const membershipsFindFirstMock = vi.fn();
const auth0GetSessionMock = vi.fn();

vi.mock("@/lib/auth/auth0", () => ({
  default: {
    getSession: auth0GetSessionMock,
  },
}));

vi.mock("@/db/schema", () => ({
  memberships: { role: "role", tenantId: "tenantId" },
  users: { id: "id", auth0Id: "auth0Id", email: "email" },
}));

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    query: {
      users: { findFirst: usersFindFirstMock },
      memberships: { findFirst: membershipsFindFirstMock },
    },
    insert: vi.fn(() => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: "new-id" }]),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    })),
  },
}));

async function loadSessionModule() {
  vi.resetModules();
  return await import("@/lib/auth/session");
}

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipRows.length = 0;
    delete process.env.AUTH0_MOCK_ENABLED;
    delete process.env.MOCK_TENANT_ID;
    delete process.env.MOCK_USER_ID;
    delete process.env.DEFAULT_TENANT_ID;
  });

  it("returns the mock session when AUTH0_MOCK_ENABLED=true", async () => {
    process.env.AUTH0_MOCK_ENABLED = "true";
    process.env.MOCK_TENANT_ID = "tenant-123";
    process.env.MOCK_USER_ID = "user-123";
    membershipRows.push({ role: "owner", tenantId: "tenant-123" });

    const { getSession } = await loadSessionModule();
    const session = await getSession();

    expect(session).toEqual({
      tenantId: "tenant-123",
      userId: "user-123",
      roles: ["owner"],
    });
  });

  it("returns Auth0-backed session when memberships exist", async () => {
    process.env.AUTH0_MOCK_ENABLED = "false";
    membershipRows.push({ role: "admin", tenantId: "tenant-abc" });

    usersFindFirstMock.mockResolvedValue({ id: "user-abc", auth0Id: "auth0|abc", email: "ops@example.com" });
    membershipsFindFirstMock.mockResolvedValue(null);
    auth0GetSessionMock.mockResolvedValue({
      user: {
        sub: "auth0|abc",
        email: "ops@example.com",
        name: "Ops Admin",
      },
    });

    const { getSession } = await loadSessionModule();
    const session = await getSession();

    expect(session).toEqual({
      tenantId: "tenant-abc",
      userId: "user-abc",
      roles: ["admin"],
    });
    expect(auth0GetSessionMock).toHaveBeenCalled();
  });
});

