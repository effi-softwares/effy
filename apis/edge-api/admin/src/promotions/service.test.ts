import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listPromos: vi.fn(),
  readPromo: vi.fn(),
  auditFor: vi.fn(),
  createPromo: vi.fn(),
  updatePromo: vi.fn(),
  setStatus: vi.fn(),
  deletePromo: vi.fn(),
  readOrderPolicy: vi.fn(),
  writeOrderPolicy: vi.fn(),
}));
vi.mock("./repository", () => repo);

import { createPromo, listPromos, readPromo, setStatus, updatePromo, writeOrderPolicy } from "./service";
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

const VALID_PERCENT = { code: "SPRING20", kind: "percentage", percentOff: 20 };

beforeEach(() => vi.clearAllMocks());

describe("createPromo validation", () => {
  it("accepts a percentage code and defaults the minimum to zero", async () => {
    repo.createPromo.mockResolvedValue({ id: "p1" });
    await createPromo(VALID_PERCENT, "actor");
    expect(repo.createPromo).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SPRING20", kind: "percentage", percentOff: 20, amountOff: null, minimumSubtotalAmount: "0.00" }),
      "actor",
    );
  });

  it("accepts a fixed code and carries no percentage", async () => {
    repo.createPromo.mockResolvedValue({ id: "p1" });
    await createPromo({ code: "TEN", kind: "fixed", amountOff: "10.00" }, "actor");
    expect(repo.createPromo).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "fixed", amountOff: "10.00", percentOff: null }),
      "actor",
    );
  });

  it.each([
    ["a percentage over 100", { ...VALID_PERCENT, percentOff: 101 }, "promo_percent_invalid"],
    ["a percentage of zero", { ...VALID_PERCENT, percentOff: 0 }, "promo_percent_invalid"],
    ["a fixed amount of zero", { code: "X", kind: "fixed", amountOff: "0.00" }, "promo_amount_invalid"],
    ["a fixed amount with three decimals", { code: "X", kind: "fixed", amountOff: "1.234" }, "promo_amount_invalid"],
    ["an unknown kind", { code: "X", kind: "buy_one_get_one" }, "promo_kind_mismatch"],
    ["a negative minimum", { ...VALID_PERCENT, minimumSubtotalAmount: "-5.00" }, "promo_minimum_invalid"],
    ["a zero cap", { ...VALID_PERCENT, maxRedemptions: 0 }, "promo_cap_invalid"],
    ["a fractional cap", { ...VALID_PERCENT, maxPerCustomer: 1.5 }, "promo_cap_invalid"],
    ["an empty code", { ...VALID_PERCENT, code: "  " }, "promo_definition_invalid"],
  ])("refuses %s", async (_label, input, expected) => {
    expect(await codeOf(createPromo(input as never, "actor"))).toBe(expected);
    expect(repo.createPromo).not.toHaveBeenCalled();
  });

  it("refuses a percentage code that also carries an amount — the schema cannot represent it", async () => {
    expect(await codeOf(createPromo({ ...VALID_PERCENT, amountOff: "5.00" } as never, "actor"))).toBe("promo_amount_invalid");
  });

  it("refuses a window that ends before it starts", async () => {
    const input = { ...VALID_PERCENT, startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-07-01T00:00:00Z" };
    expect(await codeOf(createPromo(input, "actor"))).toBe("promo_window_invalid");
  });

  it("refuses a window that ends exactly when it starts — a promotion that can never run", async () => {
    const at = "2026-08-01T00:00:00Z";
    expect(await codeOf(createPromo({ ...VALID_PERCENT, startsAt: at, endsAt: at }, "actor"))).toBe("promo_window_invalid");
  });

  it("names the offending field so the console can point at it", async () => {
    try {
      await createPromo({ ...VALID_PERCENT, percentOff: 400 }, "actor");
      expect.unreachable();
    } catch (e) {
      expect(isPromoError(e) && e.fields[0]?.field).toBe("percentOff");
      expect(isPromoError(e) && e.status).toBe(422);
    }
  });
});

describe("updatePromo", () => {
  it("allows a partial edit that touches only the window", async () => {
    repo.updatePromo.mockResolvedValue({ id: "p1" });
    await updatePromo("p1", { endsAt: "2026-09-01T00:00:00Z" }, "actor");
    expect(repo.updatePromo).toHaveBeenCalledWith("p1", { endsAt: "2026-09-01T00:00:00Z" }, "actor");
  });

  it("still validates the fields that WERE sent", async () => {
    expect(await codeOf(updatePromo("p1", { percentOff: 0, kind: "percentage" }, "actor"))).toBe("promo_percent_invalid");
    expect(repo.updatePromo).not.toHaveBeenCalled();
  });

  it("leaves the used-code rule to the repository — it must be decided inside the transaction", async () => {
    repo.updatePromo.mockResolvedValue({ id: "p1" });
    await updatePromo("p1", { percentOff: 30, kind: "percentage" }, "actor");
    expect(repo.updatePromo).toHaveBeenCalled();
  });
});

describe("setStatus", () => {
  it("passes a known status through", async () => {
    repo.setStatus.mockResolvedValue({ id: "p1" });
    await setStatus("p1", "disabled", "actor");
    expect(repo.setStatus).toHaveBeenCalledWith("p1", "disabled", "actor");
  });

  it.each([["archived"], [""], [null], [7]])("refuses %o", async (status) => {
    expect(await codeOf(setStatus("p1", status, "actor"))).toBe("promo_status_invalid");
    expect(repo.setStatus).not.toHaveBeenCalled();
  });
});

describe("readPromo", () => {
  it("404s an unknown id rather than returning null past the service boundary", async () => {
    repo.readPromo.mockResolvedValue(null);
    expect(await codeOf(readPromo("nope"))).toBe("promo_not_found");
  });
});

describe("listPromos coercion", () => {
  beforeEach(() => repo.listPromos.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }));

  it("drops an unknown status filter instead of refusing the whole list", async () => {
    await listPromos({ status: "haunted" });
    expect(repo.listPromos).toHaveBeenCalledWith(expect.objectContaining({ status: null }));
  });

  it("caps the page size and floors a nonsense page", async () => {
    await listPromos({ page: -3, pageSize: 5000 });
    expect(repo.listPromos).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100 }));
  });
});

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
