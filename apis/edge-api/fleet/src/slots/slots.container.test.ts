import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 069 US5/US6 — delivery slots and the standard-delivery calendar, against the REAL migrations.
 *
 * ⚠ WHAT CANNOT BE A UNIT TEST HERE: that "booked today" agrees with what checkout counts (it is a
 * view both read), that editing a slot leaves every placed order's window alone (they are different
 * rows), and that a second slot with the same window is refused by the database rather than by a
 * check-then-insert race.
 */

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

import { migrationSql, type RequestScope } from "@effy/edge-shared";

import {
  addNonDeliveryDate,
  getDeliveryDays,
  putDeliveryDays,
  removeNonDeliveryDate,
} from "../deliverydays/service";
import type { FleetError } from "../shared/errors";
import { effyDays } from "@effy/edge-shared/delivery";
import { createSlot, listSlots, listSlotsWithDays, updateSlot } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const scope = { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as RequestScope;
const ACTOR = "staff-sub-1";
const EVENING = { startTime: "17:00", endTime: "19:00", cutoffTime: "15:00", capacity: 2 };

let container: StartedPostgreSqlContainer;
let pool: Pool;

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params as never[])).rows[0]!;

async function refusal(p: Promise<unknown>): Promise<FleetError> {
  return (await p.then(
    () => {
      throw new Error("expected a refusal");
    },
    (e: unknown) => e,
  )) as FleetError;
}

async function audits(action: string) {
  return (await pool.query<{ actor_sub: string; target_type: string; target_id: string | null; detail: Record<string, unknown> }>(
    `SELECT actor_sub, target_type, target_id::text, detail FROM admin.audit_log WHERE action = $1 ORDER BY created_at`,
    [action],
  )).rows;
}

/** A paid order with one package, booked into `slotId` today (or promised `day` as standard). */
async function order(opts: { slotId?: string; state?: string; heldFor?: string; standardDay?: string; status?: string; windowDay?: string }) {
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const o = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
     VALUES ($1, 'EFY-' || substr(md5(random()::text), 1, 6), 10, 12, '{}'::jsonb, 'paid') RETURNING id`,
    [cust.id],
  );
  const shop = await one<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ('S' || substr(md5(random()::text), 1, 6), 'Shop') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status) VALUES ($1, $2, 1, 10, $3)`,
    [o.id, shop.id, opts.status ?? "pending"],
  );
  if (opts.slotId) {
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method, promised_from, promised_to, slot_id, window_start, window_end)
       VALUES ($1, $2, CASE WHEN $4::date IS NULL THEN 'same_day' ELSE 'standard' END,
               COALESCE($4::date, (now() AT TIME ZONE 'Australia/Melbourne')::date), COALESCE($4::date, (now() AT TIME ZONE 'Australia/Melbourne')::date),
               $3, '2026-10-08T06:00:00Z', '2026-10-08T08:00:00Z')`,
      [o.id, shop.id, opts.slotId, opts.windowDay ?? null],
    );
    await pool.query(
      `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, held_until, window_start, window_end)
       VALUES ($1, COALESCE($5::date, (now() AT TIME ZONE 'Australia/Melbourne')::date), $2, $3,
               CASE WHEN $3 = 'held' THEN now() + $4::interval END, '2026-10-08T06:00:00Z', '2026-10-08T08:00:00Z')`,
      [opts.slotId, o.id, opts.state ?? "confirmed", opts.heldFor ?? "10 minutes", opts.windowDay ?? null],
    );
  } else if (opts.standardDay) {
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method, promised_from, promised_to)
       VALUES ($1, $2, 'standard', $3::date, $3::date)`,
      [o.id, shop.id, opts.standardDay],
    );
  }
  return o.id;
}

beforeAll(async () => {
  if (!RUN) return;
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
  if (!RUN) return;
  await pool.query(`TRUNCATE public."order", public.delivery_slot, public.delivery_non_delivery_date CASCADE`);
  await pool.query(`DELETE FROM public.delivery_settings`);
  await pool.query(`DELETE FROM admin.audit_log`);
});

