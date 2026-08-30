import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The whole fleet service against real PostgreSQL 16 (056).
 *
 * ⚠ WHY THIS FILE IS NOT OPTIONAL. Every query in this service is raw SQL over eleven tables that
 * four different slices own, and a wrong column name TYPECHECKS PERFECTLY. Two were already caught
 * while writing this feature, and neither was catchable any other way:
 *
 *   - `public."order".reference` does not exist; the column is `order_number`.
 *   - `public.customer_address.suburb` does not exist; the column is `city`.
 *
 * Both would have passed `tsc`, passed every mocked unit test, deployed cleanly, and failed the first
 * time a real operator opened the screen. That is precisely the class of defect 039 shipped four of.
 *
 * The schema below is the real one, transcribed from the migrations these tables come from
 * (019 commerce, 020 fulfilment, 047 delivery, 049 driver, 056 this slice) plus admin.audit_log
 * (009). Where a column is not needed it is omitted, but every column any query in this service
 * NAMES is present — so a query naming one that is not really there fails here rather than in dev.
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
    // Presigning talks to S3; the property under test here is the SQL, so it is stubbed to a value
    // the assertions can recognise.
    presignRead: async (key: string) => `https://signed.example/${key}?X-Amz-Expires=900`,
  };
});

import * as driversRepo from "./drivers/repository";
import * as dutyRepo from "./duty/repository";
import * as exceptionsRepo from "./exceptions/repository";
import * as historyRepo from "./history/repository";
import * as readinessRepo from "./readiness/repository";
import * as strandedRepo from "./stranded/repository";

const RUN = process.env.CONTAINER_TESTS === "1";

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE admin.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_sub text NOT NULL, action text NOT NULL,
  target_type text NOT NULL, target_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL
);
CREATE TABLE public.customer_address (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customer (id),
  recipient_name text NOT NULL, line1 text NOT NULL, city text NOT NULL,
  postal_code text NOT NULL, country char(2) NOT NULL DEFAULT 'AU'
);
CREATE TABLE public."order" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customer (id),
  order_number text NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.shop_fulfillment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public."order" (id),
  shop_id uuid NOT NULL REFERENCES public.shop (id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, shop_id)
);
CREATE TABLE public.order_package_delivery (
  order_id uuid NOT NULL REFERENCES public."order" (id),
  shop_id uuid NOT NULL REFERENCES public.shop (id),
  method text NOT NULL,
  PRIMARY KEY (order_id, shop_id)
);
CREATE TABLE public.delivery_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL
);
CREATE TABLE public.delivery_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hub_latitude numeric(9,6) NOT NULL, hub_longitude numeric(9,6) NOT NULL
);

-- 049 + 056: the driver record, with this slice's widened status and new profile columns.
CREATE TABLE public.driver (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text NOT NULL UNIQUE,
  name text NOT NULL,
  work_email citext NOT NULL UNIQUE,
  delivery_zone_id uuid REFERENCES public.delivery_zone (id) ON DELETE SET NULL,
  vehicle_type text, vehicle_plate text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'offboarded')),
  status_reason text,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  contact_phone text, started_on date,
  emergency_contact_name text, emergency_contact_phone text, notes text,
  licence_reference text, licence_expires_on date, vehicle_registration_expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_name_trgm_idx ON public.driver USING gin (name gin_trgm_ops);
CREATE INDEX driver_register_idx ON public.driver (name, id);

CREATE TABLE public.driver_duty_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);
CREATE UNIQUE INDEX driver_duty_session_open_uq
  ON public.driver_duty_session (driver_id) WHERE ended_at IS NULL;

