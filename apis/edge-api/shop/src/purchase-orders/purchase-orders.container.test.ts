import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}));

import * as repo from "./repository";
import { createPurchaseOrder, getPurchaseOrder, receivePurchaseOrder, updatePurchaseOrder } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

/**
 * ⚠ THE REAL MIGRATIONS, not a hand-written subset — the same reasoning `refunds.container.test.ts`
 * records. This exercises 057's own migration (`supplier`, `purchase_order`, `purchase_order_line`,
 * `product.supplier_id`, `stock_movement.purchase_order_line_id`), and a hand-written schema could
 * pass against tables the platform does not have.
 *
 * ⚠ AND RECEIVING IS THE ONE WRITE IN THIS FEATURE THAT MOVES STOCK. Every property that matters —
 * absolute-not-delta quantities, the derived status, the paper trail, and the untracked-product
 * carve-out — is SQL, and only a real database can say whether the SQL is right.
 */
function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("no migrations found — this harness would pass vacuously");
  return files
    .map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      const start = body.indexOf("-- +goose Up");
      const rest = start < 0 ? body : body.slice(start);
      const end = rest.indexOf("-- +goose Down");
      return end < 0 ? rest : rest.slice(0, end);
    })
    .join("\n");
}

const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "77777777-7777-4777-8777-777777777777";
const SUPPLIER = "88888888-8888-4888-8888-888888888888";
const TRACKED = "66666666-6666-4666-8666-666666666666";
const UNTRACKED = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!RUN)("purchase orders — against real PostgreSQL and the real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(applyMigrations());
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`,
    );
    await pool.query(`INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'),($2,'S2','Shop Two')`,
      [SHOP, OTHER_SHOP]);
    await pool.query(`INSERT INTO public.product_type (id, key, name) VALUES (gen_random_uuid(),'grocery','Grocery')`);
    await pool.query(`INSERT INTO public.category (id, key, name) VALUES (gen_random_uuid(),'pantry','Pantry')`);
    await pool.query(
      `INSERT INTO public.supplier (id, shop_id, name) VALUES ($1,$2,'Riverina Produce')`,
      [SUPPLIER, SHOP],
    );
    for (const [id, name, tracked, onHand] of [
      [TRACKED, "Barossa Free-Range Eggs 700g", true, 4],
      [UNTRACKED, "Golden Circle Pineapple Juice 2L", false, 0],
    ] as const) {
      await pool.query(
        `INSERT INTO public.product (id, shop_id, product_type_id, primary_category_id, name,
           price_amount, short_description, created_by, stock_tracked, stock_on_hand)
         SELECT $1,$2,pt.id,c.id,$3,10,'x','seed',$4,$5
           FROM public.product_type pt, public.category c
          WHERE pt.key='grocery' AND c.key='pantry'`,
        [id, SHOP, name, tracked, onHand],
      );
    }
  });

  async function draftWithTracked(qty = 24) {
    const po = await createPurchaseOrder(SHOP, "sub-manager", {
      supplierId: SUPPLIER,
      lines: [{ productId: TRACKED, orderedQuantity: qty, unitCost: "3.50" }],
    });
    await updatePurchaseOrder(SHOP, po.id, { status: "submitted" });
    return po.id;
  }

  async function onHand(productId: string): Promise<number> {
    const r = await pool.query(`SELECT stock_on_hand FROM public.product WHERE id = $1`, [productId]);
    return r.rows[0].stock_on_hand;
  }

  it("mints a per-shop reference when none is supplied", async () => {
    const po = await createPurchaseOrder(SHOP, "sub-manager", {
      supplierId: SUPPLIER,
      lines: [{ productId: TRACKED, orderedQuantity: 2, unitCost: "1.00" }],
    });
    expect(po.reference).toMatch(/^PO-\d{4}$/);
    expect(po.estimatedTotal).toBe("2.00");
    expect(po.linesEditable).toBe(true);
  });

  it("refuses a product that belongs to another shop", async () => {
    await pool.query(
      `INSERT INTO public.product (id, shop_id, product_type_id, primary_category_id, name,
         price_amount, short_description, created_by)
       SELECT '55555555-5555-4555-8555-555555555555',$1,pt.id,c.id,'Theirs',5,'x','seed'
         FROM public.product_type pt, public.category c WHERE pt.key='grocery' AND c.key='pantry'`,
      [OTHER_SHOP],
    );
    await expect(
      createPurchaseOrder(SHOP, "sub-manager", {
        supplierId: SUPPLIER,
        lines: [{ productId: "55555555-5555-4555-8555-555555555555", orderedQuantity: 1, unitCost: "1.00" }],
      }),
    ).rejects.toThrow(/not in this shop's catalog/);
  });

  /** ⚠ A total that silently omits unpriced lines is a wrong number presented as a right one. */
  it("reports no estimated total when any line has no unit cost", async () => {
    const po = await createPurchaseOrder(SHOP, "sub-manager", {
      supplierId: SUPPLIER,
      lines: [
        { productId: TRACKED, orderedQuantity: 2, unitCost: "3.00" },
        { productId: UNTRACKED, orderedQuantity: 1, unitCost: null },
      ],
    });
    expect(po.estimatedTotal).toBeNull();
  });

  it("increases stock and writes a movement citing the purchase-order line", async () => {
    const id = await draftWithTracked();
    const po = await getPurchaseOrder(SHOP, id);

    await receivePurchaseOrder(SHOP, id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 24 }],
    });

    expect(await onHand(TRACKED)).toBe(28); // 4 on the shelf + 24 delivered

    const mv = await pool.query(
      `SELECT quantity_delta, quantity_before, quantity_after, reason, actor_kind, purchase_order_line_id
         FROM public.stock_movement WHERE product_id = $1`,
      [TRACKED],
    );
    expect(mv.rows).toHaveLength(1);
    expect(mv.rows[0]).toMatchObject({
      quantity_delta: 24,
      quantity_before: 4,
      quantity_after: 28,
      reason: "received",
      actor_kind: "shop",
    });
    // ⚠ THE WHOLE POINT OF THE FEATURE: "why do we have 28 of these" is answerable months later.
    expect(mv.rows[0].purchase_order_line_id).toBe(po.lines[0]!.id);
  });

  /**
   * ⚠ ABSOLUTE, NOT DELTA — the property that makes a double-tap on a flaky shop tablet safe. Sending
   * the same cumulative total twice must book the pallet ONCE. With deltas this test would read 52.
   */
  it("is idempotent: receiving the same cumulative total twice moves stock once", async () => {
    const id = await draftWithTracked();
    const po = await getPurchaseOrder(SHOP, id);
    const body = { lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 24 }] };

    await receivePurchaseOrder(SHOP, id, "sub-manager", body);
    await receivePurchaseOrder(SHOP, id, "sub-manager", body);

    expect(await onHand(TRACKED)).toBe(28);
    const mv = await pool.query(`SELECT count(*)::int AS n FROM public.stock_movement WHERE product_id=$1`, [TRACKED]);
    expect(mv.rows[0].n).toBe(1);
  });

  it("derives partially_received, then received, from the lines — never from the caller", async () => {
    const id = await draftWithTracked();
    const po = await getPurchaseOrder(SHOP, id);

    const after1 = await receivePurchaseOrder(SHOP, id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 10 }],
    });
    expect(after1.status).toBe("partially_received");
    expect(after1.closedAt).toBeNull();
    expect(await onHand(TRACKED)).toBe(14);

    const after2 = await receivePurchaseOrder(SHOP, id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 24 }],
    });
    expect(after2.status).toBe("received");
    expect(after2.closedAt).not.toBeNull();
    expect(await onHand(TRACKED)).toBe(28);
  });

  /**
   * ⚠ 054's NON-BREAKING GUARANTEE, restated at a new write. An untracked product has no count to
   * increase; inventing one would make it suddenly limited, which is exactly what 054 promised would
   * never happen to a product nobody opted in.
   */
  it("moves no stock for an untracked product, but still records what arrived", async () => {
    const po = await createPurchaseOrder(SHOP, "sub-manager", {
      supplierId: SUPPLIER,
      lines: [{ productId: UNTRACKED, orderedQuantity: 6, unitCost: "2.00" }],
    });
    await updatePurchaseOrder(SHOP, po.id, { status: "submitted" });
    await receivePurchaseOrder(SHOP, po.id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 6 }],
    });

    expect(await onHand(UNTRACKED)).toBe(0);
    const mv = await pool.query(`SELECT count(*)::int AS n FROM public.stock_movement WHERE product_id=$1`, [UNTRACKED]);
    expect(mv.rows[0].n).toBe(0);
    const after = await getPurchaseOrder(SHOP, po.id);
    expect(after.lines[0]!.receivedQuantity).toBe(6);
    expect(after.status).toBe("received");
  });

  /** ⚠ Over-receiving is ALLOWED: suppliers really do send 25 when you ordered 24, and refusing to
   *  record it would force the shop to lie about what is on the shelf. */
  it("accepts an over-delivery and still closes the order", async () => {
    const id = await draftWithTracked(24);
    const po = await getPurchaseOrder(SHOP, id);
    const after = await receivePurchaseOrder(SHOP, id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 25 }],
    });
    expect(after.status).toBe("received");
    expect(after.lines[0]!.receivedQuantity).toBe(25);
    expect(await onHand(TRACKED)).toBe(29);
  });

  it("lets an operator correct a mis-keyed receive downwards", async () => {
    const id = await draftWithTracked();
    const po = await getPurchaseOrder(SHOP, id);
    await receivePurchaseOrder(SHOP, id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 24 }],
    });
    await receivePurchaseOrder(SHOP, id, "sub-manager", {
      lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 4 }],
    });
    expect(await onHand(TRACKED)).toBe(8); // 4 + 24 - 20
  });

  it("refuses to receive a draft that was never sent", async () => {
    const po = await createPurchaseOrder(SHOP, "sub-manager", {
      supplierId: SUPPLIER,
      lines: [{ productId: TRACKED, orderedQuantity: 2, unitCost: "1.00" }],
    });
    await expect(
      receivePurchaseOrder(SHOP, po.id, "sub-manager", {
        lines: [{ lineId: po.lines[0]!.id, receivedQuantity: 2 }],
      }),
    ).rejects.toThrow(/send this order to the supplier/);
  });

  /** ⚠ Re-checked inside the transaction under FOR UPDATE — deciding it outside lets two operators
   *  submit and edit the same order concurrently. */
  it("refuses to rewrite the lines of an order already sent to the supplier", async () => {
    const id = await draftWithTracked();
    await expect(
      updatePurchaseOrder(SHOP, id, {
        lines: [{ productId: TRACKED, orderedQuantity: 99, unitCost: "1.00" }],
      }),
    ).rejects.toThrow(/no longer be edited/);
  });

  it("hides another shop's purchase orders completely", async () => {
    const id = await draftWithTracked();
    await expect(getPurchaseOrder(OTHER_SHOP, id)).rejects.toThrow(/not found/);
    expect(await repo.listPurchaseOrders(OTHER_SHOP)).toEqual([]);
  });
});
