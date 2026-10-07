import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 065 — the driver's item manifest, against the REAL migrations.
 *
 * ⚠ THESE CANNOT BE UNIT TESTS. Everything that can be wrong here is a join: which lines belong to
 * which package, whether the class comes from the order line or the live product, whether a pick row
 * is found. A mocked repository returns whatever the test author believes the query returns — 063
 * recorded six column names that typechecked perfectly and failed only against PostgreSQL.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  };
});

import { migrationSql } from "@effy/edge-shared";

import { deliveryDrop } from "./delivery";
import { NotFoundError, collectionStop, deliveryRun } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params as never[])).rows[0]!;

async function makeDriver(tag: string): Promise<string> {
  const { id } = await one<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email)
     VALUES ($1, 'Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`,
    [`sub-${tag}-${crypto.randomUUID()}`],
  );
  return id;
}

async function makeShop(code: string): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, $1 || ' shop') RETURNING id`, [code],
  )).id;
}

async function makeProduct(shopId: string, name: string): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name,
                                 price_amount, short_description, created_by, status, approved_at)
     VALUES ($1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1),
             $2, 4.50, 'A thing', 'test', 'active', now()) RETURNING id`,
    [shopId, name],
  )).id;
}

/** Sets the product's LIVE storage attribute — what a shop edits, as opposed to the order's snapshot. */
async function setLiveStorage(productId: string, value: string): Promise<void> {
  await pool.query(
    `DELETE FROM public.product_attribute_value
      WHERE product_id = $1
        AND attribute_definition_id = (SELECT id FROM public.attribute_definition WHERE key = 'storage')`,
    [productId],
  );
  await pool.query(
    `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text)
     VALUES ($1, (SELECT id FROM public.attribute_definition WHERE key = 'storage'), $2)`,
    [productId, value],
  );
}

async function makeOrder(number: string): Promise<string> {
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  return (await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount,
                                 delivery_address, status)
     VALUES ($1, $2, 10, 12,
             '{"recipientName":"Pat","line1":"1 Test St","city":"Carlton","postalCode":"3053","region":"VIC"}'::jsonb,
             'paid') RETURNING id`,
    [cust.id, number],
  )).id;
}

async function makePackage(orderId: string, shopId: string, method: "same_day" | "standard"): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, 'ready_for_pickup', $3) RETURNING id`,
    [orderId, shopId, method],
  )).id;
}

interface LineOpts {
  storage: string | null;
  qty?: number;
  /** undefined → no pick row at all; a number → a pick row with that many gathered. */
  gathered?: number;
}

async function addLine(orderId: string, shopId: string, packageId: string, name: string, o: LineOpts): Promise<string> {
  const productId = await makeProduct(shopId, name);
  const qty = o.qty ?? 1;
  const { id } = await one<{ id: string }>(
    `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount,
                                    quantity, line_subtotal_amount, storage_class)
     VALUES ($1, $2, $3, $4, 4.50, $5::int, 4.50 * $5::int, $6) RETURNING id`,
    [orderId, productId, shopId, name, qty, o.storage],
  );
  if (o.gathered !== undefined) {
    await pool.query(
      `INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity,
                                            gathered_quantity, unavailable_quantity)
       VALUES ($1, $2, $3::int, $4::int, $3::int - $4::int)`,
      [packageId, id, qty, o.gathered],
    );
  }
  return productId;
}

async function makeRound(driverId: string, kind: "collection" | "delivery"): Promise<string> {
  const wave = await one<{ id: string }>(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ($1, now(), 'schedule') RETURNING id`,
    [kind],
  );
  return (await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
     VALUES ($1, $2, $3, now() + interval '30 minutes') RETURNING id`,
    [wave.id, driverId, kind],
  )).id;
}

