import { describe, it, expect } from "vitest";
import { priceWorkflow } from "@/lib/pricing/engine";

describe("priceWorkflow", () => {
  it("sets unitPrice to per-outcome action cost (no division by volume)", () => {
    const result = priceWorkflow({
      complexity: "basic",
      estimatedVolume: 1000,
      estimatedActions: [{ actionType: "wrkaction-79", count: 5 }],
      actionCatalog: { "wrkaction-79": { listPrice: 0.25 } },
      discounts: [],
      currency: "USD",
    });
    // 5 * 0.25 = 1.25 per outcome
    expect(result.unitPrice).toBe(1.25);
    expect(result.effectiveUnitPrice).toBe(1.25);
  });
});

