export interface DiscountRow {
  code: string;
  kind: "percentage" | "fixed";
  value: number;
  minSubtotal: number | null;
  usageLimit: number | null;
  usageCount: number;
  startsAt: string | null;
  endsAt: string | null;
  enabled: boolean;
}

export type DiscountStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "disabled"
  | "used up";

export function discountStatus(d: DiscountRow, now: Date): DiscountStatus {
  if (!d.enabled) return "disabled";
  if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return "used up";
  if (d.startsAt && new Date(d.startsAt) > now) return "scheduled";
  if (d.endsAt && new Date(d.endsAt) <= now) return "expired";
  return "active";
}

/** The amount off a subtotal, or the reason the code doesn't apply. */
export function applyDiscount(
  d: DiscountRow,
  subtotal: number,
  now: Date,
): { amount: number } | { refused: string } {
  const status = discountStatus(d, now);
  if (status !== "active") {
    return { refused: `The code ${d.code} isn't valid right now.` };
  }
  if (d.minSubtotal !== null && subtotal < d.minSubtotal) {
    return { refused: `The code ${d.code} needs a larger order.` };
  }
  const amount =
    d.kind === "percentage"
      ? Math.round((subtotal * d.value) / 100)
      : d.value;
  return { amount: Math.min(amount, subtotal) };
}

/** Flat rate, or free once the discounted subtotal reaches the threshold. */
export function shippingFor(
  subtotalAfterDiscount: number,
  rate: number,
  freeThreshold: number | null,
): number {
  if (freeThreshold !== null && subtotalAfterDiscount >= freeThreshold) return 0;
  return rate;
}
