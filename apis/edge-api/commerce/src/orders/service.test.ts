import { describe, expect, it } from "vitest";

import type { OrdersRepository } from "./repository";
import { createOrdersService, OrderNotFoundError, refundBlock } from "./service";

/**
 * 070 — the shopper's receipt. Ported from the retired backend's own order tests: what the document
 * says, what it must never say, and which keys are ABSENT rather than empty.
 */
const ORDER = "11111111-1111-4111-8111-111111111111";
const scope = { log: { warn: () => undefined } } as never;

function repoWith(over: Partial<OrdersRepository> = {}): OrdersRepository {
  return {
    list: async () => [],
    get: async () => ({
      id: ORDER, order_number: "EFY-ABC123", status: "paid", placed_at: "2026-10-05 04:00:00+00",
      delivery_address: { recipientName: "A Customer", line1: "1 Test St", postalCode: "3121" }, billing_address: null,
      delivery_handover: null, delivery_note: null,
      item_subtotal_amount: "20.00", discount_amount: "0.00", promo_code: null, delivery_fee_amount: "6.00",
      grand_total_amount: "26.00", currency: "AUD", payment_status: "succeeded",
    }),
    items: async () => [
      { order_item_id: "i1", product_id: "p1", product_name: "Milk", unit_price_amount: "10.00", quantity: 2, line_subtotal_amount: "20.00", image_key: null },
    ],
    fulfillments: async () => [{ id: "f1", status: "pending", item_count: 2, subtotal_amount: "20.00" }],
    shortfalls: async () => [],
    arrivals: async () => [],
    paymentMethod: async () => null,
    refunds: async () => [],
    ...over,
  };
}
const read = (over: Partial<OrdersRepository> = {}, presign = async (k: string | null) => (k ? `https://img/${k}` : null)) =>
  createOrdersService({ repo: repoWith(over), presign }).get(scope, "cust", ORDER);

