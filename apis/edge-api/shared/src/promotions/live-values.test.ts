import { describe, expect, it } from "vitest";

import { fillText, hasToken, liveValueList, tokensIn, unknownTokens, type LiveValues } from "./live-values";

const both: LiveValues = { free_delivery_amount: "$150", order_minimum: "$20" };
const none: LiveValues = { free_delivery_amount: null, order_minimum: null };

describe("108 — live values", () => {
  it("finds known tokens once, in order, across the words", () => {
    expect(tokensIn("Free over {free_delivery_amount}", null, "Min {order_minimum} · {free_delivery_amount}")).toEqual([
      "free_delivery_amount",
      "order_minimum",
    ]);
    expect(tokensIn("No tokens here", undefined)).toEqual([]);
  });

  it("names unknown tokens so the form can refuse them", () => {
    expect(unknownTokens("Free over {free_delivery} and {order_minimum}")).toEqual(["free_delivery"]);
    expect(hasToken("Plain words")).toBe(false);
    expect(hasToken("Over {free_delivery_amount}")).toBe(true);
  });

  it("fills from the settings as they stand", () => {
    expect(fillText("Free delivery on orders over {free_delivery_amount}", both)).toEqual({ text: "Free delivery on orders over $150", missing: [] });
    expect(fillText(null, both)).toEqual({ text: null, missing: [] });
  });

  it("reports a value with nothing to show instead of leaving a blank", () => {
    expect(fillText("Free over {free_delivery_amount}", none).missing).toEqual(["free_delivery_amount"]);
  });

  it("lists every value for back-office, with why an empty one is empty", () => {
    const list = liveValueList({ free_delivery_amount: "$150", order_minimum: null });
    expect(list.map((v) => [v.key, v.token, v.reads])).toEqual([
      ["free_delivery_amount", "{free_delivery_amount}", "$150"],
      ["order_minimum", "{order_minimum}", null],
    ]);
    expect(list[1]!.why).toBe("There is no order minimum.");
  });
});