CREATE TABLE public.driver_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.driver (id),
  type text NOT NULL CHECK (type IN ('collection', 'same_day_delivery')),
  status text NOT NULL DEFAULT 'assigned',
  business_date date NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE public.collection_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.driver_run (id) ON DELETE CASCADE,
  shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id),
  shop_id uuid NOT NULL REFERENCES public.shop (id),
  sequence int NOT NULL, status text NOT NULL DEFAULT 'assigned',
  collected_at timestamptz,
  CONSTRAINT collection_task_package_uq UNIQUE (shop_fulfillment_id)
);
CREATE TABLE public.order_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public."order" (id)
);
CREATE TABLE public.collection_task_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_task_id uuid NOT NULL REFERENCES public.collection_task (id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_item (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('missing', 'short')),
  note text, reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by_sub text, resolution_note text
);
CREATE INDEX collection_task_issue_open_idx
  ON public.collection_task_issue (reported_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE public.delivery_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.driver_run (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public."order" (id),
  customer_address_id uuid NOT NULL REFERENCES public.customer_address (id),
  sequence int NOT NULL, status text NOT NULL DEFAULT 'staged',
  delivered_at timestamptz,
  CONSTRAINT delivery_task_order_uq UNIQUE (order_id)
);
CREATE TABLE public.delivery_task_package (
  delivery_task_id uuid NOT NULL REFERENCES public.delivery_task (id) ON DELETE CASCADE,
  shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id),
  PRIMARY KEY (delivery_task_id, shop_fulfillment_id),
  CONSTRAINT delivery_task_package_uq UNIQUE (shop_fulfillment_id)
);
CREATE TABLE public.proof_of_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_task_id uuid NOT NULL UNIQUE REFERENCES public.delivery_task (id) ON DELETE CASCADE,
  method text NOT NULL, media_key text, code_verified boolean, note text,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.delivery_failure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_task_id uuid NOT NULL REFERENCES public.delivery_task (id) ON DELETE CASCADE,
  reason text NOT NULL, note text, failed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by_sub text, resolution_note text
);
CREATE INDEX delivery_failure_open_idx
  ON public.delivery_failure (failed_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE public.driver_task_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.driver_run (id) ON DELETE CASCADE,
  collection_task_id uuid REFERENCES public.collection_task (id) ON DELETE CASCADE,
  delivery_task_id uuid REFERENCES public.delivery_task (id) ON DELETE CASCADE,
  status text NOT NULL, at timestamptz NOT NULL DEFAULT now(), change_id uuid,
  CONSTRAINT driver_task_event_one_subject CHECK (
    (run_id IS NOT NULL)::int + (collection_task_id IS NOT NULL)::int
    + (delivery_task_id IS NOT NULL)::int = 1
  )
);
`;

describe.skipIf(!RUN)("fleet SQL — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(SCHEMA);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE public.driver_task_event, public.delivery_failure, public.proof_of_delivery,
               public.delivery_task_package, public.delivery_task, public.collection_task_issue,
               public.collection_task, public.driver_run, public.driver_duty_session,
               public.driver, public.order_item, public.order_package_delivery,
               public.shop_fulfillment, public."order", public.customer_address, public.customer,
               public.shop, public.delivery_zone, public.delivery_settings, admin.audit_log
      RESTART IDENTITY CASCADE`);
    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude) VALUES (1, -37.8, 144.9)`,
    );
  });

  async function seedZone(name = "Inner North"): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.delivery_zone (name) VALUES ($1) RETURNING id`,
      [name],
    );
    return r.rows[0]!.id;
  }

  async function seedDriver(
    name: string,
    opts: { zoneId?: string | null; status?: string; onDuty?: boolean; licenceExpires?: string } = {},
  ): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email, delivery_zone_id, status, licence_expires_on)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        `sub-${name}-${Math.random()}`,
        name,
        `${name.toLowerCase().replace(/\s+/g, ".")}.${Math.floor(Math.random() * 1e6)}@effyshopping.com`,
        opts.zoneId ?? null,
        opts.status ?? "active",
        opts.licenceExpires ?? null,
      ],
    );
    const id = r.rows[0]!.id;
    if (opts.onDuty) {
      await pool.query(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [id]);
    }
    return id;
  }

  async function seedOrderWithPackage(
    ref: string,
    fulfillmentStatus = "ready_for_pickup",
    method = "same_day",
  ): Promise<{ orderId: string; shopId: string; fulfillmentId: string; addressId: string }> {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (email) VALUES ($1) RETURNING id`,
      [`${ref}@example.test`],
    );
    const a = await pool.query<{ id: string }>(
      `INSERT INTO public.customer_address (customer_id, recipient_name, line1, city, postal_code)
       VALUES ($1, 'Test Person', '1 Test St', 'Carlton', '3053') RETURNING id`,
      [c.rows[0]!.id],
    );
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status) VALUES ($1, $2, 'paid') RETURNING id`,
      [c.rows[0]!.id, ref],
    );
    const s = await pool.query<{ id: string }>(
      `INSERT INTO public.shop (name) VALUES ($1) RETURNING id`,
      [`Shop ${ref}`],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status) VALUES ($1, $2, $3) RETURNING id`,
      [o.rows[0]!.id, s.rows[0]!.id, fulfillmentStatus],
    );
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, $3)`,
      [o.rows[0]!.id, s.rows[0]!.id, method],
    );
    return {
      orderId: o.rows[0]!.id,
      shopId: s.rows[0]!.id,
      fulfillmentId: f.rows[0]!.id,
      addressId: a.rows[0]!.id,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("SC-013 — the register pages 500 drivers with no duplicate and no gap", () => {
    it("returns every driver exactly once across the full paging sequence", async () => {
      const names = Array.from({ length: 500 }, (_, i) => `Driver ${String(i).padStart(3, "0")}`);
      for (const n of names) await seedDriver(n);

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        // ⚠ Through the SERVICE-shaped call, cursor and all — the repository is where the cursor is
        // MINTED, and 053's paging test supplied its own cursor, never touched the minting, and
        // passed with the defect in place.
        const page = await driversRepo.listDrivers({ limit: 25, cursor });
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor ?? undefined;
        pages++;
        expect(pages, "paging did not terminate").toBeLessThan(50);
      } while (cursor);

      expect(seen).toHaveLength(500);
      expect(new Set(seen).size, "a driver was returned on two pages").toBe(500);
      expect(pages).toBe(20);
    });

    it("⚠ orders on the SAME pair the cursor is minted from, so duplicate names cannot break it", async () => {
      // Five drivers with the identical name. If the cursor were `(name)` alone, the second page
      // would skip or repeat all five — this is exactly 053's failure, made maximally likely.
      for (let i = 0; i < 5; i++) await seedDriver("Same Name");
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await driversRepo.listDrivers({ limit: 2, cursor });
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(new Set(seen).size).toBe(5);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("SC-010 — every optional field can be cleared and stays cleared", () => {
    it("⚠ a null in the patch CLEARS the column; an absent key leaves it alone", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("Clearable", { zoneId });
      await pool.query(
        `UPDATE public.driver
            SET contact_phone = '0400 111 222', vehicle_plate = 'ABC123',
                licence_reference = 'VIC-1', licence_expires_on = '2027-01-01',
                emergency_contact_name = 'Kin', notes = 'note', started_on = '2026-01-01'
          WHERE id = $1`,
        [id],
      );

      const before = await driversRepo.getDriver(id);
      expect(before!.zoneId).toBe(zoneId);
      expect(before!.contactPhone).toBe("0400 111 222");

      // Clear every optional field in one patch.
      const outcome = await driversRepo.updateDriver(
        id,
        {
          zoneId: null,
          contactPhone: null,
          vehiclePlate: null,
          licenceReference: null,
          licenceExpiresOn: null,
          emergencyContactName: null,
          notes: null,
          startedOn: null,
        },
        before!.updatedAt,
      );
      expect(outcome).toBe("updated");

      const after = await driversRepo.getDriver(id);
      expect(after!.zoneId).toBeNull();
      expect(after!.contactPhone).toBeNull();
      expect(after!.vehicle.plate).toBeNull();
      expect(after!.credentials.licenceReference).toBeNull();
      expect(after!.credentials.licenceExpiresOn).toBeNull();
      expect(after!.emergencyContact.name).toBeNull();
      expect(after!.notes).toBeNull();
      expect(after!.startedOn).toBeNull();
      // ⚠ And the name, whose key was absent, is untouched.
      expect(after!.name).toBe("Clearable");
    });

    it("refuses a stale write instead of discarding the other operator's edit", async () => {
      const id = await seedDriver("Contested");
      const loaded = await driversRepo.getDriver(id);
      await driversRepo.updateDriver(id, { name: "First Writer" }, loaded!.updatedAt);
      const outcome = await driversRepo.updateDriver(id, { name: "Second Writer" }, loaded!.updatedAt);
      expect(outcome).toBe("stale");
      expect((await driversRepo.getDriver(id))!.name).toBe("First Writer");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("FR-014 — the duplicate work email is refused by the DATABASE, not just the service", () => {
    it("⚠ a second insert on the same address raises rather than upserting", async () => {
      await pool.query(
        `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('s1', 'Jo', 'jo@effyshopping.com')`,
      );
      await expect(
        driversRepo.insertDriver({
          sub: "s2",
          name: "Someone Else",
          workEmail: "jo@effyshopping.com",
          profile: {},
        }),
      ).rejects.toThrow();
      // Jo is untouched — the whole point.
      const jo = await pool.query<{ name: string }>(
        `SELECT name FROM public.driver WHERE work_email = 'jo@effyshopping.com'`,
      );
      expect(jo.rows[0]!.name).toBe("Jo");
    });

    it("is case-insensitive, because citext and Cognito both are", async () => {
      await pool.query(
        `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('s1', 'Jo', 'jo@effyshopping.com')`,
      );
      expect(await driversRepo.findByWorkEmail("JO@EFFYSHOPPING.COM")).not.toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("SC-006 — held and stranded work", () => {
    async function seedCollectedPackage(driverId: string, ref: string, status = "collected") {
      const pkg = await seedOrderWithPackage(ref, "collected");
      const run = await pool.query<{ id: string }>(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date)
         VALUES ($1, 'collection', 'active', current_date) RETURNING id`,
        [driverId],
      );
      await pool.query(
        `INSERT INTO public.collection_task (run_id, shop_fulfillment_id, shop_id, sequence, status)
         VALUES ($1, $2, $3, 0, $4)`,
        [run.rows[0]!.id, pkg.fulfillmentId, pkg.shopId, status],
      );
      return pkg;
    }

    it("⚠ reports work an ACTIVE driver holds as held, so standing them down warns first", async () => {
      const driverId = await seedDriver("Holder", { onDuty: true });
      await seedCollectedPackage(driverId, "EFY-HELD01");

      const held = await driversRepo.heldWorkFor(driverId);
      expect(held).toHaveLength(1);
      expect(held[0]!.orderReference).toBe("EFY-HELD01");
      expect(held[0]!.taskStatus).toBe("collected");

      // ⚠ Not yet STRANDED — the driver is still eligible. Stranded is what it becomes afterwards.
      expect(await strandedRepo.listStranded()).toHaveLength(0);
    });

    it("⚠ the same package becomes STRANDED the moment the driver is stood down", async () => {
      const driverId = await seedDriver("Departing", { onDuty: true });
      await seedCollectedPackage(driverId, "EFY-STRND1");

      await pool.query(`UPDATE public.driver SET status = 'suspended' WHERE id = $1`, [driverId]);

      const stranded = await strandedRepo.listStranded();
      expect(stranded).toHaveLength(1);
      expect(stranded[0]!.driverName).toBe("Departing");
      expect(stranded[0]!.orderReference).toBe("EFY-STRND1");
      expect(stranded[0]!.driverStatus).toBe("suspended");
    });

    it("⚠ does NOT report work the automatic sweep would reclaim on its own", async () => {
      // `assigned` and `en_route` collection tasks are released by releaseIneligibleWork. Reporting
      // them here would send an operator to release by hand something that fixes itself in minutes.
      const driverId = await seedDriver("Not Started", { onDuty: true });
      await seedCollectedPackage(driverId, "EFY-ASSIGN", "assigned");
      await pool.query(`UPDATE public.driver SET status = 'suspended' WHERE id = $1`, [driverId]);
      expect(await strandedRepo.listStranded()).toHaveLength(0);
    });

    it("releases stranded work so the package matches the sweep's candidate predicate again", async () => {
      const driverId = await seedDriver("Released From", { onDuty: true });
      const pkg = await seedCollectedPackage(driverId, "EFY-RELEAS");
      await pool.query(`UPDATE public.driver SET status = 'offboarded' WHERE id = $1`, [driverId]);

      const stranded = await strandedRepo.listStranded();
      const released = await strandedRepo.releaseStranded([stranded[0]!.taskId], []);

      expect(released).toBe(1);
      expect(await strandedRepo.listStranded()).toHaveLength(0);
      // The collection_task is gone, so nothing claims the package any more.
      const claim = await pool.query(
        `SELECT 1 FROM public.collection_task WHERE shop_fulfillment_id = $1`,
        [pkg.fulfillmentId],
      );
      expect(claim.rowCount).toBe(0);
      // And the release is on the run's timeline rather than vanishing from history.
      const events = await pool.query<{ status: string }>(
        `SELECT status FROM public.driver_task_event WHERE status = 'released_by_back_office'`,
      );
      expect(events.rowCount).toBe(1);
    });

    it("⚠ refuses to release work belonging to a driver who is still working", async () => {
      // A stale screen must not be able to yank a package out of an active driver's hands.
      const driverId = await seedDriver("Still Working", { onDuty: true });
      await seedCollectedPackage(driverId, "EFY-ACTIVE");
      const task = await pool.query<{ id: string }>(`SELECT id FROM public.collection_task`);
      const released = await strandedRepo.releaseStranded([task.rows[0]!.id], []);
      expect(released).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("SC-003 — every recorded exception is readable, measured not spot-checked", () => {
    async function seedFailure(driverId: string, ref: string) {
      const pkg = await seedOrderWithPackage(ref, "collected");
      const run = await pool.query<{ id: string }>(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date)
         VALUES ($1, 'same_day_delivery', 'active', current_date) RETURNING id`,
        [driverId],
      );
      const dt = await pool.query<{ id: string }>(
        `INSERT INTO public.delivery_task (run_id, order_id, customer_address_id, sequence, status)
         VALUES ($1, $2, $3, 0, 'failed') RETURNING id`,
        [run.rows[0]!.id, pkg.orderId, pkg.addressId],
      );
      await pool.query(
        `INSERT INTO public.delivery_failure (delivery_task_id, reason, note)
         VALUES ($1, 'nobody_home', 'no answer, no safe place')`,
        [dt.rows[0]!.id],
      );
      return dt.rows[0]!.id;
    }

    async function seedIssue(driverId: string, ref: string) {
      const pkg = await seedOrderWithPackage(ref, "collected");
      const run = await pool.query<{ id: string }>(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date)
         VALUES ($1, 'collection', 'completed', current_date) RETURNING id`,
        [driverId],
      );
      const ct = await pool.query<{ id: string }>(
        `INSERT INTO public.collection_task (run_id, shop_fulfillment_id, shop_id, sequence, status)
         VALUES ($1, $2, $3, 0, 'short') RETURNING id`,
        [run.rows[0]!.id, pkg.fulfillmentId, pkg.shopId],
      );
      await pool.query(
        `INSERT INTO public.collection_task_issue (collection_task_id, kind, note)
         VALUES ($1, 'short', 'two of six missing')`,
        [ct.rows[0]!.id],
      );
    }

    it("⚠ returns EVERY recorded exception of both kinds — the count is the assertion", async () => {
      const driverId = await seedDriver("Reporter", { onDuty: true });
      for (let i = 0; i < 4; i++) await seedFailure(driverId, `EFY-FAIL${i}`);
      for (let i = 0; i < 3; i++) await seedIssue(driverId, `EFY-ISSU${i}`);

      const recorded = await pool.query<{ n: string }>(
        `SELECT ((SELECT count(*) FROM public.delivery_failure)
               + (SELECT count(*) FROM public.collection_task_issue))::text AS n`,
      );
      const page = await exceptionsRepo.listExceptions({ limit: 100 });

      expect(page.items).toHaveLength(Number(recorded.rows[0]!.n));
      expect(page.items).toHaveLength(7);
      expect(await exceptionsRepo.outstandingCount()).toBe(7);
    });

    it("carries the reason, note, driver, order and location a person needs to act", async () => {
      const driverId = await seedDriver("Reporter", { onDuty: true });
      await seedFailure(driverId, "EFY-DETAIL");
      const [item] = (await exceptionsRepo.listExceptions({ limit: 10 })).items;
      expect(item!.reason).toBe("nobody_home");
      expect(item!.note).toBe("no answer, no safe place");
      expect(item!.driverName).toBe("Reporter");
      expect(item!.orderReference).toBe("EFY-DETAIL");
      expect(item!.location).toBe("Carlton");
    });

    it("resolves one-way, keeps it readable, and drops it from the outstanding count", async () => {
      const driverId = await seedDriver("Reporter", { onDuty: true });
      await seedFailure(driverId, "EFY-RESOLV");
      const [item] = (await exceptionsRepo.listExceptions({ limit: 10 })).items;

      expect(await exceptionsRepo.resolveException("delivery_failure", item!.id, "actor-1", "redelivered")).toBe("resolved");
      expect(await exceptionsRepo.outstandingCount()).toBe(0);
      // ⚠ Still there, not deleted.
      const resolved = await exceptionsRepo.getException("delivery_failure", item!.id);
      expect(resolved!.resolutionNote).toBe("redelivered");
      // A second resolve does not overwrite who resolved it first.
      expect(await exceptionsRepo.resolveException("delivery_failure", item!.id, "actor-2", "again")).toBe("already_resolved");
      expect((await exceptionsRepo.getException("delivery_failure", item!.id))!.resolvedBySub).toBe("actor-1");
    });

    it("defaults the list to outstanding only", async () => {
      const driverId = await seedDriver("Reporter", { onDuty: true });
      await seedFailure(driverId, "EFY-A");
      await seedFailure(driverId, "EFY-B");
      const all = await exceptionsRepo.listExceptions({ limit: 10 });
      await exceptionsRepo.resolveException("delivery_failure", all.items[0]!.id, "actor-1", "done");
      expect((await exceptionsRepo.listExceptions({ limit: 10, resolved: false })).items).toHaveLength(1);
      expect((await exceptionsRepo.listExceptions({ limit: 10, resolved: true })).items).toHaveLength(1);
      expect((await exceptionsRepo.listExceptions({ limit: 10 })).items).toHaveLength(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("duty and unassigned work", () => {
    it("⚠ counts waiting work when NOBODY is on duty", async () => {
      await seedOrderWithPackage("EFY-WAIT01", "ready_for_pickup");
      await seedOrderWithPackage("EFY-WAIT02", "ready_for_pickup");
      await seedDriver("Off Duty", { onDuty: false });

      const summary = await dutyRepo.unassignedWork();
      expect(summary.readyToCollect).toBe(2);
      expect(summary.driversOnDuty).toBe(0);
      expect(await dutyRepo.listOnDuty()).toHaveLength(0);
    });

    it("shows an on-duty driver's run progress and next stop", async () => {
      const zoneId = await seedZone();
      const driverId = await seedDriver("Working", { zoneId, onDuty: true });
      const run = await pool.query<{ id: string }>(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date)
         VALUES ($1, 'collection', 'active', current_date) RETURNING id`,
        [driverId],
      );
      const a = await seedOrderWithPackage("EFY-STOP01", "collected");
      const b = await seedOrderWithPackage("EFY-STOP02", "ready_for_pickup");
      await pool.query(
        `INSERT INTO public.collection_task (run_id, shop_fulfillment_id, shop_id, sequence, status)
         VALUES ($1, $2, $3, 0, 'collected'), ($1, $4, $5, 1, 'assigned')`,
        [run.rows[0]!.id, a.fulfillmentId, a.shopId, b.fulfillmentId, b.shopId],
      );

      const [row] = await dutyRepo.listOnDuty();
      expect(row!.driverName).toBe("Working");
      expect(row!.zone).toBe("Inner North");
      expect(row!.currentRunType).toBe("collection");
      expect(row!.completedStops).toBe(1);
      expect(row!.totalStops).toBe(2);
      expect(row!.nextStop).toBe("Shop EFY-STOP02");
      expect(row!.overdue).toBe(false);
    });

    it("flags a duty session left open past the threshold, and closes it once", async () => {
      const driverId = await seedDriver("Forgot", { onDuty: true });
      await pool.query(
        `UPDATE public.driver_duty_session SET started_at = now() - interval '20 hours' WHERE driver_id = $1`,
        [driverId],
      );
      const [row] = await dutyRepo.listOnDuty();
      expect(row!.overdue).toBe(true);

      const noop = async () => {};
      expect(await dutyRepo.endSession(row!.sessionId, noop)).toBe("ended");
      expect(await dutyRepo.endSession(row!.sessionId, noop)).toBe("already_ended");
      expect(await dutyRepo.listOnDuty()).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("history, proof and the period summary", () => {
    it("lists runs by working day and opens one to its ordered stops", async () => {
      const driverId = await seedDriver("Historic", { onDuty: false });
      const run = await pool.query<{ id: string }>(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date, completed_at)
         VALUES ($1, 'collection', 'completed', current_date, now()) RETURNING id`,
        [driverId],
      );
      const pkg = await seedOrderWithPackage("EFY-HIST01", "collected");
      const ct = await pool.query<{ id: string }>(
        `INSERT INTO public.collection_task (run_id, shop_fulfillment_id, shop_id, sequence, status)
         VALUES ($1, $2, $3, 0, 'collected') RETURNING id`,
        [run.rows[0]!.id, pkg.fulfillmentId, pkg.shopId],
      );
      await pool.query(
        `INSERT INTO public.driver_task_event (collection_task_id, status) VALUES ($1, 'assigned'), ($1, 'collected')`,
        [ct.rows[0]!.id],
      );

      const history = await historyRepo.listRuns({ driverId, limit: 10 });
      expect(history.items).toHaveLength(1);
      expect(history.items[0]!.completedStops).toBe(1);
      expect(history.items[0]!.totalStops).toBe(1);

      const detail = await historyRepo.getRunDetail(run.rows[0]!.id);
      expect(detail!.driverName).toBe("Historic");
      expect(detail!.stops).toHaveLength(1);
      expect(detail!.stops[0]!.label).toBe("Shop EFY-HIST01");
      expect(detail!.stops[0]!.timeline.map((t) => t.status)).toEqual(["assigned", "collected"]);
      expect(detail!.stops[0]!.orderReference).toBe("EFY-HIST01");
    });

    it("⚠ presigns proof media rather than returning a durable address", async () => {
      const driverId = await seedDriver("Prover", { onDuty: true });
      const pkg = await seedOrderWithPackage("EFY-PROOF1", "collected");
      const run = await pool.query<{ id: string }>(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date)
         VALUES ($1, 'same_day_delivery', 'completed', current_date) RETURNING id`,
        [driverId],
      );
      const dt = await pool.query<{ id: string }>(
        `INSERT INTO public.delivery_task (run_id, order_id, customer_address_id, sequence, status, delivered_at)
         VALUES ($1, $2, $3, 0, 'delivered', now()) RETURNING id`,
        [run.rows[0]!.id, pkg.orderId, pkg.addressId],
      );
      await pool.query(
        `INSERT INTO public.proof_of_delivery (delivery_task_id, method, media_key, note)
         VALUES ($1, 'photo', 'driver-proof/abc.jpg', 'left at door')`,
        [dt.rows[0]!.id],
      );

      const proof = await historyRepo.getProof(dt.rows[0]!.id);
      expect(proof!.method).toBe("photo");
      expect(proof!.mediaUrl).toContain("X-Amz-Expires");
      expect(proof!.capturedByDriverName).toBe("Prover");
    });

    it("⚠ counts activity and carries no money field at all", async () => {
      const driverId = await seedDriver("Counted", { onDuty: false });
      await pool.query(
        `INSERT INTO public.driver_run (driver_id, type, status, business_date)
         VALUES ($1, 'collection', 'completed', current_date),
                ($1, 'same_day_delivery', 'completed', current_date - 1)`,
        [driverId],
      );
      const summary = await historyRepo.periodSummary(
        driverId,
        new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10),
      );
      expect(summary.daysWorked).toBe(2);
      expect(summary.runsCompleted).toBe(2);
      // FR-049 — no currency anywhere in the driver domain.
      expect(JSON.stringify(summary)).not.toMatch(/amount|price|currency|total|aud/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("SC-009 — readiness surfaces the gap before an order is affected", () => {
    it("⚠ flags a driver with NO ZONE as unable to receive work", async () => {
      await seedDriver("Zoneless", { zoneId: null });
      const blocked = await readinessRepo.blockedDrivers();
      expect(blocked).toHaveLength(1);
      expect(blocked[0]!.driverName).toBe("Zoneless");
      expect(blocked[0]!.reasons).toContain("no_zone");
    });

    it("reports each blocking cause separately, so the remedy is obvious", async () => {
      const zoneId = await seedZone();
      await seedDriver("Expired", { zoneId, licenceExpires: "2020-01-01" });
      await seedDriver("Stood Down", { zoneId, status: "suspended" });

      const blocked = await readinessRepo.blockedDrivers();
      const byName = Object.fromEntries(blocked.map((b) => [b.driverName, b.reasons]));
      expect(byName["Expired"]).toEqual(["licence_expired"]);
      expect(byName["Stood Down"]).toEqual(["suspended"]);
    });

    it("⚠ the register carries the SAME flag, so the gap is visible where drivers are listed", async () => {
      await seedDriver("Zoneless", { zoneId: null });
      const page = await driversRepo.listDrivers({ limit: 10 });
      expect(page.items[0]!.blockedReasons).toContain("no_zone");
    });

    it("reports a zone with no active driver as uncovered", async () => {
      const empty = await seedZone("Empty Zone");
      const covered = await seedZone("Covered Zone");
      await seedDriver("Somebody", { zoneId: covered });
      const coverage = await readinessRepo.zoneCoverage();
      const byId = Object.fromEntries(coverage.map((z) => [z.zoneId, z.activeDrivers]));
      expect(byId[empty]).toBe(0);
      expect(byId[covered]).toBe(1);
      // Ordered emptiest-first, so the gaps sit at the top.
      expect(coverage[0]!.zoneName).toBe("Empty Zone");
    });

    it("flags an expiry inside the window and one already past, with the date", async () => {
      const zoneId = await seedZone();
      const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      await seedDriver("Soon", { zoneId, licenceExpires: soon });
      await seedDriver("Past", { zoneId, licenceExpires: "2020-01-01" });
      const expiring = await readinessRepo.expiringCredentials();
      const byName = Object.fromEntries(expiring.map((e) => [e.driverName, e]));
      expect(byName["Past"]!.expired).toBe(true);
      expect(byName["Soon"]!.expired).toBe(false);
      expect(byName["Soon"]!.expiresOn).toBe(soon);
    });

    it("does not report an offboarded driver as a gap to fix", async () => {
      await seedDriver("Gone", { zoneId: null, status: "offboarded" });
      expect(await readinessRepo.blockedDrivers()).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  describe("FR-005 — offboarded drivers are hidden by default", () => {
    it("excludes them unless asked for, and includes them when asked", async () => {
      await seedDriver("Current");
      await seedDriver("Departed", { status: "offboarded" });
      expect((await driversRepo.listDrivers({ limit: 10 })).items).toHaveLength(1);
      expect(
        (await driversRepo.listDrivers({ limit: 10, includeOffboarded: true })).items,
      ).toHaveLength(2);
      expect(
        (await driversRepo.listDrivers({ limit: 10, statuses: ["offboarded"] })).items,
      ).toHaveLength(1);
    });

    it("searches on partial name and on email", async () => {
      await seedDriver("Alexandra Chen");
      await seedDriver("Bob Smith");
      expect((await driversRepo.listDrivers({ limit: 10, q: "exandr" })).items).toHaveLength(1);
      expect((await driversRepo.listDrivers({ limit: 10, q: "bob.smith" })).items).toHaveLength(1);
      expect((await driversRepo.listDrivers({ limit: 10, q: "nobody" })).items).toHaveLength(0);
    });
  });
});
