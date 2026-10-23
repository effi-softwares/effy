import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";
import { recordHandovers } from "./handovers";
import { accountFor, countByPackage, createFirstParcels, expectedParcels, liveParcels, ParcelsUnaccounted, writeParcelHolds } from "./parcels";
import { recordReads } from "./reads";
import { resolveCode } from "./resolve";

/** Bags against real Postgres: bag 1 carries the package code, step expectations, holds, the hand-over writer and the read record. */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let roundId: string;
let n = 0;

async function pkg(): Promise<{ id: string; code: string; orderId: string; orderNumber: string }> {
  n += 1;
  const cust = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@effyshopping.com')::citext) RETURNING id`,
    [`sub-c-${n}-${crypto.randomUUID()}`],
  )).rows[0]!.id;
  const orderNumber = `EFY-T${String(n).padStart(5, "0")}`;
  const order = (await pool.query<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
     VALUES ($1, $2, 10, 15, '{"city":"Richmond","postalCode":"3121"}'::jsonb, 'paid', 'effy', 'in_coverage') RETURNING id`,
    [cust, orderNumber],
  )).rows[0]!.id;
  const shop = (await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id`, [`S${n}${crypto.randomUUID().slice(0, 4)}`],
  )).rows[0]!.id;
  const sf = (await pool.query<{ id: string; package_code: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, 'ready_for_pickup', 'same_day') RETURNING id, package_code`, [order, shop],
  )).rows[0]!;
  await createFirstParcels(pool, { orderId: order });
  return { id: sf.id, code: sf.package_code, orderId: order, orderNumber };
}

async function addBag(packageId: string, seq: number, zone = "ambient"): Promise<{ id: string; code: string }> {
  return (await pool.query<{ id: string; code: string }>(
    `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone, declared)
     VALUES ($1, public.new_parcel_code(), $2, $3, true) RETURNING id, parcel_code AS code`,
    [packageId, seq, zone],
  )).rows[0]!;
}

d("096 — bags (shared)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE public.label_read, public.label_print, public.package_handover, public.package_hold,
                      public.package_parcel, public.round_package, public.round_stop, public.driver_round, public.dispatch_wave,
                      public.shop_fulfillment, public.order_item, public."order", public.shop_staff, public.shop, public.customer, public.driver CASCADE`);
    driverId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, 'Ada', ($1 || '@effyshopping.com')::citext) RETURNING id`,
      [`sub-ada-${crypto.randomUUID()}`],
    )).rows[0]!.id;
    const wave = (await pool.query<{ id: string }>(
      `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
    )).rows[0]!.id;
    roundId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, status)
       VALUES ($1, $2, 'delivery', now() + interval '4 hours', 'in_progress') RETURNING id`,
      [wave, driverId],
    )).rows[0]!.id;
  });

  it("every new package has bag 1, carrying the package's own code (R1); creating it twice adds nothing", async () => {
    const p = await pkg();
    const bags = await liveParcels(pool, [p.id]);
    expect(bags).toEqual([expect.objectContaining({ code: p.code, seq: 1, of: 1, packageId: p.id })]);
    expect(await createFirstParcels(pool, { packageIds: [p.id] })).toBe(0);
  });

  it("bag 1 can never be voided", async () => {
    const p = await pkg();
    await expect(pool.query(`UPDATE public.package_parcel SET voided_at = now() WHERE shop_fulfillment_id = $1`, [p.id]))
      .rejects.toThrow(/package_parcel_first_never_voided/);
  });

  it("one code space: a parcel code never repeats a package code", async () => {
    const p = await pkg();
    await expect(pool.query(
      `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone) VALUES ($1, $2, 2, 'ambient')`, [p.id, p.code],
    )).rejects.toThrow(/package_parcel_code_uq/);
  });

  it("resolves a label, a bare typed code, an order number, and nothing", async () => {
    const p = await pkg();
    const bag2 = await addBag(p.id, 2);
    expect(await resolveCode(pool, `EFY1:${bag2.code}`)).toMatchObject({ kind: "parcel", parcelId: bag2.id, seq: 2, packageId: p.id, voided: false });
    expect(await resolveCode(pool, `${p.code.slice(0, 3).toLowerCase()} ${p.code.slice(3).toLowerCase()}`)).toMatchObject({ kind: "parcel", seq: 1 });
    expect(await resolveCode(pool, p.orderNumber.toLowerCase())).toMatchObject({ kind: "order", orderId: p.orderId });
    expect(await resolveCode(pool, "EFY1:22222X")).toBeNull();
    expect(await resolveCode(pool, "9300633603345")).toBeNull();
  });

  it("a step expects every live, unheld bag not yet handed over on this round", async () => {
    const p = await pkg();
    const bag2 = await addBag(p.id, 2);
    const bag3 = await addBag(p.id, 3);
    await pool.query(`UPDATE public.package_parcel SET voided_at = now() WHERE id = $1`, [bag3.id]);
    let expected = await expectedParcels(pool, { step: "load", packageIds: [p.id], roundId });
    expect(expected.map((b) => [b.seq, b.of])).toEqual([[1, 2], [2, 2]]);

    await recordHandovers(pool, {
      step: "load", actor: { kind: "driver", driverId }, roundId, changeId: crypto.randomUUID(),
      parcels: [{ parcelCode: bag2.code, method: "scan" }], allowed: new Map(expected.map((b) => [b.parcelId, b.packageId])),
    });
    expected = await expectedParcels(pool, { step: "load", packageIds: [p.id], roundId });
    expect(expected.map((b) => b.seq)).toEqual([1]);
    // Another round expects it afresh (a re-delivery).
    expect((await expectedParcels(pool, { step: "load", packageIds: [p.id], roundId: crypto.randomUUID() })).map((b) => b.seq)).toEqual([1, 2]);
  });

  it("refuses a request that leaves a bag unaccounted for, naming it", async () => {
    const p = await pkg();
    await addBag(p.id, 2);
    const expected = await expectedParcels(pool, { step: "collect", packageIds: [p.id], roundId });
    expect(() => accountFor("collect", expected, [{ parcelCode: p.code, method: "scan" }], [])).toThrow(ParcelsUnaccounted);
    try {
      accountFor("collect", expected, [{ parcelCode: p.code, method: "scan" }], []);
    } catch (e) {
      expect((e as ParcelsUnaccounted).body()).toMatchObject({ type: "parcels_unaccounted", parcels: [{ seq: 2, of: 2 }] });
    }
    // A reason not sayable at this step, or "other" with no note, does not account for a bag.
    expect(() => accountFor("collect", expected, [{ parcelCode: p.code, method: "scan" }], [{ parcelId: expected[1]!.parcelId, reason: "not_in_van" }])).toThrow(ParcelsUnaccounted);
    expect(() => accountFor("collect", expected, [{ parcelCode: p.code, method: "scan" }], [{ parcelId: expected[1]!.parcelId, reason: "other" }])).toThrow(ParcelsUnaccounted);
    const ok = accountFor("collect", expected, [{ parcelCode: p.code, method: "scan" }], [{ parcelId: expected[1]!.parcelId, reason: "not_at_shop" }]);
    expect(ok.handed).toHaveLength(1);
    expect(ok.missing).toHaveLength(1);
  });

  it("one bag missing holds that bag and the package carries on; every bag missing holds the package", async () => {
    const a = await pkg();
    await addBag(a.id, 2);
    const b = await pkg();
    const expected = await expectedParcels(pool, { step: "load", packageIds: [a.id, b.id], roundId });
    const aBag2 = expected.find((x) => x.packageId === a.id && x.seq === 2)!;
    const bBag1 = expected.find((x) => x.packageId === b.id)!;
    const acc = accountFor("load", expected, expected.filter((x) => x !== aBag2 && x !== bBag1).map((x) => ({ parcelId: x.parcelId, method: "scan" as const })),
      [{ parcelId: aBag2.parcelId, reason: "damaged" }, { parcelId: bBag1.parcelId, reason: "not_at_hub" }]);
    const changeId = crypto.randomUUID();
    const held = await writeParcelHolds(pool, { step: "load", driverId, roundId, changeId, missing: acc.missing, expectedCount: countByPackage(expected) });
    expect(held.packagesHeld).toEqual([b.id]);
    const holds = (await pool.query(`SELECT shop_fulfillment_id, parcel_id FROM public.package_hold ORDER BY parcel_id NULLS LAST`)).rows;
    expect(holds).toEqual([{ shop_fulfillment_id: a.id, parcel_id: aBag2.parcelId }, { shop_fulfillment_id: b.id, parcel_id: null }]);
    // A held bag is not expected again; resolved found, it is.
    expect((await expectedParcels(pool, { step: "deliver", packageIds: [a.id], roundId })).map((x) => x.seq)).toEqual([1]);
    await pool.query(`UPDATE public.package_hold SET resolution = 'found', resolved_at = now(), resolved_by_sub = 'x' WHERE parcel_id = $1`, [aBag2.parcelId]);
    expect((await expectedParcels(pool, { step: "deliver", packageIds: [a.id], roundId })).map((x) => x.seq)).toEqual([1, 2]);
    await writeParcelHolds(pool, { step: "load", driverId, roundId, changeId, missing: acc.missing, expectedCount: countByPackage(expected) });
    expect(Number((await pool.query(`SELECT count(*) FROM public.package_hold`)).rows[0].count)).toBe(2);
  });

  it("records a hand-over per bag, by any actor, once per changeId; a foreign bag invents nothing", async () => {
    const p = await pkg();
    const other = await pkg();
    const bags = await liveParcels(pool, [p.id]);
    const allowed = new Map(bags.map((b) => [b.parcelId, b.packageId]));
    const changeId = crypto.randomUUID();
    const staff = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_staff (shop_id, cognito_sub, name, email)
       SELECT shop_id, $2, 'Sam', $2 || '@effyshopping.com' FROM public.shop_fulfillment WHERE id = $1 RETURNING id`,
      [p.id, `sub-sam-${crypto.randomUUID()}`],
    )).rows[0]!.id;
    const n1 = await recordHandovers(pool, {
      step: "checkin", actor: { kind: "admin_staff", sub: "sub-hub" }, roundId, changeId, deviceAt: "2026-10-21T08:00:00Z",
      parcels: [{ parcelCode: p.code, method: "scan" }, { parcelCode: other.code, method: "scan" }], allowed,
    });
    expect(n1).toBe(1);
    expect(await recordHandovers(pool, { step: "checkin", actor: { kind: "admin_staff", sub: "sub-hub" }, roundId, changeId, parcels: [{ parcelCode: p.code, method: "scan" }], allowed })).toBe(0);
    const row = (await pool.query(`SELECT actor_kind, admin_sub, driver_id, step, device_at FROM public.package_handover`)).rows[0];
    expect(row).toMatchObject({ actor_kind: "admin_staff", admin_sub: "sub-hub", driver_id: null, step: "checkin" });
    expect(new Date(row.device_at).toISOString()).toBe("2026-10-21T08:00:00.000Z");
    expect(await recordHandovers(pool, { step: "pack", actor: { kind: "shop_staff", staffId: staff }, changeId: crypto.randomUUID(), parcels: [{ parcelId: bags[0]!.parcelId, method: "typed" }], allowed })).toBe(1);
  });

  it("records every read once, with the server's own outcome", async () => {
    const p = await pkg();
    const bag2 = await addBag(p.id, 2);
    await pool.query(`UPDATE public.package_parcel SET voided_at = now() WHERE id = $1`, [bag2.id]);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const reads = [
      { clientReadId: ids[0], raw: `EFY1:${p.code}`, method: "scan" as const, outcome: "accepted" as const, deviceAt: "2026-10-21T08:00:00Z", deviceId: "dev-1" },
      // Voided while offline: the client said accepted, the server says voided.
      { clientReadId: ids[1], raw: `EFY1:${bag2.code}`, method: "scan" as const, outcome: "accepted" as const, deviceAt: "2026-10-21T08:00:01Z" },
      { clientReadId: ids[2], raw: "EFY1:22222X", method: "scan" as const, outcome: "not_on_this_work" as const, deviceAt: "2026-10-21T08:00:02Z" },
      { clientReadId: ids[3], raw: "9300633603345", method: "scan" as const, outcome: "not_a_label" as const, deviceAt: "2026-10-21T08:00:03Z" },
      { clientReadId: ids[4], raw: p.orderNumber, method: "typed" as const, outcome: "accepted" as const, deviceAt: "2026-10-21T08:00:04Z" },
    ];
    const out = await recordReads(pool, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "load", roundId, reads });
    expect(out.map((r) => r.serverOutcome)).toEqual(["accepted", "voided", "not_found", "not_a_label", "not_a_label"]);
    await recordReads(pool, { actor: { kind: "driver", driverId }, surface: "driver_app", step: "load", roundId, reads });
    const rows = (await pool.query(`SELECT client_outcome, server_outcome FROM public.label_read ORDER BY device_at`)).rows;
    expect(rows).toHaveLength(5);
    expect(rows[1]).toEqual({ client_outcome: "accepted", server_outcome: "voided" });
    // A lookup by order number is accepted.
    const look = await recordReads(pool, { actor: { kind: "admin_staff", sub: "s" }, surface: "back_office", step: "lookup",
      reads: [{ clientReadId: crypto.randomUUID(), raw: p.orderNumber, method: "typed", outcome: "accepted", deviceAt: "2026-10-21T09:00:00Z" }] });
    expect(look[0]!.serverOutcome).toBe("accepted");
  });
});
