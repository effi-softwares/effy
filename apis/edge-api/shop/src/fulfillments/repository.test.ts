import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { collectViaStub, deliverViaStub, listQueue, readDetail, transition, updateItemProgress } from "./repository";

/** Collapse whitespace so SQL assertions are formatting-independent. */
const sql = (call: unknown[] | undefined): string =>
  String(call?.[0] ?? "").replace(/\s+/g, " ");

/** A withTransaction that runs the callback against a recording fake client. */
function fakeTx(rowsByCall: Array<{ rowCount: number; rows?: unknown[] }>) {
  const calls: Array<[string, unknown[]]> = [];
  let i = 0;
  withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
    fn({
      query: async (text: string, values: unknown[]) => {
        calls.push([text, values]);
        return rowsByCall[i++] ?? { rowCount: 1, rows: [{ id: "x" }] };
      },
    }),
  );
  return calls;
}

afterEach(() => {
  query.mockReset();
  withTransaction.mockReset();
});

describe("shop scoping — the isolation guarantee (FR-019, SC-007)", () => {
  it("binds the queue read to the caller-resolved shop id", async () => {
    query.mockResolvedValue({ rows: [] });
    await listQueue("shop-1", "active");

    const text = sql(query.mock.calls[0]);
    expect(text).toContain("WHERE sf.shop_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual(["shop-1", ["pending", "received", "picking"]]);
  });

  it("selects the completed states for the completed queue", async () => {
    query.mockResolvedValue({ rows: [] });
    await listQueue("shop-1", "completed");

    expect(query.mock.calls[0]?.[1]).toEqual(["shop-1", ["ready_for_pickup", "collected", "delivered"]]);
  });

  // The load-bearing predicate: order_item.shop_id was denormalized by 019 precisely so a shop's
  // slice of a multi-shop order is a direct query. Without it, opening a two-shop order shows the
  // whole order.
  it("restricts the detail's item read to the portion's own shop", async () => {
    query.mockResolvedValue({ rows: [{ id: "f-1", delivery_address: {}, placed_at: new Date() }] });
    await readDetail("f-1", "shop-1", "staff-1").catch(() => undefined);

    const itemQuery = query.mock.calls.map((c) => sql(c)).find((t) => t.includes("order_item oi"));
    expect(itemQuery).toContain("oi.shop_id = sf.shop_id");
    expect(itemQuery).toContain("WHERE sf.id = $1 AND sf.shop_id = $2");
  });

  // SC-007: a shop must never see what the customer paid, nor an order-level total (which would
  // itself leak the existence of other shops' lines).
  it("selects no payment column and no order-level total anywhere", async () => {
    query.mockResolvedValue({ rows: [] });
    await listQueue("shop-1", "active");
    await readDetail("f-1", "shop-1", null).catch(() => undefined);

    const all = query.mock.calls.map((c) => sql(c)).join(" ").toLowerCase();
    for (const forbidden of [
      "payment",
      "stripe",
      "grand_total",
      "item_subtotal_amount",
      "delivery_fee",
      "payment_intent",
    ]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("scopes the item-progress write through the portion, not the line alone", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "fi-1" }] }]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { gatheredQuantity: 1 }, "staff-1");

    const update = calls.map(([t]) => t.replace(/\s+/g, " ")).find((t) => t.includes("UPDATE public.fulfillment_item"));
    expect(update).toContain("sf.id = $1 AND sf.shop_id = $2");
  });
});

