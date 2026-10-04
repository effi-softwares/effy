import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⚠ A DRIVER WALKS A DROP THE WAY THE APP DOES (found on the first end-to-end walk, 2026-09-30).
 *
 * "Start this drop" did nothing. The app sends out_for_delivery → en_route → arrived; the backend
 * mapped everything that was not "arrived" to "pending", answered 200, and the app re-read "staged".
 * Every unit test passed, because each half was right about itself. This file drives the real sequence
 * through the real functions against the real migrations — including the one that widens the CHECK —
 * and asserts where the drop is after every step, on both screens that show it.
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

import { migrationSql } from "@effy/edge-shared";

import { recordProof } from "../proof/repository";
import { deliveryDrop, setDropStatus } from "./delivery";
import { deliveryRun, today } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let driverSub: string;
let roundId: string;
let dropId: string;

const step = (to: string) =>
  setDropStatus(dropId, driverId, { to, changeId: crypto.randomUUID() } as never);

d("064 fix — a drop advances through every state the app sends", () => {
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
      "delivery_proof", "package_arrival", "notification_request", "round_package", "round_stop",
      "driver_round", "dispatch_wave", "shop_fulfillment",
    ]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver_duty_session");
    await pool.query("DELETE FROM public.driver");

    driverSub = `sub-${crypto.randomUUID()}`;
    driverId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email)
       VALUES ($1, 'Walk Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`, [driverSub],
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.driver_duty_session (driver_id, started_at) VALUES ($1, now())`, [driverId]);

    const cust = (await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email)
       VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
    )).rows[0]!.id;
    const orderId = (await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
       VALUES ($1, 'EFY-WALK01', 10, 12, '{"line1":"1 Walk St","city":"Melbourne","postalCode":"3000","region":"VIC"}'::jsonb, 'paid')
       RETURNING id`, [cust],
    )).rows[0]!.id;
    const shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('SWALK', 'Walk Shop') RETURNING id`,
    )).rows[0]!.id;
    const sfId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`, [orderId, shopId],
    )).rows[0]!.id;

    const waveId = (await pool.query<{ id: string }>(
      `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
    )).rows[0]!.id;
    roundId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
       VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`, [waveId, driverId],
    )).rows[0]!.id;
    dropId = (await pool.query<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state, settled_at)
       VALUES ($1, $2, 'picked_up', now())`, [dropId, sfId],
    );
  });

  const dropScreen = async () => (await deliveryDrop(dropId, driverId)).status;
  const runScreen = async () => (await deliveryRun(roundId, driverId)).drops[0]!.status;

  it("starts staged", async () => {
    expect(await dropScreen()).toBe("staged");
  });

  /** ⚠ THE DEFECT. Before the fix this assertion read "staged" — the button did nothing. */
  it("⚠ 'Start this drop' moves it to out_for_delivery, on BOTH screens", async () => {
    await step("out_for_delivery");
    expect(await dropScreen()).toBe("out_for_delivery");
    expect(await runScreen()).toBe("out_for_delivery");
  });

  it("'On my way' moves it to en_route", async () => {
    await step("out_for_delivery");
    await step("en_route");
    expect(await dropScreen()).toBe("en_route");
    expect(await runScreen()).toBe("en_route");
  });

  it("'I've arrived' moves it to arrived", async () => {
    await step("out_for_delivery");
    await step("en_route");
    await step("arrived");
    expect(await dropScreen()).toBe("arrived");
  });

  /**
   * ⚠ THE SECOND WAY IT WOULD HAVE BROKEN. The Today screen's "outstanding" filter listed `pending`
   * and `arrived` by name, so a started drop would have vanished from the driver's home screen.
   */
  it("⚠ a started drop stays on the driver's Today screen at every step", async () => {
    for (const to of ["out_for_delivery", "en_route", "arrived"]) {
      await step(to);
      const t = await today(driverId);
      expect(t.active?.id, `Today lost the drop at ${to}`).toBe(dropId);
      expect(t.remainingCount).toBe(1);
    }
  });

  it("the whole walk ends in a delivered order", async () => {
    await step("out_for_delivery");
    await step("en_route");
    await step("arrived");
    const r = await recordProof({
      dropId, driverId, driverSub, method: "photo", mediaKey: "proof/walk/1.jpg", note: null,
      changeId: crypto.randomUUID(),
    });
    expect(r.orderComplete).toBe(true);
    expect(await dropScreen()).toBe("delivered");
    const o = await pool.query(`SELECT sf.status FROM public.shop_fulfillment sf`);
    expect(o.rows[0].status).toBe("delivered");
  });

  /** ⚠ The function used to write whatever it was given, so a stale tap could un-deliver a package. */
  it("⚠ never moves a delivered drop backwards", async () => {
    await step("arrived");
    await recordProof({
      dropId, driverId, driverSub, method: "photo", mediaKey: "proof/walk/2.jpg", note: null,
      changeId: crypto.randomUUID(),
    });
    const res = await step("out_for_delivery");
    expect(res.status).toBe("delivered");
    expect(await dropScreen()).toBe("delivered");
  });

  it("refuses a status the drop cannot be moved to by this route", async () => {
    await expect(step("delivered")).rejects.toBeDefined();
    await expect(step("pending")).rejects.toBeDefined();
  });

  it("the database refuses a state that does not exist", async () => {
    await expect(
      pool.query(`UPDATE public.round_stop SET status = 'teleported' WHERE id = $1`, [dropId]),
    ).rejects.toThrow(/round_stop_status_check/);
  });
});
