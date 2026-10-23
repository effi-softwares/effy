import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** The note comes from the order, reaches only the assigned driver, and is null when none was written. */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  };
});

import { migrationSql } from "@effy/edge-shared/testing";

import { deliveryDrop } from "./delivery";
import { NotFoundError } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params as never[])).rows[0]!;

async function makeDriver(): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email)
     VALUES ($1, 'Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`,
    [`sub-${crypto.randomUUID()}`],
  )).id;
}

async function makeDrop(driverId: string, handover: string | null, note: string | null): Promise<string> {
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const order = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount,
                                 delivery_address, status, delivery_handover, delivery_note, delivery_type, delivery_type_reason)
     VALUES ($1, 'EFY-' || substr(md5(random()::text), 1, 6), 10, 12,
             '{"recipientName":"Pat","line1":"1 Test St","city":"Carlton","postalCode":"3053","region":"VIC"}'::jsonb,
             'paid', $2, $3, 'effy', 'in_coverage') RETURNING id`,
    [cust.id, handover, note],
  );
  const shop = await one<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ('S' || substr(md5(random()::text), 1, 6), 'Shop') RETURNING id`,
  );
  const sf = await one<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`,
    [order.id, shop.id],
  );
  const wave = await one<{ id: string }>(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
  );
  const round = await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
     VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`,
    [wave.id, driverId],
  );
  const drop = await one<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
    [round.id, order.id],
  );
  await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop.id, sf.id]);
  return drop.id;
}

d("066 — delivery instructions on the driver's drop", () => {
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
    for (const t of ["round_package", "round_stop", "driver_round", "dispatch_wave", "shop_fulfillment"]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver");
  });

  it("⚠ returns the customer's note VERBATIM, and the handover preference beside it", async () => {
    const driverId = await makeDriver();
    const note = "Side gate — code 4411.\n<b>Don't</b> ring: baby asleep 🚪";
    const dropId = await makeDrop(driverId, "leave_at_door", note);

    const drop = await deliveryDrop(dropId, driverId);
    expect(drop.instructions).toBe(note);
    expect(drop.handover).toBe("leave_at_door");
  });

  it("a note without a preference, and a preference without a note", async () => {
    const driverId = await makeDriver();
    const a = await deliveryDrop(await makeDrop(driverId, null, "Ring twice"), driverId);
    expect(a).toMatchObject({ instructions: "Ring twice", handover: null });

    const other = await makeDriver();
    const b = await deliveryDrop(await makeDrop(other, "meet_at_door", null), other);
    expect(b).toMatchObject({ instructions: null, handover: "meet_at_door" });
  });

  it("an order with no instructions returns null for both — nothing is invented", async () => {
    const driverId = await makeDriver();
    const drop = await deliveryDrop(await makeDrop(driverId, null, null), driverId);
    expect(drop.instructions).toBeNull();
    expect(drop.handover).toBeNull();
  });

  /** A note may hold a gate code. */
  it("092 — the customer's phone is sent while the drop is open, and never once it is settled", async () => {
    const driverId = await makeDriver();
    const dropId = await makeDrop(driverId, null, null);
    await pool.query(
      `UPDATE public."order" SET delivery_address = delivery_address || '{"phone":" 0400 000 000 "}'::jsonb
        WHERE id = (SELECT order_id FROM public.round_stop WHERE id = $1)`,
      [dropId],
    );
    expect((await deliveryDrop(dropId, driverId)).customerPhone).toBe("0400 000 000");

    for (const settled of ["done", "skipped"]) {
      await pool.query(`UPDATE public.round_stop SET status = $2 WHERE id = $1`, [dropId, settled]);
      expect((await deliveryDrop(dropId, driverId)).customerPhone).toBeNull();
    }
  });

  it("092 — a customer who gave no phone is null, not an empty string", async () => {
    const driverId = await makeDriver();
    expect((await deliveryDrop(await makeDrop(driverId, null, null), driverId)).customerPhone).toBeNull();
  });

  it("⚠ another driver cannot read the instructions, and is refused like a missing drop", async () => {
    const driverId = await makeDriver();
    const dropId = await makeDrop(driverId, "leave_at_door", "Gate code 4411");
    const other = await makeDriver();

    await expect(deliveryDrop(dropId, other)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deliveryDrop(crypto.randomUUID(), driverId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
