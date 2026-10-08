import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { formatArrival } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import type { ReceiptArrivalRow } from "./repository";
import { arrivalText, deliveryLinesVars } from "./sender";

/**
 * 069 — the emailed receipt says when the order arrives in the SAME WORDS as the confirmation page.
 *
 * ⚠ The fixture is the one customer-web's ArrivalPanel and both mobile apps are tested against
 * (`packages/shared-types/src/delivery-window.fixtures.json`). An email that words a delivery window
 * differently from the page the customer just saw is the defect this file exists to catch.
 */
interface Case {
  name: string;
  now: string;
  input: { promisedFrom: string | null; promisedTo: string | null; windowStart: string | null; windowEnd: string | null };
  expect: string;
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../../packages/shared-types/src/delivery-window.fixtures.json", import.meta.url)),
    "utf8",
  ),
) as { arrival: Case[] };

function row(c: Case["input"], method = "same_day"): ReceiptArrivalRow {
  return {
    method,
    promised_from: c.promisedFrom,
    promised_to: c.promisedTo,
    window_start: c.windowStart ? new Date(c.windowStart) : null,
    window_end: c.windowEnd ? new Date(c.windowEnd) : null,
  };
}

/** The page's wording, as it reads mid-sentence in the email. */
function asInEmail(pageText: string): string {
  if (pageText === "We'll confirm your delivery date") return "a date we'll confirm";
  return /^(Today|Tomorrow)/.test(pageText) ? pageText.charAt(0).toLowerCase() + pageText.slice(1) : pageText;
}

describe("arrivalText — one wording with the page", () => {
  it("has cases to run", () => {
    expect(fixture.arrival.length).toBeGreaterThan(10);
  });

  for (const c of fixture.arrival) {
    it(c.name, () => {
      const now = new Date(c.now);
      expect(arrivalText([row(c.input)], now).estimate).toBe(asInEmail(c.expect));
      // And the page's own function, on the same data, says the same thing.
      expect(asInEmail(formatArrival(c.input, now))).toBe(arrivalText([row(c.input)], now).estimate);
    });
  }
});

describe("arrivalText — more than one delivery", () => {
  const now = new Date("2026-10-08T09:00:00+11:00");
  const sameDay: Case["input"] = {
    promisedFrom: "2026-10-08", promisedTo: "2026-10-08",
    windowStart: "2026-10-08T17:00:00+11:00", windowEnd: "2026-10-08T19:00:00+11:00",
  };
  const standard: Case["input"] = { promisedFrom: "2026-10-13", promisedTo: "2026-10-13", windowStart: null, windowEnd: null };

  it("says a same-day window and a chosen day, each once", () => {
    const got = arrivalText([row(sameDay), row(standard, "standard")], now);
    expect(got).toEqual({ estimate: "today, 5 pm – 7 pm and Tue 13 Oct", method: "Multiple deliveries" });
  });

  it("says one promise once when two packages share it — and names no count of shops", () => {
    const got = arrivalText([row(sameDay), row(sameDay)], now);
    expect(got.estimate).toBe("today, 5 pm – 7 pm");
  });

  it("078 — one window for an order from three suppliers is ONE delivery, named by its method", () => {
    // Before 078 this said "Multiple deliveries" — which told the customer there were several suppliers.
    expect(arrivalText([row(sameDay), row(sameDay), row(sameDay)], now)).toEqual({ estimate: "today, 5 pm – 7 pm", method: "Same-day" });
    const later: Case["input"] = {
      promisedFrom: "2026-10-13", promisedTo: "2026-10-13",
      windowStart: "2026-10-13T16:00:00+11:00", windowEnd: "2026-10-13T18:00:00+11:00",
    };
    expect(arrivalText([row(later, "standard"), row(later, "standard")], now)).toEqual({ estimate: "Tue 13 Oct, 4 pm – 6 pm", method: "Standard" });
  });

  it("an order placed before 069 still says the date will be confirmed", () => {
    const none: Case["input"] = { promisedFrom: null, promisedTo: null, windowStart: null, windowEnd: null };
    expect(arrivalText([row(none, "standard"), row(none, "standard")], now).estimate).toBe("a date we'll confirm");
    expect(arrivalText([], now)).toEqual({ estimate: "a date we'll confirm", method: "Delivery" });
  });

  it("a promised package beside an unpromised one says only what was promised", () => {
    const none: Case["input"] = { promisedFrom: null, promisedTo: null, windowStart: null, windowEnd: null };
    expect(arrivalText([row(standard, "standard"), row(none, "standard")], now).estimate).toBe("Tue 13 Oct");
  });
});

describe("077 — deliveryLinesVars", () => {
  it("labels each line in the checkout's words and formats the amount, the saving negative", () => {
    expect(
      deliveryLinesVars([{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "2.00" }, { kind: "free_delivery", amount: "-8.00" }], "AUD"),
    ).toEqual({
      hasDeliveryLines: true,
      deliveryLines: [
        { label: "Delivery", amount: "$6.00" },
        { label: "Window surcharge", amount: "$2.00" },
        { label: "Free delivery", amount: "-$8.00" },
      ],
    });
  });

  it("an order placed before 077 has none, and keeps its single row", () => {
    expect(deliveryLinesVars(null, "AUD")).toEqual({ hasDeliveryLines: false, deliveryLines: [] });
    expect(deliveryLinesVars(undefined, "AUD")).toEqual({ hasDeliveryLines: false, deliveryLines: [] });
  });

  it("a kind this build does not know is dropped, never printed as a code", () => {
    expect(deliveryLinesVars([{ kind: "surge", amount: "9.00" }], "AUD").deliveryLines).toEqual([]);
  });
});
