import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CourierNotPurchasableError, type QuoteResult } from "@effy/edge-shared/delivery";
import { COVERAGE_REFUSAL_CODE, COVERAGE_REFUSAL_SENTENCE } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import { DeliveryChoiceError } from "./delivery-choice";
import { toQuoteDTO } from "./quote";
import { checkoutError, deliveryChoiceRefused } from "./respond";
import { NotServiceableError } from "./service";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..");

function sources(dir: string): { file: string; body: string }[] {
  return readdirSync(resolve(src, dir))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ file: `${dir}/${f}`, body: readFileSync(resolve(src, dir, f), "utf8") }));
}

/** A customer is never told how full a window is, nor anything that identifies a shop. */
const FORBIDDEN = [
  "capacity", "booked", "remaining", "overcapacity", "over_capacity", "load", "shopid", "shop_id", "shopname",
  // How the fee was built (distance, band, plan, weight) is the business's.
  "km", "distance", "band", "grams", "plan", "breakdown", "basketcents", "premium",
];

/** A priced fee as the quote carries it, with a breakdown that does know the distance and the plan. */
function pricedFee(totalCents: number, withoutPremiumCents = totalCents) {
  const lines = [{ kind: "delivery", cents: withoutPremiumCents }];
  if (totalCents > withoutPremiumCents) lines.push({ kind: "window_surcharge", cents: totalCents - withoutPremiumCents });
  return {
    planId: "plan-secret", planName: "Secret plan", slotId: null, windowIsToday: totalCents > withoutPremiumCents,
    breakdown: { kind: "effy", km: 12.34, grams: 6200, basketCents: 5400, baseCents: 300, distanceCents: 300, distanceBandUpperKm: 20 },
    lines, totalCents,
  };
}

describe("the customer's delivery wire carries no capacity and no shop", () => {
  const SHOP = "99999999-9999-4999-8999-999999999999";
  const now = new Date("2026-08-24T00:00:00Z");
  const window = {
    id: "33333333-3333-4333-8333-333333333333", date: "2026-08-24",
    start: new Date("2026-08-24T07:00:00Z"), end: new Date("2026-08-24T09:00:00Z"), cutoff: new Date("2026-08-24T04:00:00Z"),
  };
  const quote = {
    serviced: true,
    coverage: "effy",
    zoneId: "77777777-7777-4777-8777-777777777777",
    shopIds: [SHOP],
    baseFee: pricedFee(600),
    freeDeliveryRemainingCents: 2600,
    effyWindows: {
      days: [
        { date: "2026-08-24", isToday: true, nonDelivery: false, windows: [window], closedReason: null },
        { date: "2026-08-25", isToday: false, nonDelivery: false, windows: [], closedReason: "full" },
      ],
      fees: new Map([["33333333-3333-4333-8333-333333333333|2026-08-24", pricedFee(1100, 600)]]),
      unavailable: null,
    },
  } as unknown as QuoteResult;

  const wire = JSON.stringify(toQuoteDTO("3121", quote, now));
  const refusal = String(deliveryChoiceRefused(
    { requestId: "r", instance: "/commerce/v1/checkout/intent" } as never, new DeliveryChoiceError("slot_unavailable"), JSON.parse(wire),
  ).body);

  it.each([["the quote", wire], ["a delivery-choice refusal", refusal]])("%s", (_what, body) => {
    expect(body.length).toBeGreaterThan(200);
    for (const bad of FORBIDDEN) expect(body.toLowerCase(), `must not disclose "${bad}"`).not.toContain(`"${bad}`);
    expect(body).not.toContain(SHOP);
  });

  it("there is no package list at all, the group is not sent, and a fee is a string", () => {
    const dto = JSON.parse(wire);
    // How the order splits across suppliers is not on the wire in any form.
    expect(Object.keys(dto).sort()).toEqual(["coverage", "effyWindows", "expiresAt", "freeDeliveryRemainingAmount", "postcode", "serviced"]);
    expect(wire).not.toContain("77777777");
    const w = dto.effyWindows.days[0].windows[0];
    expect(w.surchargeAmount).toBe("5.00");
    expect(w.fee).toEqual({ lines: [{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "5.00" }], totalAmount: "11.00" });
    expect(dto.freeDeliveryRemainingAmount).toBe("26.00");
    expect(w.startAt).toBe("2026-08-24T17:00:00+10:00"); // Melbourne offset, not Z
    // A full day is said to be full, never how full; a day without untimed room is not sold untimed.
    expect(dto.effyWindows.days[1]).toEqual({ date: "2026-08-25", section: "standard", windows: [], closedReason: "full", anyTime: null });
    expect(dto.effyWindows.asap).toBeNull();
  });

  it("an unserviced quote says so and nothing else", () => {
    expect(toQuoteDTO("9999", { serviced: false, coverage: "none" }, now)).toEqual({ postcode: "9999", serviced: false, coverage: "none", expiresAt: "" });
  });

  it("the refusal is a 409 conflict carrying the code and the fresh quote", () => {
    const body = JSON.parse(refusal);
    expect(body).toMatchObject({ status: 409, code: "slot_unavailable", title: "Conflict" });
    expect(body.type).toMatch(/conflict$/);
    expect(body.quote.effyWindows.days[0].windows).toHaveLength(1);
  });
});

