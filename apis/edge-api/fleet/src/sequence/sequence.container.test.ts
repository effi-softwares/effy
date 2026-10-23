import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Held packages (found / lost), overdue steps, the waiver and the vehicle check, against real Postgres. */

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

import { migrationSql } from "@effy/edge-shared/testing";

import { loadCandidates } from "../planner/repository";
import { clearVehicleCheck, heldPackages, overdueCrossedSince, overdueRuns, resolveHold, vehicleChecksToday, waiveSequence } from "./service";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let shopId: string;

const one = async <T,>(sql: string, params: unknown[] = []) => (await pool.query(sql, params as never[])).rows[0] as T;

async function aPackage(n: string): Promise<string> {
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const order = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
     VALUES ($1, $2, 10, 12, '{"city":"Fitzroy","postalCode":"3065"}'::jsonb, 'paid', 'effy', 'in_coverage') RETURNING id`, [cust.id, `EFY-SQ${n}`],
  );
  return (await one<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`, [order.id, shopId],
  )).id;
}

async function aRound(kind: "collection" | "delivery", deadline = "now() + interval '6 hours'"): Promise<string> {
  const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ($1, now(), 'schedule') RETURNING id`, [kind]);
  return (await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, created_at) VALUES ($1, $2, $3, ${deadline}, now() - interval '1 hour') RETURNING id`,
    [wave.id, driverId, kind],
  )).id;
}

