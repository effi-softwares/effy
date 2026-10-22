import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});

import { migrationSql } from "@effy/edge-shared";
import { createFirstParcels } from "@effy/edge-shared/labels";

import { checkIn, expected } from "./service";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

const one = async <T,>(sql: string, params: unknown[] = []) => (await pool.query(sql, params as never[])).rows[0] as T;
const read = (raw: string, method: "scan" | "typed" = "scan") => ({ clientReadId: crypto.randomUUID(), raw, method, deviceAt: new Date().toISOString() });

/** A collection run that picked up one package of two bags, plus a voided third. */
async function aRun() {
  const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('H' || substr(gen_random_uuid()::text, 1, 5), 'Hub Shop') RETURNING id`);
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`);
  const order = await one<{ id: string; order_number: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
     VALUES ($1, 'EFY-' || upper(substr(md5(random()::text), 1, 6)), 10, 12, '{"city":"Fitzroy","postalCode":"3065"}'::jsonb, 'paid')
     RETURNING id, order_number`, [cust.id]);
  const pkg = await one<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`, [order.id, shop.id]);
  await createFirstParcels(pool, { packageIds: [pkg.id] });
  const bag2 = await one<{ parcel_code: string }>(
    `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone, declared)
     VALUES ($1, public.new_parcel_code(), 2, 'ambient', true) RETURNING parcel_code`, [pkg.id]);
  const voided = await one<{ parcel_code: string }>(
    `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone, declared, voided_at)
     VALUES ($1, public.new_parcel_code(), 3, 'ambient', true, now()) RETURNING parcel_code`, [pkg.id]);
  const bag1 = await one<{ parcel_code: string }>(`SELECT parcel_code FROM public.package_parcel WHERE shop_fulfillment_id = $1 AND seq = 1`, [pkg.id]);
  const driver = await one<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('d-' || gen_random_uuid(), 'Ada', (gen_random_uuid() || '@effyshopping.com')) RETURNING id`);
  const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
  const run = await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, created_at) VALUES ($1, $2, 'collection', now() + interval '6 hours', now() - interval '1 hour') RETURNING id`,
    [wave.id, driver.id]);
  const stop = await one<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, shop_id, status, completed_at) VALUES ($1, 'shop_pickup', $2, 'done', now()) RETURNING id`, [run.id, shop.id]);
  await pool.query(`INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin')`, [run.id]);
  await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state, settled_at) VALUES ($1, $2, 'picked_up', now())`, [stop.id, pkg.id]);
  return { run: run.id, pkg: pkg.id, order: order.order_number, bag1: bag1.parcel_code, bag2: bag2.parcel_code, voided: voided.parcel_code, driver: driver.id };
}

d("096 US5 — the hub station", () => {
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
    await pool.query(`TRUNCATE public.label_read, public.package_handover, public.hub_checkin, public.round_package, public.round_stop,
                               public.driver_round, public.dispatch_wave, public.package_parcel, public.shop_fulfillment,
                               public."order", public.customer, public.driver, public.shop CASCADE`);
  });

  it("lists a run's bags with where each goes; checks bags in one by one; the last one closes the run", async () => {
    const r = await aRun();
    const before = await expected();
    expect(before.runs).toHaveLength(1);
    expect(before.runs[0]!.driverName).toBe("Ada");
    expect(before.runs[0]!.bags.map((b) => [b.seq, b.of, b.checkedIn])).toEqual([[1, 2, false], [2, 2, false]]);
    expect(before.runs[0]!.bags[0]!.sort.kind).toBe("load_now");

    const first = await checkIn("hub-1", [read(`EFY1:${r.bag1}`)]);
    expect(first.results[0]).toMatchObject({ outcome: "accepted", words: "Bag 1 of 2", orderNumber: r.order, runClosed: false });
    expect(first.results[0]!.sort?.label).toMatch(/^LOAD NOW/);
    expect(first.drivers).toEqual([r.driver]);
    // A second scan of the same bag is already counted, and checks nothing in twice.
    expect((await checkIn("hub-1", [read(`EFY1:${r.bag1}`)])).results[0]).toMatchObject({ outcome: "already_counted", words: "Already scanned" });

    // The last bag, typed: the run closes, recorded as hub staff's, with the run's own driver.
    const last = await checkIn("hub-1", [read(r.bag2.toLowerCase(), "typed")]);
    expect(last.results[0]).toMatchObject({ outcome: "accepted", runClosed: true });
    const hc = await one<{ closed_by: string; closed_by_sub: string; driver_id: string }>(`SELECT closed_by, closed_by_sub, driver_id FROM public.hub_checkin WHERE round_id = $1`, [r.run]);
    expect(hc).toEqual({ closed_by: "admin_staff", closed_by_sub: "hub-1", driver_id: r.driver });
    expect((await one<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [r.run])).status).toBe("completed");
    expect((await expected()).runs).toHaveLength(0);

    const handovers = await pool.query(`SELECT actor_kind, admin_sub, step, handover_method FROM public.package_handover ORDER BY recorded_at`);
    expect(handovers.rows).toEqual([
      { actor_kind: "admin_staff", admin_sub: "hub-1", step: "checkin", handover_method: "scan" },
      { actor_kind: "admin_staff", admin_sub: "hub-1", step: "checkin", handover_method: "typed" },
    ]);
    // After the run closed, a scan of its bag is already counted.
    expect((await checkIn("hub-1", [read(`EFY1:${r.bag2}`)])).results[0]!.outcome).toBe("already_counted");
  });

  it("refuses, in the scan rule's words, everything that is not a bag on its way in — and records every read", async () => {
    const r = await aRun();
    const out = await checkIn("hub-1", [
      read("hello world"),
      read("EFY1:22222X"),
      read(`EFY1:${r.voided}`),
    ]);
    expect(out.results.map((x) => [x.outcome, x.words])).toEqual([
      ["not_a_label", "Not an Effy label"],
      ["not_found", "No bag has this code"],
      ["voided", "This label is no longer used"],
    ]);
    // A bag of a package nobody has collected yet is not expected at the hub.
    await pool.query(`UPDATE public.round_package SET state = 'assigned' WHERE shop_fulfillment_id = $1`, [r.pkg]);
    expect((await checkIn("hub-1", [read(`EFY1:${r.bag1}`)])).results[0]!.outcome).toBe("not_on_this_work");

    const reads = await pool.query(`SELECT surface, step, actor_kind, server_outcome FROM public.label_read`);
    expect(reads.rows).toHaveLength(4);
    expect(reads.rows.every((x) => x.surface === "back_office" && x.step === "checkin" && x.actor_kind === "admin_staff")).toBe(true);
    expect(await pool.query(`SELECT 1 FROM public.package_handover`).then((x) => x.rowCount)).toBe(0);
  });

  it("the driver's check-in after hub staff began only owes the bags still out", async () => {
    const r = await aRun();
    await checkIn("hub-1", [read(`EFY1:${r.bag1}`)]);
    const { bagsToCheckIn } = await import("@effy/edge-shared/delivery");
    expect((await bagsToCheckIn(pool, r.run)).map((b) => b.code)).toEqual([r.bag2]);
  });
});
