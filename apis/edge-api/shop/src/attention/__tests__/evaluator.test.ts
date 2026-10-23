import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake database that enforces the unique constraint and the not null on `subject_key`, which the design rests on.
interface Row {
  id: string;
  shop_id: string;
  kind: string;
  subject_key: string;
  notified_at: Date | null;
}

const db = {
  occurrences: [] as Row[],
  intents: [] as Array<{ recipientSub: string; type: string; entityId: string; dedupeKey: string }>,
  recipients: [] as Array<{ sub: string; isManager: boolean }>,
  shops: [] as Array<{ id: string }>,
  nextId: 1,
  failShop: null as string | null,
};

vi.mock("../repository", () => ({
  activeShops: vi.fn(async () => db.shops),
  storedOccurrences: vi.fn(async (_tx: unknown, shopId: string) =>
    db.occurrences
      .filter((o) => o.shop_id === shopId)
      .map((o) => ({ id: o.id, kind: o.kind, subjectKey: o.subject_key, notifiedAt: o.notified_at })),
  ),
  insertOccurrence: vi.fn(async (_tx: unknown, shopId: string, kind: string, subjectKey: string) => {
    if (subjectKey === null || subjectKey === undefined) {
      throw new Error('null value in column "subject_key" violates not-null constraint');
    }
    // Unique (shop_id, kind, subject_key): On conflict do nothing returns no row.
    if (db.occurrences.some((o) => o.shop_id === shopId && o.kind === kind && o.subject_key === subjectKey)) {
      return null;
    }
    const id = `occ-${db.nextId++}`;
    db.occurrences.push({ id, shop_id: shopId, kind, subject_key: subjectKey, notified_at: null });
    return id;
  }),
  touchOccurrences: vi.fn(async () => undefined),
  deleteOccurrences: vi.fn(async (_tx: unknown, ids: string[]) => {
    db.occurrences = db.occurrences.filter((o) => !ids.includes(o.id));
  }),
  markNotified: vi.fn(async (_tx: unknown, ids: string[]) => {
    for (const o of db.occurrences) if (ids.includes(o.id)) o.notified_at = new Date();
  }),
  recipientsForShop: vi.fn(async () => db.recipients),
  enqueueIntent: vi.fn(async (_tx: unknown, v: (typeof db.intents)[number]) => {
    // Unique (dedupe_key): a repeat is a silent no-op, so retries are safe.
    if (db.intents.some((i) => i.dedupeKey === v.dedupeKey)) return;
    db.intents.push(v);
  }),
  withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
}));

const readToday = vi.fn();
vi.mock("../../today/service", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readToday: (...a: unknown[]) => readToday(...a),
}));

import { evaluateAll, evaluateShop, subjectKeyFor } from "../evaluator";

const SHOP = "shop-1";
const NOW = new Date("2026-09-19T04:00:00Z");

/** A Today snapshot with whatever attention conditions the test wants true. */
function snapshot(over: {
  awaitingPick?: { orders: number; units: number };
  out?: Array<{ productId: string; name: string; variantId?: string }>;
  low?: Array<{ productId: string; name: string; variantId?: string }>;
  proposals?: Array<{ fulfillmentId: string; orderNumber: string }>;
} = {}) {
  return {
    now: NOW,
    timezone: "Australia/Melbourne",
    backlog: {
      awaitingPick: over.awaitingPick
        ? { ...over.awaitingPick, oldestPaidAt: NOW }
        : { orders: 0, units: 0, oldestPaidAt: null },
      readyForPickup: 0,
      lowStock: { skus: 0, outOfStock: 0 },
    },
    stock: [
      // Each row is one size, named after its product.
      ...(over.out ?? []).map((p) => ({
        variantId: `${p.productId}-v`,
        ...p,
        severity: "out" as const,
        onHand: 0,
        soldLast7Days: 3,
        daysOfCover: null,
        since: NOW,
      })),
      ...(over.low ?? []).map((p) => ({
        variantId: `${p.productId}-v`,
        ...p,
        severity: "low" as const,
        onHand: 2,
        soldLast7Days: 1,
        daysOfCover: 2,
        since: NOW,
      })),
    ],
    proposals: (over.proposals ?? []).map((p) => ({ ...p, amount: "10.00", since: NOW })),
    live: [],
  };
}

