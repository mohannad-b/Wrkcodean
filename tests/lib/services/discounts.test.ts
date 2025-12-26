import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertValuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const limitMock = vi.fn(async () => []);
  const selectWhereMock = vi.fn(async () => []);
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));

  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));

  return { insertValuesMock, insertMock, selectWhereMock, selectFromMock, updateWhereMock, updateSetMock, limitMock };
});

const schema = vi.hoisted(() => ({
  submissions: { id: "submissions.id", tenantId: "submissions.tenantId" },
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

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const thenable = {
            then: (resolve: (value: unknown) => void) => Promise.resolve(mocks.selectWhereMock(table)).then(resolve),
            limit: mocks.limitMock,
          };
          return thenable as any;
        },
      }),
    }),
    insert: mocks.insertMock,
    update: () => ({ set: mocks.updateSetMock }),
  },
}));

vi.mock("@/db/schema", () => schema);

import { ensureDiscountOffersForVersion, findActiveDiscountByCode } from "@/lib/services/discounts";

describe("discounts service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates first-workflow offers (10% + 25%) when no submissions exist", async () => {
    mocks.limitMock.mockResolvedValueOnce([]); // isFirstWorkflow: submissions empty
    mocks.selectWhereMock.mockResolvedValueOnce([]); // existing offers for this version
    mocks.insertValuesMock.mockResolvedValue(undefined);

    await ensureDiscountOffersForVersion("t1", "v1");

    expect(mocks.insertValuesMock).toHaveBeenCalled();
    const rows = mocks.insertValuesMock.mock.calls[0][0];
    const percents = rows.map((r: any) => Number(r.percent)).sort();
    expect(percents).toEqual([0.1, 0.25]);
  });

  it("creates followup offers (5% + 10%) when submissions exist", async () => {
    mocks.limitMock.mockResolvedValueOnce([{ id: "p1" }]); // isFirstWorkflow: one submission exists
    mocks.selectWhereMock.mockResolvedValueOnce([]); // existing offers for this version
    mocks.insertValuesMock.mockResolvedValue(undefined);

    await ensureDiscountOffersForVersion("t1", "v1");

    const rows = mocks.insertValuesMock.mock.calls[0][0];
    const percents = rows.map((r: any) => Number(r.percent)).sort();
    expect(percents).toEqual([0.05, 0.1]);
  });

  it("finds an active discount by code when not expired or used", async () => {
    const now = new Date();
    mocks.limitMock.mockResolvedValueOnce([
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

