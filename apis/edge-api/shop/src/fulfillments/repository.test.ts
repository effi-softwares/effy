import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

// The ready gate (bags and prints) is proven in parcels/parcels.container.test.ts; here, the transition's SQL.
vi.mock("../parcels/repository", () => ({ assertReadyForPickup: vi.fn(async () => undefined) }));

import { emptyShelfFromPick, listQueue, readDetail, transition } from "./repository";

const sql = (call: unknown[] | undefined): string =>
  String(call?.[0] ?? "").replace(/\s+/g, " ");

/** Runs the callback against a recording fake client. */
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

    // `unfulfillable` and `withdrawn` are "completed" for the shop: off the active queue, not fulfilled.
    expect(query.mock.calls[0]?.[1]).toEqual([
      "shop-1",
      ["ready_for_pickup", "collected", "delivered", "unfulfillable", "withdrawn"],
    ]);
  });

  // order_item.shop_id makes a shop's slice of a multi-shop order a direct query.
  it("restricts the detail's item read to the portion's own shop", async () => {
    query.mockResolvedValue({ rows: [{ id: "f-1", delivery_address: {}, placed_at: new Date() }] });
    await readDetail("f-1", "shop-1", "staff-1").catch(() => undefined);

    const itemQuery = query.mock.calls.map((c) => sql(c)).find((t) => t.includes("order_item oi"));
    expect(itemQuery).toContain("oi.shop_id = sf.shop_id");
    expect(itemQuery).toContain("WHERE sf.id = $1 AND sf.shop_id = $2");
  });

  // A shop never sees what the customer paid, nor an order total (which would leak other shops' lines).
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
});

describe("guarded transitions (FR-014, SC-005)", () => {
  it("guards the update on the expected current status", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await transition("f-1", "shop-1", "received", "picking", "staff-1");

    const update = calls.map(([t]) => t.replace(/\s+/g, " "))[0];
    expect(update).toContain("WHERE id = $1 AND shop_id = $2 AND status = $3");
    // `null` is the reason, written in the same statement as the status so the check sees both.
    expect(calls[0]?.[1]).toEqual(["f-1", "shop-1", "received", "picking", null]);
  });

  it("reports false when the guard matched nothing, and writes no audit row", async () => {
    const calls = fakeTx([{ rowCount: 0, rows: [] }]);
    const applied = await transition("f-1", "shop-1", "received", "picking", "staff-1");

    expect(applied).toBe(false);
    expect(calls).toHaveLength(1);
  });

  // The audit is written in the same transaction as the change.
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
      // `detail`: Null for every event but tags_changed.
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

  // A reversal must not wipe recorded progress, hence on conflict do nothing.
  it("does not seed progress rows on any transition other than into picking", async () => {
    const calls = fakeTx([{ rowCount: 1, rows: [{ id: "f-1" }] }]);
    await transition("f-1", "shop-1", "picking", "ready_for_pickup", "staff-1");

    expect(calls.some(([t]) => t.includes("INSERT INTO public.fulfillment_item"))).toBe(false);
  });
});

// A pick shortfall corrects the shop's count: the shelf is the truth.
describe("a pick shortfall empties the shelf", () => {
  async function shortfallSql(): Promise<string> {
    const calls: Array<[string, unknown[]]> = [];
    await emptyShelfFromPick({ query: async (text: string, values: unknown[]) => calls.push([text, values]) }, "oi-1", "staff-1");
    return sql(calls[0]);
  }

  // Sets zero rather than subtracting: payment already deducted what was ordered.
  it("sets the variant's count to zero and records the movement as a pick shortfall", async () => {
    const text = await shortfallSql();
    expect(text).toContain("SET stock_on_hand = 0");
    expect(text).toContain("'pick_shortfall'");
  });

  // `stock_movement.actor_sub` holds subjects: shop and back-office staff live in different schemas.
  it("records the actor's cognito sub, not a shop_staff id", async () => {
    expect(await shortfallSql()).toContain("SELECT ss.cognito_sub FROM public.shop_staff ss WHERE ss.id = $2");
  });

  // Untracked or already empty: no movement (a history of "0 → 0" says nothing).
  it("touches only the tracked variant sold, and only when its shelf is not already empty", async () => {
    expect(await shortfallSql()).toContain("v.stock_tracked AND v.stock_on_hand <> 0");
  });
});

// Pre-seeded shortfall rows must not make a portion look like it is being picked.
describe("a portion with pre-seeded shortfall rows still reads as pending (054 FR-022a)", () => {
  it("takes status from sf.status alone, never from the presence of pick rows", async () => {
    query.mockResolvedValue({ rows: [] });
    await listQueue("shop-1", "active");

    const text = sql(query.mock.calls[0]);
    // Payment creates rows for lines the shelf could not supply, so rows do not mean picking started.
    expect(text).toContain("sf.status");
    expect(text).toContain("AND sf.status = ANY($2::text[])");
    // A left join, so a portion with no rows still appears with 0/0.
    expect(text).toContain("LEFT JOIN public.fulfillment_item");
  });
});