async function attach(stopId: string, packageId: string, offsetMs: number): Promise<void> {
  // ⚠ Distinct created_at values, because "Package 1 of 2" is ordered by creation and two rows
  // inserted in one statement batch can share a timestamp.
  await pool.query(
    `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, created_at)
     VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
    [stopId, packageId, String(offsetMs)],
  );
}

d("065 — driver item manifest", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    for (const t of [
      "round_package", "round_stop", "driver_round", "dispatch_wave", "fulfillment_item",
      "shop_fulfillment", "order_item",
    ]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.product_attribute_value");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver");
  });

  // ── US1 — pickup ────────────────────────────────────────────────────────────────────────────────

  async function pickupFixture() {
    const driverId = await makeDriver("c");
    const shop = await makeShop("SA");
    const roundId = await makeRound(driverId, "collection");
    const stopId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id`,
      [roundId, shop],
    )).id;

    const o1 = await makeOrder("EFY-PICK01");
    const p1 = await makePackage(o1, shop, "same_day");
    await addLine(o1, shop, p1, "Peas", { storage: "frozen" });
    await addLine(o1, shop, p1, "Milk", { storage: "chilled" });

    const o2 = await makeOrder("EFY-PICK02");
    const p2 = await makePackage(o2, shop, "standard");
    await addLine(o2, shop, p2, "Rice", { storage: "ambient", qty: 3 });
    await addLine(o2, shop, p2, "Pasta", { storage: "ambient", qty: 2 });

    await attach(stopId, p1, 0);
    await attach(stopId, p2, 5);
    return { driverId, roundId, stopId };
  }

  /** ⚠ research R2 — before 065 both packages returned all four lines. */
  it("⚠ each package at a stop carries ONLY its own lines and its own summary", async () => {
    const { driverId, roundId, stopId } = await pickupFixture();
    const stop = await collectionStop(roundId, stopId, driverId);

    const first = stop.packages.find((p) => p.ref === "EFY-PICK01")!;
    const second = stop.packages.find((p) => p.ref === "EFY-PICK02")!;
    expect(first.items.map((i) => i.name)).toEqual(["Peas", "Milk"]);
    expect(second.items.map((i) => i.name).sort()).toEqual(["Pasta", "Rice"]);
    expect(first.summary).toEqual({ frozen: 1, chilled: 1, normal: 0, notRecorded: 0 });
    expect(second.summary).toEqual({ frozen: 0, chilled: 0, normal: 5, notRecorded: 0 });
  });

  it("classes come back in the driver's vocabulary, cold first", async () => {
    const { driverId, roundId, stopId } = await pickupFixture();
    const stop = await collectionStop(roundId, stopId, driverId);
    const first = stop.packages.find((p) => p.ref === "EFY-PICK01")!;
    expect(first.items.map((i) => i.temperatureClass)).toEqual(["frozen", "chilled"]);
    const second = stop.packages.find((p) => p.ref === "EFY-PICK02")!;
    expect(new Set(second.items.map((i) => i.temperatureClass))).toEqual(new Set(["normal"]));
  });

  /** FR-004 — a standard package the driver only carries to the hub has the same list. */
  it("a standard package carries its manifest too", async () => {
    const { driverId, roundId, stopId } = await pickupFixture();
    const stop = await collectionStop(roundId, stopId, driverId);
    const standard = stop.packages.find((p) => p.method === "standard")!;
    expect(standard.items).toHaveLength(2);
  });

  // ── US2 — the drop ──────────────────────────────────────────────────────────────────────────────

  async function dropFixture() {
    const driverId = await makeDriver("d");
    const shopA = await makeShop("SA");
    const shopB = await makeShop("SB");
    const orderId = await makeOrder("EFY-DROP01");
    const pA = await makePackage(orderId, shopA, "same_day");
    const pB = await makePackage(orderId, shopB, "same_day");
    await addLine(orderId, shopA, pA, "Peas", { storage: "frozen", qty: 2 });
    await addLine(orderId, shopA, pA, "Rice", { storage: "ambient" });
    await addLine(orderId, shopB, pB, "Milk", { storage: "chilled" });

    const roundId = await makeRound(driverId, "delivery");
    const dropId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).id;
    await attach(dropId, pA, 0);
    await attach(dropId, pB, 5);
    return { driverId, roundId, dropId, orderId, shopA, shopB, pA, pB };
  }

  it("a drop lists one entry per package, in a stable order, each with its own lines", async () => {
    const f = await dropFixture();
    const drop = await deliveryDrop(f.dropId, f.driverId);
    expect(drop.packages).toHaveLength(2);
    expect(drop.packages[0]!.items.map((i) => i.name)).toEqual(["Peas", "Rice"]);
    expect(drop.packages[1]!.items.map((i) => i.name)).toEqual(["Milk"]);

    const again = await deliveryDrop(f.dropId, f.driverId);
    expect(again.packages.map((p) => p.items.map((i) => i.name))).toEqual(
      drop.packages.map((p) => p.items.map((i) => i.name)),
    );
  });

  it("the drop summary is the sum of its packages, and the run list carries the same", async () => {
    const f = await dropFixture();
    const drop = await deliveryDrop(f.dropId, f.driverId);
    expect(drop.summary).toEqual({ frozen: 2, chilled: 1, normal: 1, notRecorded: 0 });

    const run = await deliveryRun(f.roundId, f.driverId);
    expect(run.drops[0]!.summary).toEqual(drop.summary);
  });

  it("another driver's drop is refused exactly like one that does not exist", async () => {
    const f = await dropFixture();
    const other = await makeDriver("x");
    await expect(deliveryDrop(f.dropId, other)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deliveryDrop(crypto.randomUUID(), f.driverId)).rejects.toBeInstanceOf(NotFoundError);
  });

  /**
   * ⚠ FR-020 / FR-021 / SC-007. `order_item` is a receipt line with a price on it and a `shop_id`
   * beside it, one column away from the ones this slice selects. The check is over the SERIALISED
   * payload, keys and values, so it catches a leak however it got there.
   */
  it("⚠ no driver payload carries money, and the drop names no shop", async () => {
    const f = await dropFixture();
    const drop = JSON.stringify(await deliveryDrop(f.dropId, f.driverId));
    const run = JSON.stringify(await deliveryRun(f.roundId, f.driverId));

    const p = await pickupFixtureFor(f.driverId);
    const stop = JSON.stringify(await collectionStop(p.roundId, p.stopId, f.driverId));

    const money = /"[^"]*(price|amount|total|fee|discount|subtotal)[^"]*"\s*:/i;
    for (const [name, body] of [["drop", drop], ["run", run], ["stop", stop]] as const) {
      expect(money.test(body), `${name} payload carries a money key`).toBe(false);
      expect(body.includes("4.5"), `${name} payload carries the unit price`).toBe(false);
    }
    for (const leak of [f.shopA, f.shopB, "SA shop", "SB shop", '"shopId"', '"shopName"', '"shopCode"']) {
      expect(drop.includes(leak), `drop payload leaks ${leak}`).toBe(false);
      expect(run.includes(leak), `run payload leaks ${leak}`).toBe(false);
    }
  });

  async function pickupFixtureFor(driverId: string) {
    const shop = await makeShop("SC");
    const roundId = await makeRound(driverId, "collection");
    const stopId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id`,
      [roundId, shop],
    )).id;
    const o = await makeOrder("EFY-PICK09");
    const p = await makePackage(o, shop, "same_day");
    await addLine(o, shop, p, "Bread", { storage: "ambient" });
    await attach(stopId, p, 0);
    return { roundId, stopId };
  }

  // ── US3 — the list matches the bag ──────────────────────────────────────────────────────────────

  it("an unavailable line is not included and is in no summary bucket", async () => {
    const driverId = await makeDriver("b");
    const shop = await makeShop("SA");
    const orderId = await makeOrder("EFY-BAG01");
    const pkg = await makePackage(orderId, shop, "same_day");
    await addLine(orderId, shop, pkg, "Peas", { storage: "frozen", qty: 2, gathered: 0 });
    await addLine(orderId, shop, pkg, "Milk", { storage: "chilled", qty: 4, gathered: 1 });
    await addLine(orderId, shop, pkg, "Rice", { storage: "ambient", qty: 3, gathered: 3 });
    const roundId = await makeRound(driverId, "delivery");
    const dropId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).id;
    await attach(dropId, pkg, 0);

    const items = (await deliveryDrop(dropId, driverId)).packages[0]!;
    const byName = Object.fromEntries(items.items.map((i) => [i.name, i]));
    expect(byName.Peas).toMatchObject({ included: false, qty: 0, orderedQty: 2 });
    expect(byName.Milk).toMatchObject({ included: true, qty: 1, orderedQty: 4 });
    expect(byName.Rice).toMatchObject({ included: true, qty: 3, orderedQty: 3 });
    expect(items.summary).toEqual({ frozen: 0, chilled: 1, normal: 3, notRecorded: 0 });
  });

  it("a package in which nothing was supplied still lists its lines, all not included", async () => {
    const driverId = await makeDriver("b");
    const shop = await makeShop("SA");
    const orderId = await makeOrder("EFY-BAG02");
    const pkg = await makePackage(orderId, shop, "same_day");
    await addLine(orderId, shop, pkg, "Peas", { storage: "frozen", gathered: 0 });
    const roundId = await makeRound(driverId, "delivery");
    const dropId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).id;
    await attach(dropId, pkg, 0);

    const p = (await deliveryDrop(dropId, driverId)).packages[0]!;
    expect(p.items).toHaveLength(1);
    expect(p.items[0]!.included).toBe(false);
    expect(p.summary).toEqual({ frozen: 0, chilled: 0, normal: 0, notRecorded: 0 });
  });

  // ── US4 — fixed at purchase ─────────────────────────────────────────────────────────────────────

  /**
   * ⚠ FR-009 / SC-006. The product is CHILLED when sold and AMBIENT by the time the driver reads it.
   * A query that joined the live attribute would say Normal — about goods already in the bag.
   */
  it("⚠ a later product edit does not change what the driver is told", async () => {
    const driverId = await makeDriver("s");
    const shop = await makeShop("SA");
    const orderId = await makeOrder("EFY-SNAP01");
    const pkg = await makePackage(orderId, shop, "same_day");
    const productId = await addLine(orderId, shop, pkg, "Yoghurt", { storage: "chilled" });
    await setLiveStorage(productId, "ambient");

    const roundId = await makeRound(driverId, "delivery");
    const dropId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).id;
    await attach(dropId, pkg, 0);

    const line = (await deliveryDrop(dropId, driverId)).packages[0]!.items[0]!;
    expect(line.temperatureClass).toBe("chilled");
  });

  /** ⚠ FR-010 / SC-008 — and the live product IS frozen, to prove nothing is read from it. */
  it("⚠ a line sold before 065 is not_recorded, never normal and never guessed from the product", async () => {
    const driverId = await makeDriver("s");
    const shop = await makeShop("SA");
    const orderId = await makeOrder("EFY-OLD01");
    const pkg = await makePackage(orderId, shop, "same_day");
    const productId = await addLine(orderId, shop, pkg, "Old stock", { storage: null });
    await setLiveStorage(productId, "frozen");

    const roundId = await makeRound(driverId, "delivery");
    const dropId = (await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).id;
    await attach(dropId, pkg, 0);

    const p = (await deliveryDrop(dropId, driverId)).packages[0]!;
    expect(p.items[0]!.temperatureClass).toBe("not_recorded");
    expect(p.summary).toEqual({ frozen: 0, chilled: 0, normal: 0, notRecorded: 1 });
  });
});
