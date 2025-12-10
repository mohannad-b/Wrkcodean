import { describe, it, expect } from "vitest";
import { priceWorkflow } from "@/lib/pricing/engine";

describe("priceWorkflow discounts", () => {
  it("applies unit price discount separately from setup fee discount", () => {
    const result = priceWorkflow({
      complexity: "medium",
      estimatedActions: [{ actionType: "wrkaction-1", count: 10 }],
      actionCatalog: { "wrkaction-1": { listPrice: 1 } },
      discounts: [
        { source: "code", percent: 0.1, appliesTo: "setup_fee" }, // 10% off setup fee
        { source: "ops", percent: 0.2, appliesTo: "unit_price" }, // 20% off unit price
      ],
      estimatedVolume: 1000,
      currency: "USD",
    });

    expect(result.setupFee).toBeCloseTo(2250, 2); // 2500 * 0.9
    expect(result.unitPrice).toBeCloseTo(8, 2); // 10 action cost * 0.8
    expect(result.discountsApplied.length).toBe(2);
  });
});