beforeEach(() => {
  db.occurrences = [];
  db.intents = [];
  db.shops = [{ id: SHOP }];
  db.recipients = [{ sub: "picker", isManager: false }];
  db.nextId = 1;
  readToday.mockReset();
});

describe("A1/A2 — once per occurrence", () => {
  it("A1: a new condition records one occurrence and enqueues one intent", async () => {
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    const r = await evaluateShop(SHOP);
    expect(r.appeared).toBe(1);
    expect(db.intents).toHaveLength(1);
    expect(db.intents[0]!.type).toBe("shop_out_of_stock");
  });

  it("098 — two sizes of one product are two occurrences; restocking one leaves the other open", async () => {
    readToday.mockResolvedValue(snapshot({
      out: [
        { productId: "p1", variantId: "p1-500g", name: "Rice — 500 g" },
        { productId: "p1", variantId: "p1-1kg", name: "Rice — 1 kg" },
      ],
    }));
    expect((await evaluateShop(SHOP)).appeared).toBe(2);

    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", variantId: "p1-1kg", name: "Rice — 1 kg" }] }));
    const after = await evaluateShop(SHOP);
    expect(after.appeared).toBe(0);
  });

  it("⚠ A2: a second run over an unchanged condition enqueues NOTHING", async () => {
    // Without this the operator hears about the same empty shelf every five minutes.
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    await evaluateShop(SHOP);
    await evaluateShop(SHOP);
    await evaluateShop(SHOP);
    expect(db.intents).toHaveLength(1);
    expect(db.occurrences).toHaveLength(1);
  });
});

describe("⚠ A3 — a recurrence notifies again (FR-019)", () => {
  it("clears the row when the condition clears, and notifies again when it returns", async () => {
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    await evaluateShop(SHOP);
    expect(db.intents).toHaveLength(1);

    // Restocked.
    readToday.mockResolvedValue(snapshot());
    const cleared = await evaluateShop(SHOP);
    expect(cleared.cleared).toBe(1);
    expect(db.occurrences).toHaveLength(0);

    // Out again — a new occurrence, so a dedupe key the outbox has never seen.
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    await evaluateShop(SHOP);
    expect(db.intents).toHaveLength(2);
    expect(db.intents[0]!.dedupeKey).not.toBe(db.intents[1]!.dedupeKey);
  });

  it("⚠ the dedupe key is built from the OCCURRENCE id, not the product id", async () => {
    // Keying on the product would make the recurrence a silent no-op.
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    await evaluateShop(SHOP);
    expect(db.intents[0]!.dedupeKey).toContain("occ-");
    expect(db.intents[0]!.dedupeKey).not.toContain("p1");
  });
});

describe("⚠ A4 — coalescing (FR-020, SC-005)", () => {
  it("40 products below threshold in one run produce ONE intent per recipient", async () => {
    // One stock count can do this: forty banners would teach the operator to dismiss everything.
    const low = Array.from({ length: 40 }, (_, i) => ({ productId: `p${i}`, name: `Product ${i}` }));
    readToday.mockResolvedValue(snapshot({ low }));

    const r = await evaluateShop(SHOP);
    expect(r.appeared).toBe(40);
    expect(db.intents).toHaveLength(1);
  });

  it("still separates the KINDS, because they are different situations", async () => {
    readToday.mockResolvedValue(
      snapshot({
        out: [{ productId: "p1", name: "Milk" }],
        low: [{ productId: "p2", name: "Bread" }],
        awaitingPick: { orders: 3, units: 11 },
      }),
    );
    await evaluateShop(SHOP);
    expect(db.intents.map((i) => i.type).sort()).toEqual([
      "shop_awaiting_pick",
      "shop_low_stock",
      "shop_out_of_stock",
    ]);
  });
});

