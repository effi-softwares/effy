import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  readOrderPolicy: vi.fn(),
  writeOrderPolicy: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { writeOrderPolicy } from "./service";
import { isPromoError } from "./types";

/** The wire refusal code, or a marker — so a test asserts WHICH refusal, not merely that one happened. */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isPromoError(e) ? e.code : "other";
  }
}

beforeEach(() => vi.clearAllMocks());

describe("writeOrderPolicy", () => {
  it("writes a valid policy", async () => {
    repo.writeOrderPolicy.mockResolvedValue({ minimumSubtotalAmount: "20.00" });
    await writeOrderPolicy({ minimumSubtotalAmount: "20.00", maxLineQuantity: 10, maxDistinctItems: 50 }, "actor");
    expect(repo.writeOrderPolicy).toHaveBeenCalledWith(
      { minimumSubtotalAmount: "20.00", maxLineQuantity: 10, maxDistinctItems: 50 },
      "actor",
    );
  });

  it.each([
    ["a line ceiling above the cart_item CHECK", { minimumSubtotalAmount: "0.00", maxLineQuantity: 100, maxDistinctItems: 50 }],
    ["a zero line ceiling", { minimumSubtotalAmount: "0.00", maxLineQuantity: 0, maxDistinctItems: 50 }],
    ["a distinct-item ceiling above 500", { minimumSubtotalAmount: "0.00", maxLineQuantity: 10, maxDistinctItems: 501 }],
    ["a negative minimum", { minimumSubtotalAmount: "-1.00", maxLineQuantity: 10, maxDistinctItems: 50 }],
  ])("refuses %s — the schema would reject it when a shopper hit it", async (_label, input) => {
    expect(await codeOf(writeOrderPolicy(input, "actor"))).toBe("order_policy_invalid");
    expect(repo.writeOrderPolicy).not.toHaveBeenCalled();
  });
});

// ── The advertising facet (028 T049) ────────────────────────────────────────────────────────────
//
// ⚠ These prove the SERVICE's half only. The guarantee that an advertised promotion always has a
// headline is `promo_code_banner_copy_chk` in the database, which no unit test can exercise — the
// service check exists so an operator gets a field-level message instead of a 500, not instead of the
// constraint.