d("069 — same-day delivery slots", () => {
  it("creates a slot, lists it, and records who created it", async () => {
    const slot = await createSlot(EVENING, ACTOR, scope);
    expect(slot).toMatchObject({ ...EVENING, status: "active", bookedToday: 0, overCapacityToday: 0 });

    expect(await listSlots()).toHaveLength(1);
    const audit = await audits("delivery_slot.created");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_sub: ACTOR, target_type: "delivery_slot", target_id: slot.id });
    expect(audit[0]!.detail).toMatchObject(EVENING);
  });

  it("⚠ a slot created with no capacity has NO limit, and a limit can be set and removed again", async () => {
    const { capacity: _none, ...window } = EVENING;
    const slot = await createSlot(window, ACTOR, scope);
    expect(slot.capacity).toBeNull();
    expect((await audits("delivery_slot.created"))[0]!.detail).toMatchObject({ capacity: null });

    expect((await updateSlot(slot.id, { capacity: 4 }, ACTOR, scope)).capacity).toBe(4);
    // An absent key keeps the limit; null removes it.
    expect((await updateSlot(slot.id, { cutoffTime: "14:00" }, ACTOR, scope)).capacity).toBe(4);
    expect((await updateSlot(slot.id, { capacity: null }, ACTOR, scope)).capacity).toBeNull();

    const changes = (await audits("delivery_slot.updated")).map((a) => (a.detail as { changed: { capacity?: unknown } }).changed.capacity);
    expect(changes).toContainEqual({ from: null, to: 4 });
    expect(changes).toContainEqual({ from: 4, to: null });
  });

  it("lists earliest first", async () => {
    await createSlot({ startTime: "19:00", endTime: "21:00", cutoffTime: "17:00", capacity: 2 }, ACTOR, scope);
    await createSlot(EVENING, ACTOR, scope);
    expect((await listSlots()).map((s) => s.startTime)).toEqual(["17:00", "19:00"]);
  });

  it("refuses a second slot with the same window, naming the field", async () => {
    await createSlot(EVENING, ACTOR, scope);
    const err = await refusal(createSlot({ ...EVENING, capacity: 9 }, ACTOR, scope));
    expect(err.kind).toBe("conflict");
    expect(err.fields?.[0]?.field).toBe("startTime");
    expect(await listSlots()).toHaveLength(1);
  });

  it("⚠ 'booked today' counts confirmed bookings and LIVE holds — and nothing else", async () => {
    const slot = await createSlot({ ...EVENING, capacity: 9 }, ACTOR, scope);
    await order({ slotId: slot.id, state: "confirmed" });
    await order({ slotId: slot.id, state: "held" });
    await order({ slotId: slot.id, state: "held", heldFor: "-1 minute" }); // lapsed
    await order({ slotId: slot.id, state: "released" });

    expect((await listSlots())[0]!.bookedToday).toBe(2);
  });

  it("078 — how full each window is on today and each Effy delivery day after it (P15)", async () => {
    const days = effyDays(new Date(), 3).map((x) => x.date);
    const evening = await createSlot(EVENING, ACTOR, scope);
    const late = await createSlot({ startTime: "19:00", endTime: "21:00", cutoffTime: "17:00" }, ACTOR, scope);
    await order({ slotId: evening.id });                                        // today, confirmed
    await order({ slotId: evening.id, windowDay: days[2] });                    // a later day, confirmed
    await order({ slotId: evening.id, windowDay: days[2], state: "held" });     // …and a live hold
    await order({ slotId: evening.id, windowDay: days[2], state: "held", heldFor: "-1 minute" }); // lapsed
    const over = await order({ slotId: evening.id, windowDay: days[3] });
    await pool.query(`UPDATE public.delivery_slot_booking SET over_capacity = true WHERE order_id = $1`, [over]);

    const grid = await listSlotsWithDays();
    expect(grid.days).toEqual(days.map((date, i) => ({ date, isToday: i === 0, nonDelivery: false })));
    expect(grid.items.map((s) => s.id)).toEqual([evening.id, late.id]);
    expect(grid.items[0]!.load).toEqual([
      { date: days[0], booked: 1, overCapacity: 0 }, { date: days[1], booked: 0, overCapacity: 0 },
      { date: days[2], booked: 2, overCapacity: 0 }, { date: days[3], booked: 1, overCapacity: 1 },
    ]);
    expect(grid.items[0]).toMatchObject({ bookedToday: 1, overCapacityToday: 0 });
    // A window nobody has booked still has a cell for every day.
    expect(grid.items[1]!.load).toEqual(days.map((date) => ({ date, booked: 0, overCapacity: 0 })));
  });

  it("078 — the grid's days are the customer's days: a closed date is skipped, the look-ahead is the setting", async () => {
    await pool.query(`INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, effy_lookahead_days, updated_by) VALUES (1, -37.8, 144.9, 2, 'seed')`);
    const plain = effyDays(new Date(), 3).map((x) => x.date);
    await pool.query(`INSERT INTO public.delivery_non_delivery_date (day, created_by) VALUES ($1::date, 'seed')`, [plain[1]]);
    await createSlot(EVENING, ACTOR, scope);
    const grid = await listSlotsWithDays();
    expect(grid.days!.map((x) => x.date)).toEqual([plain[0], plain[2], plain[3]]);
    expect(grid.items[0]!.load!.map((l) => l.date)).toEqual([plain[0], plain[2], plain[3]]);
  });

  it("shows how many late payers were honoured above capacity", async () => {
    const slot = await createSlot(EVENING, ACTOR, scope);
    const late = await order({ slotId: slot.id });
    await pool.query(`UPDATE public.delivery_slot_booking SET over_capacity = true WHERE order_id = $1`, [late]);
    expect((await listSlots())[0]).toMatchObject({ bookedToday: 1, overCapacityToday: 1 });
  });

  it("⚠ changing or switching off a slot changes no placed order (SC-009)", async () => {
    const slot = await createSlot(EVENING, ACTOR, scope);
    const orderId = await order({ slotId: slot.id });
    const snapshot = async () =>
      one(
        `SELECT opd.slot_id::text, opd.window_start, opd.window_end, b.state, b.window_start AS b_start, b.window_end AS b_end
           FROM public.order_package_delivery opd
           JOIN public.delivery_slot_booking b ON b.order_id = opd.order_id WHERE opd.order_id = $1`,
        [orderId],
      );
    const before = await snapshot();

    const moved = await updateSlot(slot.id, { startTime: "18:00", endTime: "20:00", cutoffTime: "16:00", capacity: 1 }, ACTOR, scope);
    expect(moved).toMatchObject({ startTime: "18:00", endTime: "20:00", capacity: 1, bookedToday: 1 });
    const off = await updateSlot(slot.id, { status: "disabled" }, ACTOR, scope);
    expect(off.status).toBe("disabled");

    expect(await snapshot()).toEqual(before);
    expect((await audits("delivery_slot.updated"))[0]!.detail).toMatchObject({
      changed: { startTime: { from: "17:00", to: "18:00" }, capacity: { from: 2, to: 1 } },
    });
    expect(await audits("delivery_slot.disabled")).toHaveLength(1);
  });

  it("validates the RESULT of a patch, not the patch — one field can break a slot", async () => {
    const slot = await createSlot(EVENING, ACTOR, scope);

    const pastEnd = await refusal(updateSlot(slot.id, { startTime: "19:30" }, ACTOR, scope));
    expect(pastEnd.kind).toBe("validation");
    expect(pastEnd.fields?.map((f) => f.field)).toContain("endTime");

    const lateCutoff = await refusal(updateSlot(slot.id, { cutoffTime: "17:30" }, ACTOR, scope));
    expect(lateCutoff.fields?.map((f) => f.field)).toEqual(["cutoffTime"]);

    expect((await listSlots())[0]).toMatchObject(EVENING);
    expect(await audits("delivery_slot.updated")).toHaveLength(0);
  });

  it("a slot that does not exist is not found, including a malformed id", async () => {
    expect((await refusal(updateSlot("00000000-0000-0000-0000-000000000000", { capacity: 3 }, ACTOR, scope))).kind).toBe("not_found");
    expect((await refusal(updateSlot("nope", { capacity: 3 }, ACTOR, scope))).kind).toBe("not_found");
  });
});