/** The order stores exactly what the request carried; no fallback to the address's saved note. */
describe("checkout never reads an address's saved default", () => {
  const files = [...sources("checkout"), ...sources("orders"), ...sources("webhook")];

  it("scanned real source", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files)("$file", ({ body }) => {
    expect(body).not.toContain("default_delivery_note");
    expect(body).not.toContain("default_delivery_handover");
  });
});

describe("the amount is the platform's, and a card is kept only by the shopper's choice", () => {
  const intent = readFileSync(resolve(src, "functions/checkout-intent-v1-post.ts"), "utf8");
  const code = intent.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");

  it("the intent route reads no amount, total, price or discount from the request - except the one it only COMPARES", () => {
    expect(code).toMatch(/body\?\.addressId/);
    // `shownDeliveryAmount` and `expectedDiscount` are read only to compare, never to set a charge.
    expect(code).toMatch(/body\.shownDeliveryAmount/);
    expect(code).toMatch(/body\.expectedDiscount/);
    expect(code.replaceAll("body.shownDeliveryAmount", "").replaceAll("body.expectedDiscount", "")).not.toMatch(/body\??\.\w*(amount|total|price|discount|fee)\w*/i);
  });

  it("094 - the shown promotions total is compared with the platform's and used for nothing else", () => {
    const service = readFileSync(resolve(src, "checkout/service.ts"), "utf8")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const uses = service.split("\n").filter((l) => /\bexpected(Discount)?\b/.test(l));
    expect(uses.map((l) => l.trim())).toEqual([
      "expectedDiscount?: string;",
      'const expected = input.expectedDiscount ?? "";',
      'if (expected !== "" && parseCents(expected) !== goodsDiscountCents + deliveryDiscountCents) {',
      "throw new PromotionsChangedRefusal(parseCents(expected), goodsDiscountCents + deliveryDiscountCents);",
    ]);
  });

  it("the shown delivery amount is compared with the platform's and used for nothing else", () => {
    const service = readFileSync(resolve(src, "checkout/service.ts"), "utf8")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const uses = service.split("\n").filter((l) => l.includes("shownDeliveryAmount"));
    expect(uses.map((l) => l.trim())).toEqual([
      "shownDeliveryAmount: string;",
      'if (input.shownDeliveryAmount !== "" && parseCents(input.shownDeliveryAmount) !== deliveryFeeCents) {',
      "throw new DeliveryFeeChangedError(parseCents(input.shownDeliveryAmount), deliveryFeeCents);",
    ]);
  });

  it("nothing in checkout sets setup_future_usage", () => {
    for (const { file, body } of [...sources("checkout"), ...sources("functions")]) {
      const withoutComments = body.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(withoutComments, file).not.toMatch(/setup_future_usage|setupFutureUsage/);
    }
  });
});

/** No second writer of `stripe_event` outside the handling transaction. */
describe("stripe_event has one writer, and it is inside the transaction", () => {
  it("only the webhook handler touches the table", () => {
    const writers = ["cart", "checkout", "functions", "lib", "orders", "promotions", "saved", "webhook"]
      .flatMap(sources)
      .filter(({ body }) => /INSERT INTO public\.stripe_event/.test(body))
      .map(({ file }) => file);
    expect(writers).toEqual(["webhook/handler.ts"]);
  });

  it("the insert is the first statement of the transaction and runs on its connection", () => {
    const body = readFileSync(resolve(src, "webhook/handler.ts"), "utf8");
    const opened = body.indexOf("await transact(async (tx) => {");
    const insert = body.indexOf("INSERT INTO public.stripe_event");
    expect(opened).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(opened);
    const between = body.slice(opened, insert);
    expect(between.match(/\.query\(/g)).toHaveLength(1);
    expect(between).toContain("tx.query(");
  });
});

/** The refusal's code and sentence are imported, never written here. */
describe("076 - an address nobody delivers to", () => {
  const scope = { instance: "/commerce/v1/checkout/intent", requestId: "req-1", log: { error: () => undefined } } as never;

  it.each([
    ["not on any list", new NotServiceableError()],
    ["courier-only, and a courier order cannot be priced or described", new CourierNotPurchasableError("7000", "no active courier fee table")],
  ])("%s → 422 with the shared code and sentence, and nothing about why", (_what, err) => {
    const res = checkoutError(scope, err, "intent");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body ?? "{}");
    expect(body.code).toBe(COVERAGE_REFUSAL_CODE);
    expect(body.detail).toBe(COVERAGE_REFUSAL_SENTENCE);
    expect(body.type).toBe("https://effyshopping.com/problems/address-not-covered");
    expect(JSON.stringify(body)).not.toMatch(/group|distance|hub|courier|reason|zone/i);
  });
});