describe("⚠ A5 — a manager-only kind reaches only managers (FR-022)", () => {
  it("does not enqueue a refund proposal for shop_staff", async () => {
    db.recipients = [{ sub: "picker", isManager: false }];
    readToday.mockResolvedValue(
      snapshot({ proposals: [{ fulfillmentId: "f1", orderNumber: "EFY-1" }] }),
    );
    await evaluateShop(SHOP);
    expect(db.intents).toHaveLength(0);
    // The occurrence is still recorded, so it is not announced as new when a manager signs in.
    expect(db.occurrences).toHaveLength(1);
  });

  it("does enqueue it for a manager", async () => {
    db.recipients = [
      { sub: "picker", isManager: false },
      { sub: "boss", isManager: true },
    ];
    readToday.mockResolvedValue(
      snapshot({ proposals: [{ fulfillmentId: "f1", orderNumber: "EFY-1" }] }),
    );
    await evaluateShop(SHOP);
    expect(db.intents.map((i) => i.recipientSub)).toEqual(["boss"]);
  });

  it("sends non-manager kinds to everyone", async () => {
    db.recipients = [
      { sub: "picker", isManager: false },
      { sub: "boss", isManager: true },
    ];
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    await evaluateShop(SHOP);
    expect(db.intents.map((i) => i.recipientSub).sort()).toEqual(["boss", "picker"]);
  });
});

describe("A7 — recipients are resolved at enqueue time (FR-016)", () => {
  it("enqueues nothing when the shop has no active staff", async () => {
    db.recipients = [];
    readToday.mockResolvedValue(snapshot({ out: [{ productId: "p1", name: "Milk" }] }));
    const r = await evaluateShop(SHOP);
    expect(db.intents).toHaveLength(0);
    expect(r.appeared).toBe(1);
  });
});

describe("⚠ A8 — the backlog's subject key is the empty string, never null", () => {
  it("records ONE backlog occurrence across many runs", async () => {
    // `subject_key` is not null text: a null in the unique index would insert and notify on every run.
    expect(subjectKeyFor({ kind: "awaiting_pick", orders: 3, units: 11, since: NOW })).toBe("");

    readToday.mockResolvedValue(snapshot({ awaitingPick: { orders: 3, units: 11 } }));
    await evaluateShop(SHOP);
    await evaluateShop(SHOP);
    await evaluateShop(SHOP);
    expect(db.occurrences.filter((o) => o.kind === "awaiting_pick")).toHaveLength(1);
    expect(db.intents).toHaveLength(1);
  });

  it("treats a changed backlog as the SAME situation", async () => {
    // The backlog changes composition constantly but is one situation.
    readToday.mockResolvedValue(snapshot({ awaitingPick: { orders: 3, units: 11 } }));
    await evaluateShop(SHOP);
    readToday.mockResolvedValue(snapshot({ awaitingPick: { orders: 9, units: 40 } }));
    await evaluateShop(SHOP);
    expect(db.intents).toHaveLength(1);
  });
});

describe("⚠ A9 — one shop's failure does not silence the others", () => {
  it("logs and skips a shop that throws, then carries on", async () => {
    // One shop's bad data must not stop every other shop's notifications.
    db.shops = [{ id: "bad" }, { id: "good" }];
    readToday.mockImplementation(async (actor: { shopId: string }) => {
      if (actor.shopId === "bad") throw new Error("boom");
      return snapshot({ out: [{ productId: "p1", name: "Milk" }] });
    });

    const stats = await evaluateAll();
    expect(stats.failedShops).toBe(1);
    expect(stats.shops).toBe(2);
    expect(db.intents).toHaveLength(1);
    expect(db.occurrences[0]!.shop_id).toBe("good");
  });
});

describe("⚠ the evaluator sees EVERY occurrence, not the screen's top eight", () => {
  it("records more occurrences than the Needs attention card would show", async () => {
    // Not capped at the card's 8, or the rest would be announced one at a time for weeks.
    const low = Array.from({ length: 20 }, (_, i) => ({ productId: `p${i}`, name: `P${i}` }));
    readToday.mockResolvedValue(snapshot({ low }));
    const r = await evaluateShop(SHOP);
    expect(r.appeared).toBe(20);
  });
});

describe("⚠ the occurrence is recorded regardless of who can act on it", () => {
  it("reads proposals with canRefund true, and filters at the recipient instead", async () => {
    readToday.mockResolvedValue(snapshot());
    await evaluateShop(SHOP);
    const deps = readToday.mock.calls[0]![1] as { canRefund: (s: string) => Promise<boolean> };
    await expect(deps.canRefund("anyone")).resolves.toBe(true);
  });
});
