import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { createPromo, deletePromo, listPromos, readOrderPolicy, updatePromo } from "./repository";
import { isPromoError } from "./types";

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isPromoError(e) ? e.code : "other";
  }
}

/** A fake pg client whose query() returns queued results in order; records every call for assertions. */
function fakeClient(results: unknown[]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const q = vi.fn((text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return Promise.resolve(results.shift() ?? { rows: [], rowCount: 0 });
  });
  return { client: { query: q }, calls };
}
const auditCall = (calls: { text: string; params: unknown[] }[]) =>
  calls.find((c) => c.text.includes("admin.audit_log"));

const PROMO_ROW = {
  id: "p1",
  code: "SPRING20",
  kind: "percentage",
  percent_off: 20,
  amount_off: null,
  currency: "AUD",
  minimum_subtotal_amount: "0.00",
  starts_at: null,
  ends_at: null,
  max_redemptions: null,
  max_per_customer: null,
  status: "active",
  redemption_count: "3",
  created_by: "actor",
  updated_by: null,
  created_at: new Date("2026-07-01T00:00:00Z"),
  updated_at: new Date("2026-07-02T00:00:00Z"),
};

beforeEach(() => {
  query.mockReset();
  withTransaction.mockReset();
});

describe("mapping", () => {
  it("counts redemptions from the rows and never from a stored counter", async () => {
    query.mockResolvedValue({ rows: [{ ...PROMO_ROW, total: "1" }] });
    const page = await listPromos({ page: 1, pageSize: 25, status: null, q: null });
    expect(page.items[0]!.redemptionCount).toBe(3);
    // The count comes from a subquery over promo_redemption, not a column on promo_code.
    expect(query.mock.calls[0]![0]).toContain("FROM public.promo_redemption r");
    expect(query.mock.calls[0]![0]).not.toMatch(/p\.redemption_count/);
  });

  it("reports the unfiltered total from the window function, not the page length", async () => {
    query.mockResolvedValue({ rows: [{ ...PROMO_ROW, total: "42" }] });
    expect((await listPromos({ page: 2, pageSize: 10, status: null, q: null })).total).toBe(42);
    expect(query.mock.calls[0]![1]).toEqual([null, null, 10, 10]); // OFFSET = (page-1) * pageSize
  });
});

describe("createPromo", () => {
  it("audits the creation inside the same transaction as the insert", async () => {
    const { client, calls } = fakeClient([{ rows: [{ id: "p1" }] }]);
    withTransaction.mockImplementation((fn) => fn(client));
    query.mockResolvedValue({ rows: [PROMO_ROW] });

    await createPromo(
      { code: "SPRING20", kind: "percentage", percentOff: 20, amountOff: null, minimumSubtotalAmount: "0.00", startsAt: null, endsAt: null, maxRedemptions: null, maxPerCustomer: null, isAdvertised: false, bannerTitle: null, bannerSubtitle: null, bannerImageKey: null, bannerPosition: 0, bannerPlacement: "carousel" },
      "actor",
    );

    const audit = auditCall(calls);
    expect(audit).toBeDefined();
    expect(audit!.params[0]).toBe("actor");
    expect(audit!.params[1]).toBe("promo_code.create");
  });

  it("turns a unique violation on the code into a duplicate refusal, not a 500", async () => {
    const client = { query: vi.fn().mockRejectedValue(Object.assign(new Error("dupe"), { code: "23505" })) };
    withTransaction.mockImplementation((fn) => fn(client));
    expect(
      await codeOf(
        createPromo(
          { code: "SPRING20", kind: "percentage", percentOff: 20, amountOff: null, minimumSubtotalAmount: "0.00", startsAt: null, endsAt: null, maxRedemptions: null, maxPerCustomer: null, isAdvertised: false, bannerTitle: null, bannerSubtitle: null, bannerImageKey: null, bannerPosition: 0, bannerPlacement: "carousel" },
          "actor",
        ),
      ),
    ).toBe("promo_code_duplicate");
  });
});

describe("updatePromo — the used-code rule (FR-068)", () => {
  it("refuses to rewrite the VALUE of a code that has been redeemed", async () => {
    const { client } = fakeClient([{ rows: [{ redemptions: "1" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    expect(await codeOf(updatePromo("p1", { percentOff: 50 }, "actor"))).toBe("promo_immutable_once_used");
  });

  it("still allows a redeemed code's WINDOW and CAPS to change", async () => {
    const { client, calls } = fakeClient([{ rows: [{ redemptions: "9" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    query.mockResolvedValue({ rows: [PROMO_ROW] });

    await updatePromo("p1", { endsAt: "2026-09-01T00:00:00Z", maxRedemptions: 500 }, "actor");
    expect(calls.some((c) => c.text.includes("UPDATE public.promo_code"))).toBe(true);
    expect(auditCall(calls)!.params[1]).toBe("promo_code.update");
  });

  it("lets an UNUSED code's value be rewritten freely", async () => {
    const { client, calls } = fakeClient([{ rows: [{ redemptions: "0" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    query.mockResolvedValue({ rows: [PROMO_ROW] });

    await updatePromo("p1", { percentOff: 50 }, "actor");
    expect(calls.some((c) => c.text.includes("UPDATE public.promo_code"))).toBe(true);
  });

  it("re-counts redemptions under FOR UPDATE — the rule cannot be raced", async () => {
    const { client, calls } = fakeClient([{ rows: [{ redemptions: "0" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    query.mockResolvedValue({ rows: [PROMO_ROW] });

    await updatePromo("p1", { percentOff: 50 }, "actor");
    expect(calls[0]!.text).toContain("FOR UPDATE");
  });

  it("404s an unknown code", async () => {
    const { client } = fakeClient([{ rows: [], rowCount: 0 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    expect(await codeOf(updatePromo("nope", { endsAt: null }, "actor"))).toBe("promo_not_found");
  });

  it("can CLEAR a cap — null is a value here, not 'leave it alone'", async () => {
    const { client, calls } = fakeClient([{ rows: [{ redemptions: "0" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    query.mockResolvedValue({ rows: [PROMO_ROW] });

    await updatePromo("p1", { maxRedemptions: null }, "actor");
    const update = calls.find((c) => c.text.includes("UPDATE public.promo_code"))!;
    // The "was it sent?" boolean is true while the value is null — COALESCE could not express this.
    expect(update.params[15]).toBe(true);
    expect(update.params[16]).toBeNull();
  });
});

describe("deletePromo — FR-070", () => {
  it("refuses a code that has been redeemed, and says to disable it instead", async () => {
    const { client } = fakeClient([{ rows: [{ redemptions: "2" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    expect(await codeOf(deletePromo("p1", "actor"))).toBe("promo_delete_blocked");
  });

  it("deletes a never-redeemed code and audits it", async () => {
    const { client, calls } = fakeClient([{ rows: [{ redemptions: "0" }], rowCount: 1 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    await deletePromo("p1", "actor");
    expect(calls.some((c) => c.text.includes("DELETE FROM public.promo_code"))).toBe(true);
    expect(auditCall(calls)!.params[1]).toBe("promo_code.delete");
  });

  it("404s an unknown code", async () => {
    const { client } = fakeClient([{ rows: [], rowCount: 0 }]);
    withTransaction.mockImplementation((fn) => fn(client));
    expect(await codeOf(deletePromo("nope", "actor"))).toBe("promo_not_found");
  });
});

describe("readOrderPolicy", () => {
  it("refuses loudly if the singleton row is missing rather than inventing defaults", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await codeOf(readOrderPolicy())).toBe("order_policy_missing");
  });
});