describe("guarded transitions (FR-014, SC-005)", () => {
  it("guards the update on the expected current status", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await transition("f-1", "shop-1", "received", "picking", "staff-1");

    const update = calls.map(([t]) => t.replace(/\s+/g, " "))[0];
    expect(update).toContain("WHERE id = $1 AND shop_id = $2 AND status = $3");
    expect(calls[0]?.[1]).toEqual(["f-1", "shop-1", "received", "picking"]);
  });

  it("reports false when the guard matched nothing, and writes no audit row", async () => {
    const calls = fakeTx([{ rowCount: 0, rows: [] }]);
    const applied = await transition("f-1", "shop-1", "received", "picking", "staff-1");

    expect(applied).toBe(false);
    expect(calls).toHaveLength(1); // the failed UPDATE only — no seed, no event
  });

  // The audit is the sole accountability control (FR-019b), so it must be written in the SAME
  // transaction as the change it records — it can never disagree with the state.
  it("writes the audit row inside the same transaction as the state change", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await transition("f-1", "shop-1", "picking", "ready_for_pickup", "staff-1");

    const event = calls.find(([t]) => t.includes("fulfillment_event"));
    expect(event).toBeDefined();
    expect(event?.[1]).toEqual([
      "f-1",
      "staff-1",
      "state_changed",
      "picking",
      "ready_for_pickup",
      null,
      null,
    ]);
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("seeds one progress row per line on entry to picking", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await transition("f-1", "shop-1", "received", "picking", "staff-1");

    const seed = calls.map(([t]) => t.replace(/\s+/g, " ")).find((t) => t.includes("INSERT INTO public.fulfillment_item"));
    expect(seed).toContain("ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING");
    expect(seed).toContain("oi.shop_id = sf.shop_id");
  });

  // A reversal must NOT wipe the progress already recorded (FR-011d) — hence ON CONFLICT DO NOTHING
  // above, and no seeding at all on the way out of picking.
  it("does not seed progress rows on any transition other than into picking", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await transition("f-1", "shop-1", "picking", "ready_for_pickup", "staff-1");

    expect(calls.some(([t]) => t.includes("INSERT INTO public.fulfillment_item"))).toBe(false);
  });
});

describe("item progress", () => {
  it("distinguishes flagging unavailable from restoring a found item", async () => {
    let calls = fakeTx([{ rowCount: 1, rows: [{ id: "fi-1" }] }]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { unavailableQuantity: 2 }, "staff-1");
    expect(calls.find(([t]) => t.includes("fulfillment_event"))?.[1]).toContain("item_unavailable");

    calls = fakeTx([{ rowCount: 1, rows: [{ id: "fi-1" }] }]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { unavailableQuantity: 0 }, "staff-1");
    expect(calls.find(([t]) => t.includes("fulfillment_event"))?.[1]).toContain("item_restored");
  });

  // The DB CHECK is the backstop; it must surface as a 400-shaped validation error, not a 500.
  it("maps the accounting check violation to a validation error", async () => {
    withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({
        query: async () => {
          const e = new Error("check_violation") as Error & { code: string };
          e.code = "23514";
          throw e;
        },
      }),
    );

    const err = await updateItemProgress(
      "f-1",
      "shop-1",
      "oi-1",
      { gatheredQuantity: 99 },
      "staff-1",
    ).catch((e) => e);
    expect((err as { kind?: string }).kind).toBe("validation");
  });
});

describe("pickup stub — ⚠ dev-only (FR-033)", () => {
  it("only ever moves ready_for_pickup to collected", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await collectViaStub("f-1", "shop-1", "test-driver-1", "staff-1");

    expect(calls[0]?.[1]).toEqual(["f-1", "shop-1", "ready_for_pickup", "collected"]);
  });

  // SC-014: stub collections must be permanently distinguishable from a genuine dispatch, and there
  // is deliberately no driver column anywhere — inventing one would model delivery execution the
  // product does not expose (SC-021).
  it("records the driver reference marked as placeholder data", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await collectViaStub("f-1", "shop-1", "test-driver-1", "staff-1");

    const event = calls.find(([t]) => t.includes("fulfillment_event"));
    expect(event?.[1]).toContain("collected:placeholder:test-driver-1");
  });
});

describe("deliver stub — ⚠ dev-only (the driver-stub tail)", () => {
  it("only ever moves collected to delivered", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await deliverViaStub("f-1", "shop-1", "test-driver-1", "staff-1");

    expect(calls[0]?.[1]).toEqual(["f-1", "shop-1", "collected", "delivered"]);
  });

  it("records the driver reference marked as placeholder data", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await deliverViaStub("f-1", "shop-1", "test-driver-1", "staff-1");

    const event = calls.find(([t]) => t.includes("fulfillment_event"));
    expect(event?.[1]).toContain("delivered:placeholder:test-driver-1");
  });
});
