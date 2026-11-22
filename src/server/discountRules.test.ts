import { describe, expect, it } from "vitest";
import { applyDiscount, discountStatus, shippingFor } from "./discountRules";

const base = {
  code: "SPRING",
  kind: "percentage" as const,
  value: 10,
  minSubtotal: null,
  usageLimit: null,
  usageCount: 0,
  startsAt: null,
  endsAt: null,
  enabled: true,
};
const now = new Date("2026-05-01T12:00:00Z");

describe("discount rules", () => {
  it("takes a percentage off", () => {
    expect(applyDiscount(base, 4800, now)).toEqual({ amount: 480 });
  });
  it("never takes more than the subtotal", () => {
    expect(
      applyDiscount({ ...base, kind: "fixed", value: 9000 }, 4800, now),
    ).toEqual({ amount: 4800 });
  });
  it("refuses below the minimum", () => {
    expect(applyDiscount({ ...base, minSubtotal: 5000 }, 4800, now)).toHaveProperty("refused");
  });
  it("reports each status", () => {
    expect(discountStatus({ ...base, enabled: false }, now)).toBe("disabled");
    expect(discountStatus({ ...base, usageLimit: 2, usageCount: 2 }, now)).toBe("used up");
    expect(discountStatus({ ...base, startsAt: "2026-06-01T00:00:00Z" }, now)).toBe("scheduled");
    expect(discountStatus({ ...base, endsAt: "2026-04-01T00:00:00Z" }, now)).toBe("expired");
    expect(discountStatus(base, now)).toBe("active");
  });
  it("ships free at the threshold", () => {
    expect(shippingFor(7500, 500, 7500)).toBe(0);
    expect(shippingFor(7499, 500, 7500)).toBe(500);
    expect(shippingFor(100, 500, null)).toBe(500);
  });
});
