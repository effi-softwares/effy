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

    // ⚠ 055 — `unfulfillable` and `withdrawn` are "completed" FROM THE SHOP'S POINT OF VIEW, meaning
    // off the active queue, not fulfilled. That is the whole point of US6: a portion nobody can fill
    // must leave the list of work, or the shop looks at it every day with nothing they can do.
    expect(query.mock.calls[0]?.[1]).toEqual([
      "shop-1",
      ["ready_for_pickup", "collected", "delivered", "unfulfillable", "withdrawn"],
    ]);
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
    // ⚠ `null` is the 055 reason: written in the SAME statement as the status, so the CHECK
    // constraint sees both at once. Setting the status first and the reason after would make the
    // intermediate row violate the constraint.
    expect(calls[0]?.[1]).toEqual(["f-1", "shop-1", "received", "picking", null]);
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

// ── 054: a pick shortfall corrects the shop's count (FR-023, A9) ────────────────────────────────
//
// ⚠ THE SHELF IS THE TRUTH. A picker standing at the shelf has just produced better information than
// the count did: if they could only find 1 of 3, the shop does not have 2 more somewhere. Leaving the
// count wrong means the next shopper is sold the same phantom unit — which is the loop this whole
// feature exists to break.
describe("a pick shortfall corrects stock (054 FR-023)", () => {
  it("empties the shelf and records WHY, in the same transaction as the pick", async () => {
    const calls = fakeTx([
      { rowCount: 1, rows: [{ id: "fi-1", gathered_quantity: 1, unavailable_quantity: 2, ordered_quantity: 3 }] },
    ]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { unavailableQuantity: 2 }, "staff-1");

    const stockCall = calls.find(([text]) => text.includes("public.stock_movement"));
    expect(stockCall, "a shortfall must write a stock movement").toBeDefined();
    const text = String(stockCall?.[0]).replace(/\s+/g, " ");

    // ⚠ SETS ZERO, does not subtract. The paid transaction already deducted what was ordered;
    // subtracting again would double-count. What a shortfall reports is simply "the shelf is empty".
    expect(text).toContain("SET stock_on_hand = 0");
    expect(text).toContain("'pick_shortfall'");
    // Same transaction as the pick — a count that moves with no movement recorded makes SC-005 false
    // forever, and the history can never be reconstructed after the fact.
    expect(calls.some(([t]) => t.includes("UPDATE public.fulfillment_item"))).toBe(true);
  });

  it("resolves the actor's cognito sub rather than storing a shop_staff id", async () => {
    const calls = fakeTx([
      { rowCount: 1, rows: [{ id: "fi-1", gathered_quantity: 0, unavailable_quantity: 3, ordered_quantity: 3 }] },
    ]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { unavailableQuantity: 3 }, "staff-1");

    const text = String(calls.find(([t]) => t.includes("public.stock_movement"))?.[0]).replace(/\s+/g, " ");
    // stock_movement.actor_sub snapshots SUBJECTS, not staff-table ids: shop staff live in `public`
    // and back-office staff in `admin`, and one audit column cannot reference both.
    expect(text).toContain("SELECT ss.cognito_sub FROM public.shop_staff ss WHERE ss.id = $2");
  });

  it("does NOT touch stock when an item is UN-flagged", async () => {
    const calls = fakeTx([
      { rowCount: 1, rows: [{ id: "fi-1", gathered_quantity: 3, unavailable_quantity: 0, ordered_quantity: 3 }] },
    ]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { unavailableQuantity: 0 }, "staff-1");

    // ⚠ "It turned up after all" says NOTHING about how many more are on the shelf. Zeroing the count
    // here would invent a fact the picker never reported — and it is the correction path for a
    // shortfall that was flagged at payment (FR-022a) rather than found at the shelf.
    expect(calls.some(([t]) => t.includes("public.stock_movement"))).toBe(false);
  });

  it("does not touch stock when only the gathered count is recorded", async () => {
    const calls = fakeTx([
      { rowCount: 1, rows: [{ id: "fi-1", gathered_quantity: 2, unavailable_quantity: 0, ordered_quantity: 3 }] },
    ]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { gatheredQuantity: 2 }, "staff-1");

    expect(calls.some(([t]) => t.includes("public.stock_movement"))).toBe(false);
  });

  it("writes nothing for an untracked product or an already-empty shelf", async () => {
    const calls = fakeTx([
      { rowCount: 1, rows: [{ id: "fi-1", gathered_quantity: 0, unavailable_quantity: 1, ordered_quantity: 1 }] },
    ]);
    await updateItemProgress("f-1", "shop-1", "oi-1", { unavailableQuantity: 1 }, "staff-1");

    const text = String(calls.find(([t]) => t.includes("public.stock_movement"))?.[0]).replace(/\s+/g, " ");
    // Untracked → no row to lock, so no movement (FR-024). Already zero → no movement either, because
    // a history full of "corrected 0 → 0" is a history nobody reads.
    expect(text).toContain("p.stock_tracked AND p.stock_on_hand <> 0");
  });
});

// ── 054 R4: pre-seeded shortfall rows must not make a portion look like it is being picked ──────
describe("a portion with pre-seeded shortfall rows still reads as pending (054 FR-022a)", () => {
  it("takes status from sf.status alone, never from the presence of pick rows", async () => {
    query.mockResolvedValue({ rows: [] });
    await listQueue("shop-1", "active");

    const text = sql(query.mock.calls[0]);
    // ⚠ The paid transaction now creates fulfillment_item rows BEFORE picking begins, for any line
    // the shelf could not supply. A query that inferred "picking has started" from their existence
    // would have been correct before 054 and is wrong now — and the comment above LIST_QUEUE said
    // exactly that until 054 corrected it.
    expect(text).toContain("sf.status");
    expect(text).toContain("AND sf.status = ANY($2::text[])");
    // The join stays a LEFT JOIN so a portion with no rows still appears with 0/0.
    expect(text).toContain("LEFT JOIN public.fulfillment_item");
  });
});
