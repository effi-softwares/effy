import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Delivery exceptions against real PostgreSQL (064, US3).
 *
 * ⚠ THE `package_location` COLUMN IS A CORRELATED EXISTS OVER FOUR TABLES, and it is the one field
 * that makes this list triageable (FR-020): "still in a van" and "back at the hub" are different
 * problems with different urgency. It cannot be unit-tested — there is nothing to stub that would
 * still be the thing under test — and it is exactly the shape 056 found two wrong column names in,
 * both of which typechecked perfectly and failed only at runtime.
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

import { ExceptionNotFoundError, listExceptions, resolveException } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let dropId: string;
let sfId: string;

d("064 — delivery exceptions", () => {
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
      "delivery_attempt_failure", "package_arrival", "hub_checkin", "round_package",
      "round_stop", "driver_round", "dispatch_wave", "shop_fulfillment",
    ]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query("DELETE FROM admin.audit_log");
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver");

    const sub = `sub-${crypto.randomUUID()}`;
    driverId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email)
       VALUES ($1, 'Exception Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`, [sub],
    )).rows[0]!.id;

    const cust = (await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email)
       VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
    )).rows[0]!.id;
    const orderId = (await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
       VALUES ($1, 'EFY-EXC01', 10, 12, '{"city":"Fitzroy","postalCode":"3065"}'::jsonb, 'paid') RETURNING id`, [cust],
    )).rows[0]!.id;
    const shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('SEX', 'Exception Shop') RETURNING id`,
    )).rows[0]!.id;
    sfId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`, [orderId, shopId],
    )).rows[0]!.id;

    const waveId = (await pool.query<{ id: string }>(
      `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
    )).rows[0]!.id;
    const roundId = (await pool.query<{ id: string }>(
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

  const addFailure = (reason = "nobody_home", note: string | null = null) =>
    pool.query<{ id: string }>(
      `INSERT INTO public.delivery_attempt_failure (stop_id, reason, note, driver_id, failed_at, change_id)
       VALUES ($1, $2, $3, $4, now(), gen_random_uuid()) RETURNING id`,
      [dropId, reason, note, driverId],
    );

  it("lists a failure with everything needed to act on it", async () => {
    await addFailure("access_blocked", "gate code did not work");
    const { exceptions, openCount } = await listExceptions();

    expect(openCount).toBe(1);
    const e = exceptions[0]!;
    expect(e.orderNumber).toBe("EFY-EXC01");
    expect(e.reason).toBe("access_blocked");
    expect(e.note).toBe("gate code did not work");
    expect(e.driverName).toBe("Exception Driver");
    expect(e.destinationSuburb).toBe("Fitzroy");
    expect(e.resolvedAt).toBeNull();
  });

  describe("⚠ FR-020 — where the package is", () => {
    it("reports `with_driver` while the package is still picked up and unarrived", async () => {
      await addFailure();
      const { exceptions } = await listExceptions();
      expect(exceptions[0]!.packageLocation).toBe("with_driver");
    });

    it("reports `at_hub` once the package has an arrival", async () => {
      await addFailure();
      await pool.query(
        `INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 'staff-sub-fixture')`,
        [sfId],
      );
      const { exceptions } = await listExceptions();
      expect(exceptions[0]!.packageLocation).toBe("at_hub");
    });
  });

  describe("⚠ FR-022 — resolving", () => {
    it("takes the exception off the open list but keeps the record", async () => {
      const id = (await addFailure()).rows[0]!.id;
      await resolveException(id, "staff-sub-1", null);

      expect((await listExceptions()).exceptions).toHaveLength(0);
      const withResolved = await listExceptions(true);
      expect(withResolved.exceptions).toHaveLength(1);
      expect(withResolved.exceptions[0]!.resolvedAt).not.toBeNull();
      expect(withResolved.openCount).toBe(0);
    });

    it("writes an audit row through the SHARED helper, naming who closed it", async () => {
      const id = (await addFailure()).rows[0]!.id;
      await resolveException(id, "staff-sub-7", "came back to the hub");

      const audit = await pool.query(
        `SELECT actor_sub, action, target_type, target_id, detail FROM admin.audit_log`,
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].actor_sub).toBe("staff-sub-7");
      expect(audit.rows[0].action).toBe("dispatch.exception_resolve");
      expect(audit.rows[0].target_type).toBe("delivery_exception");
      expect(audit.rows[0].target_id).toBe(id);
    });

    it("⚠ records THAT a note was given, never the driver's own words", async () => {
      // The driver's note is free text typed at a doorstep and may name a person or a property
      // (FR-028, 050's no-PII rule). The audit says a note existed; it does not quote anything.
      const id = (await addFailure("other", "left with Mrs Patel at number 12")).rows[0]!.id;
      await resolveException(id, "staff-sub-1", "spoke to the customer");

      const audit = await pool.query(`SELECT detail::text AS detail FROM admin.audit_log`);
      expect(audit.rows[0].detail).not.toMatch(/Patel/);
      expect(audit.rows[0].detail).not.toMatch(/number 12/);
      expect(audit.rows[0].detail).toMatch(/noteProvided/);
    });

    it("⚠ resolving twice does not overwrite who closed it first", async () => {
      const id = (await addFailure()).rows[0]!.id;
      const first = await resolveException(id, "staff-first", null);
      const second = await resolveException(id, "staff-second", null);

      expect(second.resolvedAt).toBe(first.resolvedAt);
      const audit = await pool.query(`SELECT actor_sub FROM admin.audit_log`);
      expect(audit.rowCount, "the second resolve is a no-op, not a second audit row").toBe(1);
      expect(audit.rows[0].actor_sub).toBe("staff-first");
    });

    it("refuses an exception that does not exist", async () => {
      await expect(resolveException(crypto.randomUUID(), "staff-sub-1", null)).rejects.toBeInstanceOf(
        ExceptionNotFoundError,
      );
    });
  });

  it("keeps several attempts for one drop as separate rows", async () => {
    await addFailure("nobody_home");
    await addFailure("access_blocked");
    const { exceptions, openCount } = await listExceptions();
    expect(exceptions).toHaveLength(2);
    expect(openCount).toBe(2);
  });
});
