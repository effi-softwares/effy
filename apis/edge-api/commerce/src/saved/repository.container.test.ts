import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql, transactorFor } from "@effy/edge-shared";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ListNameTakenError } from "./list-name";
import {
  CapReachedError, createSavedRepository, DEFAULT_LIST_REF, DefaultListError, InNamedListsError, ListLimitError,
  ListNotFoundError, ProductNotFoundError, type SavedRepository,
} from "./repository";

/**
 * 070 — saved items and lists against the REAL schema (FR-021, FR-035).
 *
 * Three things here cannot be shown without a real database and real concurrency:
 *
 *  · THE CAP IS A CAP. Simultaneous saves on separate connections cannot exceed it — which is true
 *    only because every writer takes the per-customer lock first.
 *  · THE INVARIANT HOLDS. A product is "saved" if and only if it is in at least one list; the sweep
 *    that maintains the second half runs in the same transaction as every removal.
 *  · ONE SHOPPER NEVER SEES OR TOUCHES ANOTHER'S LISTS.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let repo: SavedRepository;
let me: string;
let other: string;
const products: string[] = [];

const savedCount = async (customerId: string) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.customer_saved_item WHERE customer_id = $1`, [customerId])).rows[0]!.n;

d("070 — saved items and lists against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 12 });
    await pool.query(migrationSql());

    await pool.query(`INSERT INTO public.shop (code, name) VALUES ('SVD', 'Saved test shop')`);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('svd-type', 'Saved test type')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('svd-cat', 'Saved test category')`);
    for (let i = 0; i < 12; i += 1) {
      products.push(
        (
          await pool.query<{ id: string }>(
            `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, shop_price_amount,
                                         short_description, created_by, status, approved_at)
             SELECT (SELECT id FROM public.shop WHERE code='SVD'), (SELECT id FROM public.product_type WHERE key='svd-type'),
                    (SELECT id FROM public.category WHERE key='svd-cat'), $1, 10.00, 10.00, 'd', 'seed', 'active', now()
             RETURNING id::text AS id`,
            [`Saved product ${i}`],
          )
        ).rows[0]!.id,
      );
    }
    [me, other] = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email) VALUES ('svd-1', 'svd1@example.test'), ('svd-2', 'svd2@example.test')
         RETURNING id::text AS id`,
      )
    ).rows.map((r) => r.id) as [string, string];

    repo = createSavedRepository(pool, transactorFor(pool));
  }, 180_000);

  beforeEach(async () => {
    await pool.query(`DELETE FROM public.customer_list WHERE customer_id IN ($1, $2)`, [me, other]);
    await pool.query(`DELETE FROM public.customer_saved_item WHERE customer_id IN ($1, $2)`, [me, other]);
    await pool.query(`UPDATE public.product SET price_amount = 10.00, status = 'active', stock_tracked = false, stock_on_hand = NULL`);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("saving creates the default list on first use and is idempotent", async () => {
    expect(await repo.lists(me, null)).toEqual([]); // a read never creates it
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    expect(await repo.membershipIds(me)).toEqual([products[0]]);
    const lists = await repo.lists(me, null);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ is_default: true, name: null, count: 1, only_here: 1, contains: false });
    expect(typeof lists[0]!.count).toBe("number");
  });

  it("a product that does not exist cannot be saved", async () => {
    await expect(repo.addEntry(me, DEFAULT_LIST_REF, "00000000-0000-0000-0000-000000000000", null, 200)).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("⚠ THE CAP IS A CAP: simultaneous saves on separate connections cannot exceed it", async () => {
    const CAP = 3;
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, CAP);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[1]!, null, CAP);

    // Eight different products race for the one remaining place.
    const results = await Promise.allSettled(products.slice(2, 10).map((p) => repo.addEntry(me, DEFAULT_LIST_REF, p, null, CAP)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(CapReachedError);
    expect(await savedCount(me)).toBe(CAP);
  });

  it("the cap counts DISTINCT products — placing a saved product in another list never trips it", async () => {
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 1);
    const listId = await repo.createList(me, "Weekly", null, 20, 1);
    await expect(repo.addEntry(me, listId, products[0]!, null, 1)).resolves.toBeUndefined();
    await expect(repo.addEntry(me, listId, products[1]!, null, 1)).rejects.toBeInstanceOf(CapReachedError);
  });

  it("snapshots the price at save, and reports a drop but never a rise", async () => {
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[1]!, null, 200);
    await pool.query(`UPDATE public.product SET price_amount = 8.00 WHERE id = $1`, [products[0]]);
    await pool.query(`UPDATE public.product SET price_amount = 12.00 WHERE id = $1`, [products[1]]);
    const rows = Object.fromEntries((await repo.list(me, DEFAULT_LIST_REF)).map((r) => [r.product_id, r]));
    expect(rows[products[0]!]).toMatchObject({ price_amount: "8.00", saved_price_amount: "10.00", price_dropped: true });
    expect(rows[products[1]!]).toMatchObject({ price_amount: "12.00", saved_price_amount: "10.00", price_dropped: false });
  });

  it("classifies WHY an item cannot be bought", async () => {
    for (const p of products.slice(0, 4)) await repo.addEntry(me, DEFAULT_LIST_REF, p, null, 200);
    await pool.query(`UPDATE public.product SET status = 'archived' WHERE id = $1`, [products[1]]);
    await pool.query(`UPDATE public.product SET status = 'unavailable' WHERE id = $1`, [products[2]]);
    await pool.query(`UPDATE public.product SET stock_tracked = true, stock_on_hand = 0 WHERE id = $1`, [products[3]]);
    const verdicts = Object.fromEntries((await repo.list(me, DEFAULT_LIST_REF)).map((r) => [r.product_id, r.verdict]));
    expect(verdicts).toEqual({
      [products[0]!]: "purchasable", [products[1]!]: "no_longer_sold",
      [products[2]!]: "temporarily_unavailable", [products[3]!]: "temporarily_unavailable",
    });
  });

  it("⚠ THE INVARIANT: leaving its last list un-saves a product; leaving one of two does not", async () => {
    const listId = await repo.createList(me, "Weekly", products[0]!, 20, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    await repo.addEntry(me, listId, products[1]!, null, 200);

    await repo.removeEntry(me, listId, products[0]!); // still in "Saved"
    expect(await repo.membershipIds(me)).toContain(products[0]);

    await repo.removeEntry(me, listId, products[1]!); // its only list
    expect(await repo.membershipIds(me)).not.toContain(products[1]);
  });

  it("deleting a list un-saves exactly what it alone held, and is idempotent", async () => {
    const listId = await repo.createList(me, "Weekly", null, 20, 200);
    await repo.addEntry(me, listId, products[0]!, null, 200);
    await repo.addEntry(me, listId, products[1]!, null, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[1]!, null, 200);

    const before = (await repo.lists(me, null)).find((l) => l.id === listId)!;
    expect(before).toMatchObject({ count: 2, only_here: 1 }); // what deleting it would un-save

    await repo.deleteList(me, listId);
    await repo.deleteList(me, listId);
    expect(await repo.membershipIds(me)).toEqual([products[1]]);
  });

  it("the heart's un-save is REFUSED while the product is in a named list, and removes nothing", async () => {
    const listId = await repo.createList(me, "Weekly", products[0]!, 20, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    await expect(repo.remove(me, products[0]!)).rejects.toBeInstanceOf(InNamedListsError);
    expect(await repo.membershipIds(me)).toEqual([products[0]]);
    expect(await repo.namedProductIds(me)).toEqual([products[0]]);

    await repo.removeEntry(me, listId, products[0]!);
    await repo.remove(me, products[0]!);
    await repo.remove(me, products[0]!); // absent → a no-op
    expect(await repo.membershipIds(me)).toEqual([]);
  });

  it("list names: unique per shopper without regard to case, free across shoppers; the limit refuses", async () => {
    await repo.createList(me, "Weekly Items", null, 2, 200);
    await expect(repo.createList(me, "weekly items", null, 2, 200)).rejects.toBeInstanceOf(ListNameTakenError);
    await expect(repo.createList(other, "Weekly Items", null, 2, 200)).resolves.toBeTypeOf("string");
    await repo.createList(me, "Second", null, 2, 200);
    await expect(repo.createList(me, "Third", null, 2, 200)).rejects.toBeInstanceOf(ListLimitError);
  });

  it("creating a list WITH a product is atomic — a missing product leaves no empty list behind", async () => {
    await expect(repo.createList(me, "Ghost", "00000000-0000-0000-0000-000000000000", 20, 200)).rejects.toBeInstanceOf(ProductNotFoundError);
    expect((await repo.lists(me, null)).map((l) => l.name)).not.toContain("Ghost");
  });

  it("rename: taken name refused; the default list cannot be renamed or deleted", async () => {
    const a = await repo.createList(me, "Alpha", null, 20, 200);
    await repo.createList(me, "Beta", null, 20, 200);
    await expect(repo.renameList(me, a, "beta")).rejects.toBeInstanceOf(ListNameTakenError);
    await repo.renameList(me, a, "Gamma");
    expect((await repo.lists(me, null)).map((l) => l.name)).toEqual(["Gamma", "Beta"]);

    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    const realDefault = (await repo.lists(me, null)).find((l) => l.is_default)!.id;
    await expect(repo.renameList(me, DEFAULT_LIST_REF, "X")).rejects.toBeInstanceOf(DefaultListError);
    await expect(repo.renameList(me, realDefault, "X")).rejects.toBeInstanceOf(DefaultListError);
    await expect(repo.deleteList(me, realDefault)).rejects.toBeInstanceOf(DefaultListError);
  });

  it("⚠ one shopper's lists are invisible and untouchable to another — always 'not found'", async () => {
    const mine = await repo.createList(me, "Private", products[0]!, 20, 200);
    await expect(repo.list(other, mine)).rejects.toBeInstanceOf(ListNotFoundError);
    await expect(repo.renameList(other, mine, "Stolen")).rejects.toBeInstanceOf(ListNotFoundError);
    await expect(repo.addEntry(other, mine, products[1]!, null, 200)).rejects.toBeInstanceOf(ListNotFoundError);
    await repo.deleteList(other, mine); // idempotent no-op, NOT a deletion
    await repo.removeEntry(other, mine, products[0]!); // likewise
    expect((await repo.list(me, mine)).map((r) => r.product_id)).toEqual([products[0]]);
    expect(await repo.lists(other, null)).toEqual([]);
    await expect(repo.list(me, "not-a-uuid")).rejects.toBeInstanceOf(ListNotFoundError);
  });

  it("the chooser read says which lists contain a product", async () => {
    const listId = await repo.createList(me, "Weekly", products[0]!, 20, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[1]!, null, 200);
    const contains = Object.fromEntries((await repo.lists(me, products[0]!)).map((l) => [l.is_default ? "default" : l.id, l.contains]));
    expect(contains).toEqual({ default: false, [listId]: true });
  });

  it("merge: adds, skips what is gone or malformed, respects the cap, and joins 'Saved'", async () => {
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 3); // already saved
    const at = (n: number) => new Date(Date.UTC(2026, 8, 30 - n));
    const res = await repo.merge(
      me,
      [
        { productId: products[1]!, savedPriceAmount: "7.50", savedCurrency: "AUD", savedAt: at(0) },
        { productId: products[0]!, savedPriceAmount: "1.00", savedCurrency: "AUD", savedAt: at(1) }, // already there: untouched
        { productId: "junk", savedPriceAmount: null, savedCurrency: null, savedAt: at(2) },
        { productId: "00000000-0000-0000-0000-000000000000", savedPriceAmount: null, savedCurrency: null, savedAt: at(3) },
        { productId: products[2]!, savedPriceAmount: null, savedCurrency: null, savedAt: at(4) },
        { productId: products[3]!, savedPriceAmount: null, savedCurrency: null, savedAt: at(5) }, // over the cap of 3
      ],
      3,
    );
    expect(res.added).toBe(2);
    expect(res.skipped).toEqual([
      { productId: "junk", reason: "not_found" },
      { productId: "00000000-0000-0000-0000-000000000000", reason: "not_found" },
      { productId: products[3], reason: "cap_reached" },
    ]);
    expect(new Set(res.productIds)).toEqual(new Set([products[0], products[1], products[2]]));

    const rows = Object.fromEntries((await repo.list(me, DEFAULT_LIST_REF)).map((r) => [r.product_id, r.saved_price_amount]));
    expect(rows[products[1]!]).toBe("7.50"); // the device's observed price is the baseline
    expect(rows[products[0]!]).toBe("10.00"); // the account's own baseline stands
    expect(rows[products[2]!]).toBe("10.00"); // no observed price → the product's current one
  });

  it("undo restores an entry to the position it held", async () => {
    await repo.addEntry(me, DEFAULT_LIST_REF, products[0]!, null, 200);
    await repo.addEntry(me, DEFAULT_LIST_REF, products[1]!, new Date("2020-01-01T00:00:00Z"), 200);
    const rows = await repo.list(me, DEFAULT_LIST_REF);
    expect(rows.map((r) => r.product_id)).toEqual([products[0], products[1]]); // newest-added first
    expect(rows[1]?.saved_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });
});
