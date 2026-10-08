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

/**
 * 070 — guards on what checkout must never say and never read. Each fails naming a file or a key,
 * and each exists because the thing it prevents would pass every behavioural test.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..");

function sources(dir: string): { file: string; body: string }[] {
  return readdirSync(resolve(src, dir))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ file: `${dir}/${f}`, body: readFileSync(resolve(src, dir, f), "utf8") }));
}

/**
 * ⚠ WHAT A CUSTOMER IS NEVER TOLD ABOUT A DELIVERY SLOT (069 FR-050). How full a slot is, is Effy's
 * operational business: "2 left" is a pressure tactic nobody asked for, and a count would let anyone
 * watch the evening's demand fill up. That a late payer went over capacity is a fact for dispatch.
 * And — as on every customer contract — nothing may identify a shop.
 */
const FORBIDDEN = [
  "capacity", "booked", "remaining", "overcapacity", "over_capacity", "load", "shopid", "shop_id", "shopname",
  // 077 — how the fee was built is the business's: a distance places the hub, a band or a plan
  // shows the price list, and a weight is nobody's concern but the van's (FR-032).
  "km", "distance", "band", "grams", "plan", "breakdown", "basketcents", "premium",
];

/** A priced fee as the quote carries it, with a breakdown that DOES know the distance and the plan. */
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
  // A domain value that DOES know the shop and the slot's identity: none of it may survive.
  const quote = {
    serviced: true,
    sameDayUntil: new Date("2026-08-24T04:00:00Z"),
    packages: [{ shopId: SHOP, options: [{ method: "same_day" }, { method: "standard" }] }],
    standardFee: pricedFee(600),
    slotFees: new Map([["33333333-3333-4333-8333-333333333333", pricedFee(1100, 600)]]),
    freeDeliveryRemainingCents: 2600,
    sameDaySlots: [{
      id: "33333333-3333-4333-8333-333333333333", date: "2026-08-24",
      start: new Date("2026-08-24T07:00:00Z"), end: new Date("2026-08-24T09:00:00Z"), cutoff: new Date("2026-08-24T04:00:00Z"),
    }],
    sameDayUnavailable: null,
    standardDays: ["2026-08-25"],
  } as unknown as QuoteResult;

  const wire = JSON.stringify(toQuoteDTO("3121", quote, now));
  const refusal = String(deliveryChoiceRefused(
    { requestId: "r", instance: "/commerce/v1/checkout/intent" } as never, new DeliveryChoiceError("slot_unavailable"), JSON.parse(wire),
  ).body);

  it.each([["the quote", wire], ["a delivery-choice refusal", refusal]])("%s", (_what, body) => {
    expect(body.length).toBeGreaterThan(200); // the mapping produced something to check
    for (const bad of FORBIDDEN) expect(body.toLowerCase(), `must not disclose "${bad}"`).not.toContain(`"${bad}`);
    expect(body).not.toContain(SHOP);
  });

  it("the only handle on a package is the opaque one, and a fee is a string", () => {
    const dto = JSON.parse(wire);
    expect(dto.packages[0].shopRef).toBe("pkg-1");
    expect(dto.packages[0].options[1]).toEqual({ method: "standard", feeAmount: "6.00", promisedFrom: null, promisedTo: null });
    // 077 — the fee is the ORDER's: lines and a total for a later day, and for each window.
    expect(dto.standardFee).toEqual({ lines: [{ kind: "delivery", amount: "6.00" }], totalAmount: "6.00" });
    expect(dto.sameDaySlots[0].surchargeAmount).toBe("5.00");
    expect(dto.sameDaySlots[0].fee).toEqual({
      lines: [{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "5.00" }], totalAmount: "11.00",
    });
    expect(dto.freeDeliveryRemainingAmount).toBe("26.00");
    expect(dto.sameDaySlots[0].startAt).toBe("2026-08-24T17:00:00+10:00"); // Melbourne offset, not Z
    expect(dto.standardDays).toEqual([{ date: "2026-08-25" }]);
  });

  it("an unserviced quote has empty arrays, never nulls", () => {
    expect(toQuoteDTO("9999", { serviced: false, coverage: "none" }, now)).toEqual({
      postcode: "9999", serviced: false, coverage: "none", sameDayAvailableUntil: null, packages: [], expiresAt: "",
      sameDaySlots: [], sameDayUnavailableReason: null, standardDays: [],
    });
  });

  it("the refusal is a 409 conflict carrying the code and the fresh quote", () => {
    const body = JSON.parse(refusal);
    expect(body).toMatchObject({ status: 409, code: "slot_unavailable", title: "Conflict" });
    expect(body.type).toMatch(/conflict$/);
    expect(body.quote.sameDaySlots).toHaveLength(1);
  });
});

/**
 * 066 — AN ORDER STORES EXACTLY WHAT ITS OWN CHECKOUT REQUEST CARRIED. Prefilling from the address
 * is the client's job. The moment a server "helpfully" falls back to the address's saved default,
 * a customer who deliberately cleared the note gets their saved one delivered anyway — and every
 * test passes, because both values are valid.
 */
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

  it("the intent route reads no amount, total, price or discount from the request — except the one it only COMPARES", () => {
    expect(code).toMatch(/body\?\.addressId/); // it does read the body — the check below is not vacuous
    // 077 — `shownDeliveryAmount` is what the client says it is DISPLAYING. It is read, and it is
    // an amount; the next test holds that it can only ever refuse a charge, never set one.
    expect(code).toMatch(/body\.shownDeliveryAmount/);
    expect(code.replaceAll("body.shownDeliveryAmount", "")).not.toMatch(/body\??\.\w*(amount|total|price|discount|fee)\w*/i);
  });

  it("the shown delivery amount is compared with the platform's and used for nothing else", () => {
    const service = readFileSync(resolve(src, "checkout/service.ts"), "utf8")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const uses = service.split("\n").filter((l) => l.includes("shownDeliveryAmount"));
    // Declared on the input, tested against the computed fee, and reported in the refusal. A fourth
    // line would be a client-sent amount finding its way into a charge.
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

/**
 * ⚠ THE WEBHOOK RECORDS AN EVENT ONLY INSIDE THE TRANSACTION THAT HANDLES IT (070 FR-023). The
 * container test proves the behaviour; this stops a second writer appearing somewhere that test
 * does not look — which is exactly how the original defect was built.
 */
describe("stripe_event has one writer, and it is inside the transaction", () => {
  it("only the webhook handler touches the table", () => {
    const writers = ["cart", "checkout", "functions", "lib", "orders", "promo", "saved", "webhook"]
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
    expect(between.match(/\.query\(/g)).toHaveLength(1); // the insert's own call, and no statement before it
    expect(between).toContain("tx.query(");
  });
});

/**
 * 076 — the refusal is ONE code and ONE sentence, the ones the address book shows (FR-022). The
 * checkout builds neither: it imports them. A second wording here is how the two come to differ.
 */
describe("076 — an address nobody delivers to", () => {
  const scope = { instance: "/commerce/v1/checkout/intent", requestId: "req-1", log: { error: () => undefined } } as never;

  it.each([
    ["not on any list", new NotServiceableError()],
    ["courier-only, before a courier order can be placed", new CourierNotPurchasableError("7000")],
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
