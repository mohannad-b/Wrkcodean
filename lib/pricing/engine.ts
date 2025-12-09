import { roundToPlaces } from "@/lib/utils/numbers";

export type WorkflowComplexity = "basic" | "medium" | "complex_rpa";

export type WrkActionEstimate = {
  actionType: string;
  count: number;
};

export type WrkActionCatalog = Record<
  string,
  {
    listPrice: number; // price per action execution
  }
>;

export type DiscountInput = {
  code?: string | null;
  percent?: number | null; // 0-1
  source: "code" | "ops";
};

export type PricingInput = {
  complexity: WorkflowComplexity;
  estimatedActions: WrkActionEstimate[];
  actionCatalog: WrkActionCatalog;
  estimatedVolume?: number | null;
  discounts?: DiscountInput[];
  currency?: string;
};

export type PricingResult = {
  setupFee: number;
  baseSetupFee: number;
  setupFeeDiscountTotal: number;
  unitPrice: number;
  effectiveUnitPrice: number;
  estimatedVolume: number;
  currency: string;
  estimatedActionCost: number;
  discountsApplied: Array<Required<DiscountInput> & { amount: number }>;
};

const BASE_BUILD_FEES: Record<WorkflowComplexity, number> = {
  basic: 1000,
  medium: 2500,
  complex_rpa: 5000,
};

const DEFAULT_VOLUME = 1000;
const DEFAULT_CURRENCY = "USD";

function normalizePercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function applyDiscounts(base: number, discounts: DiscountInput[] = []) {
  let running = base;
  const applied: Array<Required<DiscountInput> & { amount: number }> = [];
  for (const d of discounts) {
    const pct = normalizePercent(d.percent);
    if (pct <= 0) continue;
    const amount = roundToPlaces(running * pct, 2);
    running = roundToPlaces(running - amount, 2);
    applied.push({
      code: d.code ?? null,
      percent: pct,
      source: d.source,
      amount,
    });
  }
  return { value: running, applied };
}

export function priceWorkflow(input: PricingInput): PricingResult {
  const baseSetupFee = BASE_BUILD_FEES[input.complexity] ?? BASE_BUILD_FEES.basic;
  const discounts = input.discounts ?? [];
  const { value: setupFee, applied: discountsApplied } = applyDiscounts(baseSetupFee, discounts);

  const catalog = input.actionCatalog ?? {};
  const estimatedActionCost = roundToPlaces(
    (input.estimatedActions ?? []).reduce((sum, action) => {
      const unit = catalog[action.actionType]?.listPrice ?? 0;
      return sum + unit * Math.max(action.count, 0);
    }, 0),
    4
  );

  const estimatedVolume = input.estimatedVolume && input.estimatedVolume > 0 ? input.estimatedVolume : DEFAULT_VOLUME;
  // Counts are per-outcome; unit price should reflect per-outcome cost (no division by estimated volume).
  const unitPrice = roundToPlaces(estimatedActionCost, 4);

  return {
    setupFee,
    baseSetupFee,
    setupFeeDiscountTotal: roundToPlaces(baseSetupFee - setupFee, 2),
    unitPrice,
    effectiveUnitPrice: unitPrice,
    estimatedVolume,
    currency: input.currency ?? DEFAULT_CURRENCY,
    estimatedActionCost,
    discountsApplied,
  };
}