describe("the receipt", () => {
  it("answers not-found for a malformed id and for an order that is not this shopper's", async () => {
    const svc = createOrdersService({ repo: repoWith({ get: async () => null }) });
    await expect(svc.get(scope, "cust", "not-a-uuid")).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(svc.get(scope, "cust", ORDER)).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("carries exactly the contract's keys for an ordinary order — and none of the optional ones", async () => {
    const o = await read();
    expect(Object.keys(o).sort()).toEqual([
      "arrivalEstimates", "cancellable", "currency", "deliveryAddress", "deliveryFeeAmount", "deliveryInstructions", "discountAmount",
      "fulfillments", "grandTotalAmount", "id", "itemSubtotalAmount", "items", "orderNumber", "paymentMethod", "paymentStatus",
      "placedAt", "promoCode", "stage", "status",
    ]);
    // Present and null / empty, so a client has no undefined branch.
    expect(o.deliveryInstructions).toBeNull();
    expect(o.paymentMethod).toBeNull();
    expect(o.arrivalEstimates).toEqual([]);
  });

  it("billing is absent when it is the same as shipping, and returned when it diverges", async () => {
    expect(await read()).not.toHaveProperty("billingAddress");
    const o = await read({ get: async () => ({ ...(await repoWith().get("c", ORDER))!, billing_address: { line1: "9 Other Rd" } }) });
    expect(o.billingAddress).toEqual({ line1: "9 Other Rd" });
  });

  it("delivery instructions: either part alone is carried", async () => {
    const base = (await repoWith().get("c", ORDER))!;
    expect((await read({ get: async () => ({ ...base, delivery_note: "Gate 4" }) })).deliveryInstructions).toEqual({ handover: null, note: "Gate 4" });
    expect((await read({ get: async () => ({ ...base, delivery_handover: "leave_at_door" }) })).deliveryInstructions)
      .toEqual({ handover: "leave_at_door", note: null });
  });

  it("a line renders complete without an image, and a failing presign cannot fail the receipt", async () => {
    expect((await read()).items[0]).not.toHaveProperty("imageUrl");
    const withKey = { items: async () => [{ ...(await repoWith().items(ORDER))[0]!, image_key: "k.jpg" }] };
    expect((await read(withKey)).items[0]!.imageUrl).toBe("https://img/k.jpg");
    const o = await read(withKey, async () => { throw new Error("signer down"); });
    expect(o.items[0]).not.toHaveProperty("imageUrl");
    expect(o.items[0]!.productName).toBe("Milk");
  });

  it("attaches a shortfall to its own package, and omits the key where there is none", async () => {
    const o = await read({
      fulfillments: async () => [
        { id: "f1", status: "collected", item_count: 2, subtotal_amount: "12.00" },
        { id: "f2", status: "picking", item_count: 1, subtotal_amount: "8.00" },
      ],
      shortfalls: async () => [{ shop_fulfillment_id: "f1", product_name: "Eggs", quantity: 1 }],
    });
    expect(o.fulfillments[0]!.unavailableItems).toEqual([{ productName: "Eggs", quantity: 1 }]);
    expect(o.fulfillments[1]).not.toHaveProperty("unavailableItems");
    expect(o.stage).toBe("packing"); // the least advanced package
    expect(o.cancellable).toBe(false);
  });

  it("discloses no shop and no internal id anywhere in the document", async () => {
    const o = await read({
      fulfillments: async () => [{ id: "FULFILMENT-INTERNAL-ID", status: "collected", item_count: 2, subtotal_amount: "20.00" }],
      shortfalls: async () => [{ shop_fulfillment_id: "FULFILMENT-INTERNAL-ID", product_name: "Eggs", quantity: 1 }],
      refunds: async () => [{ amount: "5.00", status: "failed", settled_at: null }],
    });
    const wire = JSON.stringify(o);
    expect(wire).not.toContain("FULFILMENT-INTERNAL-ID");
    expect(wire).not.toMatch(/shop/i);
    expect(wire).not.toMatch(/failureReason|kind|reason/);
  });

  it("how it was paid is the family, the brand and the last four — nothing else", async () => {
    const o = await read({ paymentMethod: async () => ({ method_type: "card", method_brand: "visa", method_last4: "4242" }) });
    expect(o.paymentMethod).toEqual({ type: "card", brand: "visa", last4: "4242" });
  });

  it("a same-day window carries the Melbourne offset; a standard day stays a date", async () => {
    const o = await read({
      arrivals: async () => [
        { method: "same_day", promised_from: "2026-10-05", promised_to: "2026-10-05", window_start: new Date("2026-10-05T03:00:00Z"), window_end: new Date("2026-10-05T05:00:00Z") },
        { method: "standard", promised_from: "2026-10-08", promised_to: "2026-10-08", window_start: null, window_end: null },
      ],
    });
    expect(o.arrivalEstimates).toEqual([
      { method: "same_day", promisedFrom: "2026-10-05", promisedTo: "2026-10-05", windowStart: "2026-10-05T14:00:00+11:00", windowEnd: "2026-10-05T16:00:00+11:00" },
      { method: "standard", promisedFrom: "2026-10-08", promisedTo: "2026-10-08", windowStart: null, windowEnd: null },
    ]);
  });

  it("a supporting read that fails still returns the order", async () => {
    const down = async () => { throw new Error("read failed"); };
    const o = await read({ refunds: down, arrivals: down, paymentMethod: down });
    expect(o.orderNumber).toBe("EFY-ABC123");
    expect(o).not.toHaveProperty("refunds");
    expect(o.arrivalEstimates).toEqual([]);
    expect(o.paymentMethod).toBeNull();
  });

  it("the history is a plain list of summaries", async () => {
    const svc = createOrdersService({
      repo: repoWith({ list: async () => [{ id: ORDER, order_number: "EFY-ABC123", status: "paid", placed_at: null, item_count: 3, grand_total_amount: "26.00", currency: "AUD" }] }),
    });
    expect(await svc.list("cust")).toEqual([
      { id: ORDER, orderNumber: "EFY-ABC123", status: "paid", placedAt: null, itemCount: 3, grandTotalAmount: "26.00", currency: "AUD" },
    ]);
  });
});

describe("what happened to the shopper's money", () => {
  const r = (amount: string, status: string, settled_at: string | null = null) => ({ amount, status, settled_at });

  it("an unrefunded order carries no refund keys at all", () => {
    expect(refundBlock("26.00", [])).toEqual({});
  });

  it("the arithmetic adds up, and the receipt's own totals are not rewritten", () => {
    expect(refundBlock("26.00", [r("5.00", "succeeded", "2026-10-06 01:00:00+00"), r("3.50", "submitted")])).toEqual({
      refunds: [
        { amount: "5.00", state: "completed", refundedAt: "2026-10-06 01:00:00+00" },
        { amount: "3.50", state: "on_its_way", refundedAt: null },
      ],
      refundedTotal: "8.50",
      amountPaidAfterRefunds: "17.50",
    });
  });

  it("does not drift across many small amounts", () => {
    const b = refundBlock("3.00", Array.from({ length: 30 }, () => r("0.10", "succeeded")));
    expect(b.refundedTotal).toBe("3.00");
    expect(b.amountPaidAfterRefunds).toBe("0.00");
    expect(b.fullyRefunded).toBe(true);
  });

  it("unsettled and failed refunds are SHOWN but not subtracted", () => {
    const b = refundBlock("26.00", [r("5.00", "submitting"), r("4.00", "failed"), r("2.00", "refused"), r("1.00", "succeeded")]);
    expect(b.refunds!.map((x) => x.state)).toEqual(["on_its_way", "there_was_a_problem", "there_was_a_problem", "completed"]);
    expect(b.refundedTotal).toBe("1.00");
    expect(b.amountPaidAfterRefunds).toBe("25.00");
    expect(b).not.toHaveProperty("fullyRefunded");
  });

  it("fully refunded is derived from the totals — reached line by line or in one act — and never for a free order", () => {
    expect(refundBlock("10.00", [r("4.00", "succeeded"), r("6.00", "submitted")]).fullyRefunded).toBe(true);
    expect(refundBlock("10.00", [r("10.00", "succeeded")]).fullyRefunded).toBe(true);
    expect(refundBlock("10.00", [r("9.99", "succeeded")])).not.toHaveProperty("fullyRefunded");
    expect(refundBlock("0.00", [r("1.00", "succeeded")])).not.toHaveProperty("fullyRefunded");
  });
});