d("069 — the delivery calendar", () => {
  const SETTINGS = { effyLookaheadDays: 5, noDeliveryWeekdays: [7, 6], slotHoldMin: 15, hubTurnaroundMin: 45 };

  async function hub() {
    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.8, 144.9, 'seed')`,
    );
  }

  it("reads the migration's defaults before anything is saved", async () => {
    expect(await getDeliveryDays()).toEqual({
      noDeliveryWeekdays: [], slotHoldMin: 10, hubTurnaroundMin: 60, effyLookaheadDays: 3, dates: [],
    });
  });

  it("saves and reads back, weekdays sorted, with who saved it", async () => {
    await hub();
    const saved = await putDeliveryDays(SETTINGS, ACTOR, scope);
    expect(saved).toMatchObject({ ...SETTINGS, noDeliveryWeekdays: [6, 7] });
    expect(await getDeliveryDays()).toMatchObject({ effyLookaheadDays: 5, slotHoldMin: 15 });

    const audit = await audits("delivery_days.updated");
    expect(audit[0]).toMatchObject({ actor_sub: ACTOR, target_type: "delivery_settings" });
    const hubRow = await one<{ hub_latitude: string }>(`SELECT hub_latitude::text FROM public.delivery_settings`);
    expect(Number(hubRow.hub_latitude)).toBeCloseTo(-37.8);
  });

  it("refuses to save before the hub is set, rather than inventing one", async () => {
    const err = await refusal(putDeliveryDays(SETTINGS, ACTOR, scope));
    expect(err.kind).toBe("conflict");
    expect((await pool.query(`SELECT 1 FROM public.delivery_settings`)).rowCount).toBe(0);
  });

  it("refuses all seven weekdays and a look-ahead outside 1–14, naming each", async () => {
    await hub();
    const err = await refusal(
      putDeliveryDays({ ...SETTINGS, effyLookaheadDays: 15, noDeliveryWeekdays: [1, 2, 3, 4, 5, 6, 7] }, ACTOR, scope),
    );
    expect(err.kind).toBe("validation");
    expect(err.fields?.map((f) => f.field).sort()).toEqual(["effyLookaheadDays", "noDeliveryWeekdays"]);
  });

  it("⚠ closing a date reports the orders that carry it and changes none of them (FR-043)", async () => {
    const day = (await one<{ day: string }>(`SELECT ((now() AT TIME ZONE 'Australia/Melbourne')::date + 3)::text AS day`)).day;
    const affected = await order({ standardDay: day });
    await order({ standardDay: day });
    await order({ standardDay: day, status: "delivered" }); // already arrived: not affected

    const added = await addNonDeliveryDate({ day, label: "  Stocktake  " }, ACTOR, scope);
    expect(added).toEqual({ day, label: "Stocktake", affectedOrders: 2 });

    const kept = await one<{ promised_to: string }>(
      `SELECT promised_to::text FROM public.order_package_delivery WHERE order_id = $1`, [affected],
    );
    expect(kept.promised_to).toBe(day);
    expect((await getDeliveryDays()).dates).toEqual([{ day, label: "Stocktake", affectedOrders: 2 }]);
    expect(await audits("delivery_days.date_added")).toHaveLength(1);

    await removeNonDeliveryDate(day, ACTOR, scope);
    expect((await getDeliveryDays()).dates).toEqual([]);
    expect(await audits("delivery_days.date_removed")).toHaveLength(1);
  });

  it("078 — the days offered after today are a setting of 1–14, and a save that does not mention it keeps it", async () => {
    await hub();
    expect((await putDeliveryDays({ ...SETTINGS, effyLookaheadDays: 5 }, ACTOR, scope)).effyLookaheadDays).toBe(5);
    // A console built before 078 saves without the field.
    expect((await putDeliveryDays(SETTINGS, ACTOR, scope)).effyLookaheadDays).toBe(5);
    for (const bad of [0, 15, 2.5]) {
      const err = await refusal(putDeliveryDays({ ...SETTINGS, effyLookaheadDays: bad }, ACTOR, scope));
      expect(err.fields?.map((f) => f.field)).toEqual(["effyLookaheadDays"]);
    }
    expect((await getDeliveryDays()).effyLookaheadDays).toBe(5);
  });

  it("078 — closing a date counts everyone promised that day, a window as much as a carrier day", async () => {
    const day = (await one<{ day: string }>(`SELECT ((now() AT TIME ZONE 'Australia/Melbourne')::date + 2)::text AS day`)).day;
    const slot = await createSlot(EVENING, ACTOR, scope);
    await order({ standardDay: day });                       // a carrier day (sold before the new model)
    await order({ slotId: slot.id, windowDay: day });        // Effy, in a window, on a later day
    await order({ slotId: slot.id, windowDay: day, status: "delivered" });
    expect((await addNonDeliveryDate({ day }, ACTOR, scope)).affectedOrders).toBe(2);
    expect(await one(`SELECT count(*)::int AS n FROM public.order_package_delivery WHERE promised_to = $1::date`, [day])).toEqual({ n: 3 });
  });

  it("refuses a date that is not a real day, and a removal of one that is not closed", async () => {
    expect((await refusal(addNonDeliveryDate({ day: "2026-02-30" }, ACTOR, scope))).fields?.[0]?.field).toBe("day");
    expect((await refusal(addNonDeliveryDate({ day: "tomorrow" }, ACTOR, scope))).kind).toBe("validation");
    expect((await refusal(removeNonDeliveryDate("2026-12-25", ACTOR, scope))).kind).toBe("not_found");
  });
});