d("093 — dispatch and the order of work", () => {
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
    await pool.query(`TRUNCATE public.vehicle_check, public.package_hold, public.round_sequence_waiver, public.hub_checkin,
                               public.round_package, public.round_stop, public.driver_round, public.dispatch_wave,
                               public.shop_fulfillment, public."order", public.customer, public.vehicle_holding, public.vehicle,
                               public.driver_duty_session, public.driver, public.shop, public.delivery_settings CASCADE`);
    await pool.query("DELETE FROM admin.audit_log");
    driverId = (await one<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('sub-sq', 'Seq Driver', 'seq.fleet@effyshopping.com') RETURNING id`,
    )).id;
    shopId = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('SQF', 'Seq Shop') RETURNING id`)).id;
  });

  it("lists an open hold; found sends it back to planning, lost keeps it out, each audited once", async () => {
    const roundId = await aRound("delivery");
    const a = await aPackage("1");
    const b = await aPackage("2");
    for (const [sf, reason] of [[a, "damaged"], [b, "not_at_hub"]] as const) {
      await pool.query(
        `INSERT INTO public.package_hold (shop_fulfillment_id, step, reason, driver_id, round_id, change_id) VALUES ($1, 'load', $2, $3, $4, gen_random_uuid())`,
        [sf, reason, driverId, roundId],
      );
    }
    const held = await heldPackages();
    expect(held.map((h) => [h.orderNumber, h.reason, h.driverName, h.step])).toEqual([
      ["EFY-SQ1", "damaged", "Seq Driver", "load"],
      ["EFY-SQ2", "not_at_hub", "Seq Driver", "load"],
    ]);

    await expect(resolveHold(held[0]!.holdId, "found", "staff-1")).resolves.toMatchObject({ message: expect.stringMatching(/next run/) });
    await expect(resolveHold(held[1]!.holdId, "lost", "staff-1")).resolves.toMatchObject({ message: expect.stringMatching(/lost/) });
    await expect(resolveHold(held[1]!.holdId, "found", "staff-1")).resolves.toEqual({ message: "Already decided." });
    expect(await heldPackages()).toEqual([]);
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM admin.audit_log WHERE action = 'dispatch.hold_resolved'`)).n).toBe(2);
  });

  it("a delivery run open and unloaded past the threshold is overdue; once loaded it is not", async () => {
    const roundId = await aRound("delivery");
    const sf = await aPackage("3");
    const drop = await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) SELECT $1, 'customer_drop', order_id FROM public.shop_fulfillment WHERE id = $2 RETURNING id`,
      [roundId, sf],
    );
    await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop.id, sf]);

    // Planned an hour ago with no window: open since then, past the 20-minute default.
    const overdue = await overdueRuns();
    expect(overdue).toEqual([expect.objectContaining({ roundId, kind: "delivery", stage: "to_load", stageLabel: "To load" })]);
    expect(overdue[0]!.minutes).toBeGreaterThanOrEqual(59);
    // It crossed 40 minutes ago — inside an hour's window, outside a five-minute one.
    expect(await overdueCrossedSince(pool, new Date(Date.now() - 60 * 60_000))).toBe(1);
    expect(await overdueCrossedSince(pool, new Date(Date.now() - 5 * 60_000))).toBe(0);

    await pool.query(`UPDATE public.round_stop SET status = 'out_for_delivery' WHERE id = $1`, [drop.id]);
    expect(await overdueRuns()).toEqual([]);
  });

  it("a collection run with every shop settled and no check-in is overdue after its threshold", async () => {
    const roundId = await aRound("collection", "now() + interval '1 hour'");
    await pool.query(
      `INSERT INTO public.round_stop (round_id, kind, shop_id, status, completed_at) VALUES ($1, 'shop_pickup', $2, 'done', now() - interval '45 minutes')`,
      [roundId, shopId],
    );
    expect((await overdueRuns()).map((o) => [o.roundId, o.stage])).toEqual([[roundId, "to_hub"]]);
    await pool.query(`INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived) VALUES ($1, $2, 0, 0)`, [roundId, driverId]);
    expect(await overdueRuns()).toEqual([]);
  });

  it("a waiver is recorded once with its reason and audited; a finished run cannot be waived", async () => {
    const roundId = await aRound("delivery");
    await expect(waiveSequence(roundId, "phone died at the hub", "staff-1")).resolves.toMatchObject({ driverId });
    await waiveSequence(roundId, "again", "staff-1");
    expect((await one<{ reason: string }>(`SELECT reason FROM public.round_sequence_waiver WHERE round_id = $1`, [roundId])).reason)
      .toBe("phone died at the hub");
    await pool.query(`UPDATE public.driver_round SET status = 'completed' WHERE id = $1`, [roundId]);
    await expect(waiveSequence(roundId, "late", "staff-1")).rejects.toMatchObject({ code: "finished" });
  });

  it("the vehicle check: off by default; on, unchecked is due, unsafe blocks, cleared is fine", async () => {
    const vehicle = await one<{ id: string }>(
      `INSERT INTO public.vehicle (registration_plate, make, model, body_type) VALUES ('SEQ123', 'Toyota', 'HiAce', 'van') RETURNING id`,
    );
    await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [vehicle.id, driverId]);
    const state = async () => (await loadCandidates(pool)).find((c) => c.driverId === driverId)?.vehicleCheck;

    expect(await state(), "no settings row: the check is off").toBeUndefined();

    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by, vehicle_check_required) VALUES (1, -37.8, 144.9, 'test', true)`,
    );
    expect(await state()).toBe("due");

    const check = await one<{ id: string }>(
      `INSERT INTO public.vehicle_check (driver_id, vehicle_id, local_date, answers, unsafe, minor, change_id)
       VALUES ($1, $2, (now() AT TIME ZONE 'Australia/Melbourne')::date,
               '[{"item":"brakes","answer":"unsafe","note":"spongy"}]'::jsonb, true, false, gen_random_uuid()) RETURNING id`,
      [driverId, vehicle.id],
    );
    expect(await state()).toBe("unsafe");
    expect((await vehicleChecksToday()).map((c) => [c.vehicleLabel, c.unsafe, c.answers[0]!.note])).toEqual([["Toyota HiAce · SEQ123", true, "spongy"]]);

    await expect(clearVehicleCheck(check.id, "brakes bled", "staff-1")).resolves.toMatchObject({ driverId });
    expect(await state()).toBeUndefined();
    await expect(clearVehicleCheck(check.id, "again", "staff-1")).resolves.toMatchObject({ message: "Already cleared." });
  });
});
