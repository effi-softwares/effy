import { describe, expect, it } from "vitest";

import { adjustmentGst, gstOf, invoiceTotals, isValidAbn, money } from "./gst";

describe("096 — GST arithmetic (R15)", () => {
  it("one eleventh, rounded half up", () => {
    expect(gstOf(1100)).toBe(100);
    expect(gstOf(1000)).toBe(91); // 90.909…
    expect(gstOf(5)).toBe(0); // 0.4545
    expect(gstOf(6)).toBe(1); // 0.5454
    expect(gstOf(0)).toBe(0);
    expect(gstOf(1155 - 0)).toBe(105);
  });

  it("taxable and GST-free lines, after discounts, with fees per the treatment", () => {
    const lines = [
      { name: "Milk", quantity: 2, amountCents: 900, taxable: false },
      { name: "Soap", quantity: 1, amountCents: 550 - 50, taxable: true }, // 50c promotion off
    ];
    const t = invoiceTotals(lines, [{ label: "Delivery", cents: 990 }, { label: "Small-order fee", cents: 0 }], "taxable");
    expect(t.fees).toEqual([{ label: "Delivery", cents: 990, taxable: true }]);
    expect(t.taxableCents).toBe(500 + 990);
    expect(t.gstFreeCents).toBe(900);
    expect(t.totalCents).toBe(2390);
    expect(t.gstCents).toBe(135); // 1490 / 11 = 135.45
    const free = invoiceTotals(lines, [{ label: "Delivery", cents: 990 }], "gst_free");
    expect(free.gstCents).toBe(45); // 500 / 11 = 45.45
    expect(free.gstFreeCents).toBe(1890);
  });

  it("an all GST-free basket has no GST", () => {
    expect(invoiceTotals([{ name: "Bread", quantity: 1, amountCents: 500, taxable: false }], [], "gst_free").gstCents).toBe(0);
  });

  it("adjustments: itemised by their lines (plus any fee refunded with them), amount-only by the invoice's share", () => {
    const invoice = { gstCents: 135, totalCents: 2390 };
    expect(adjustmentGst({ amountCents: 500, lines: [{ amountCents: 500, taxable: true }] }, invoice, "taxable")).toBe(45);
    expect(adjustmentGst({ amountCents: 900, lines: [{ amountCents: 900, taxable: false }] }, invoice, "taxable")).toBe(0);
    // Soap refunded with the delivery fee, fees taxable: (500 + 990) / 11.
    expect(adjustmentGst({ amountCents: 1490, lines: [{ amountCents: 500, taxable: true }] }, invoice, "taxable")).toBe(135);
    // Goodwill $10: 1000 × 135 / 2390 = 56.48 → 56.
    expect(adjustmentGst({ amountCents: 1000 }, invoice, "taxable")).toBe(56);
    expect(adjustmentGst({ amountCents: 1000 }, { gstCents: 0, totalCents: 0 }, "taxable")).toBe(0);
  });

  it("validates an ABN by its checksum", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true); // the ABR's published example
    expect(isValidAbn("51824753557")).toBe(false);
    expect(isValidAbn("1234567890")).toBe(false);
    expect(isValidAbn("[ABN]")).toBe(false);
  });

  it("formats cents", () => {
    expect(money(2390)).toBe("23.90");
    expect(money(5)).toBe("0.05");
    expect(money(-135)).toBe("-1.35");
  });
});
