import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { deliveryModelV2At } from "./model";
import { loadSlotSettings, slotLoad, slotLoadByDate } from "./slots";

/**
 * 078 — the switch, the settings and the relaxed window rule against the REAL schema. Selling a
 * window (the quote, the hold, the race for the last place) is proven where it happens, in
 * commerce's checkout container test.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

d("078 — delivery windows against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("the switch is off with no settings row, off while NULL, and on from its instant — not before", async () => {
    await pool.query(`DELETE FROM public.delivery_settings`);
    expect(await deliveryModelV2At(pool, new Date())).toBe(false);
    expect((await loadSlotSettings(pool)).effyLookaheadDays).toBe(3);

    await pool.query(`INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.81, 144.96, 'test')`);
    expect(await deliveryModelV2At(pool, new Date())).toBe(false);
    expect((await loadSlotSettings(pool)).effyLookaheadDays).toBe(3);

    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = '2026-11-01T00:00:00+11:00' WHERE id = 1`);
    expect(await deliveryModelV2At(pool, new Date("2026-10-31T12:59:59Z"))).toBe(false);
    expect(await deliveryModelV2At(pool, new Date("2026-10-31T13:00:00Z"))).toBe(true);
    expect(await deliveryModelV2At(pool, new Date("2027-01-01T00:00:00Z"))).toBe(true);
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = NULL WHERE id = 1`);
  });

  it("the look-ahead is 1 to 14 days", async () => {
    await pool.query(`UPDATE public.delivery_settings SET effy_lookahead_days = 14 WHERE id = 1`);
    expect((await loadSlotSettings(pool)).effyLookaheadDays).toBe(14);
    for (const bad of [0, 15]) {
      await expect(pool.query(`UPDATE public.delivery_settings SET effy_lookahead_days = $1 WHERE id = 1`, [bad])).rejects.toThrow(/effy_lookahead/);
    }
  });

  it("a standard package may carry a window; half a window is still refused; load is per day", async () => {
    const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('WIN', 'Windows') RETURNING id::text AS id`)).rows[0]!.id;
    const customer = (await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email, given_name, family_name) VALUES ('win-1', 'win-1@example.test', 'W', 'One') RETURNING id::text AS id`,
    )).rows[0]!.id;
    const slot = (await pool.query<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('16:00', '18:00', '14:00', 2, 'test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    const order = async (n: number) =>
      (await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency, delivery_address)
         VALUES ($1, $2, 'pending_payment', 1, 0, 1, 'AUD', '{}'::jsonb) RETURNING id::text AS id`,
        [customer, `WIN-${n}`],
      )).rows[0]!.id;

    const a = await order(1);
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method, promised_from, promised_to, slot_id, window_start, window_end)
       VALUES ($1, $2, 'standard', '2026-10-08', '2026-10-08', $3, '2026-10-08T05:00:00Z', '2026-10-08T07:00:00Z')`,
      [a, shop, slot],
    );
    const b = await order(2);
    await expect(pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method, promised_from, promised_to, slot_id)
       VALUES ($1, $2, 'standard', '2026-10-08', '2026-10-08', $3)`,
      [b, shop, slot],
    )).rejects.toThrow(/order_package_delivery_window_ck/);

    // Thursday has two places taken (one confirmed, one live hold) and a lapsed hold that no longer counts.
    const c = await order(3);
    await pool.query(
      `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, held_until, window_start, window_end) VALUES
         ($1, '2026-10-08', $2, 'confirmed', NULL, '2026-10-08T05:00:00Z', '2026-10-08T07:00:00Z'),
         ($1, '2026-10-08', $3, 'held', now() + interval '5 minutes', '2026-10-08T05:00:00Z', '2026-10-08T07:00:00Z'),
         ($1, '2026-10-09', $4, 'held', now() - interval '1 minute', '2026-10-09T05:00:00Z', '2026-10-09T07:00:00Z')`,
      [slot, a, b, c],
    );
    const load = await slotLoadByDate(pool, ["2026-10-08", "2026-10-09", "2026-10-10"]);
    expect([load.get("2026-10-08")!.get(slot), load.get("2026-10-09")!.get(slot), load.get("2026-10-10")!.size]).toEqual([2, 0, 0]); // the lapsed hold is a row that counts for nothing
    expect((await slotLoad(pool, "2026-10-08")).get(slot)).toBe(2);
    expect(await slotLoadByDate(pool, [])).toEqual(new Map());
  });
});
