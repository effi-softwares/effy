import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { QuoteResult } from "@effy/edge-shared/delivery";
import { describe, expect, it } from "vitest";

import { DeliveryChoiceError } from "./delivery-choice";
import { toQuoteDTO } from "./quote";
import { deliveryChoiceRefused } from "./respond";

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
const FORBIDDEN = ["capacity", "booked", "remaining", "overcapacity", "over_capacity", "load", "shopid", "shop_id", "shopname"];

describe("the customer's delivery wire carries no capacity and no shop", () => {
  const SHOP = "99999999-9999-4999-8999-999999999999";
  const now = new Date("2026-08-24T00:00:00Z");
  // A domain value that DOES know the shop and the slot's identity: none of it may survive.
  const quote = {
    serviced: true,
    sameDayUntil: new Date("2026-08-24T04:00:00Z"),
    packages: [{ shopId: SHOP, options: [{ method: "same_day", feeCents: 1100 }, { method: "standard", feeCents: 600 }] }],
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
    expect(dto.sameDaySlots[0].startAt).toBe("2026-08-24T17:00:00+10:00"); // Melbourne offset, not Z
    expect(dto.standardDays).toEqual([{ date: "2026-08-25" }]);
  });

  it("an unserviced quote has empty arrays, never nulls", () => {
    expect(toQuoteDTO("9999", { serviced: false } as QuoteResult, now)).toEqual({
      postcode: "9999", serviced: false, sameDayAvailableUntil: null, packages: [], expiresAt: "",
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

  it("the intent route reads no amount, total, price or discount from the request", () => {
    expect(code).toMatch(/body\?\.addressId/); // it does read the body — the check below is not vacuous
    expect(code).not.toMatch(/body\??\.\w*(amount|total|price|discount|fee)\w*/i);
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
