import { describe, it, expect, beforeEach, vi } from "vitest";

const insertValuesMock = vi.fn();
const insertMock = vi.fn(() => ({ values: insertValuesMock }));
const selectWhereMock = vi.fn();
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const updateWhereMock = vi.fn();
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: selectFromMock }),
    insert: insertMock,
    update: () => ({ set: updateSetMock }),
  },
}));

vi.mock("@/db/schema", () => ({
  projects: { id: "projects.id", tenantId: "projects.tenantId" },
  discountOffers: {
    id: "discountOffers.id",
    tenantId: "discountOffers.tenantId",
    automationVersionId: "discountOffers.automationVersionId",
    code: "discountOffers.code",
    percent: "discountOffers.percent",
    appliesTo: "discountOffers.appliesTo",
    kind: "discountOffers.kind",
    expiresAt: "discountOffers.expiresAt",
    usedAt: "discountOffers.usedAt",
  },
}));

import { ensureDiscountOffersForVersion, findActiveDiscountByCode } from "@/lib/services/discounts";

describe("discounts service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates first-workflow offers (10% + 25%) when no projects exist", async () => {
    selectWhereMock.mockResolvedValueOnce([]); // isFirstWorkflow: projects empty
    selectWhereMock.mockResolvedValueOnce([]); // existing offers for this version
    insertValuesMock.mockResolvedValue(undefined);

    await ensureDiscountOffersForVersion("t1", "v1");

    expect(insertValuesMock).toHaveBeenCalled();
    const rows = insertValuesMock.mock.calls[0][0];
    const percents = rows.map((r: any) => Number(r.percent)).sort();
    expect(percents).toEqual([0.1, 0.25]);
  });

  it("creates followup offers (5% + 10%) when projects exist", async () => {
    selectWhereMock.mockResolvedValueOnce([{ id: "p1" }]); // isFirstWorkflow: one project exists
    selectWhereMock.mockResolvedValueOnce([]); // existing offers for this version
    insertValuesMock.mockResolvedValue(undefined);

    await ensureDiscountOffersForVersion("t1", "v1");

    const rows = insertValuesMock.mock.calls[0][0];
    const percents = rows.map((r: any) => Number(r.percent)).sort();
    expect(percents).toEqual([0.05, 0.1]);
  });

  it("finds an active discount by code when not expired or used", async () => {
    const now = new Date();
    selectWhereMock.mockResolvedValueOnce([
      {
        id: "d1",
        tenantId: "t1",
        code: "FIRST-ABC",
        percent: 0.1,
        appliesTo: "setup_fee",
        expiresAt: new Date(now.getTime() + 3600 * 1000),
        usedAt: null,
      },
    ]);

    const found = await findActiveDiscountByCode("t1", "FIRST-ABC");
    expect(found?.code).toBe("FIRST-ABC");
  });
});

