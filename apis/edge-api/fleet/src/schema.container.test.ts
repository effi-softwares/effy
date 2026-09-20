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
import * as readinessRepo from "./readiness/repository";
import * as vehiclesRepo from "./vehicles/repository";

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
  status text NOT NULL DEFAULT 'active',
  address_line1 text, address_line2 text, suburb text,
  postcode text CHECK (postcode ~ '^[0-9]{4}$'),
  state text CHECK (state IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA'))
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
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'offboarded')),
  status_reason text,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  contact_phone text, started_on date,
  emergency_contact_name text, emergency_contact_phone text, notes text,
  licence_reference text, licence_expires_on date, licence_class text
    CHECK (licence_class IN ('C', 'LR', 'MR', 'HR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_name_trgm_idx ON public.driver USING gin (name gin_trgm_ops);
CREATE INDEX driver_register_idx ON public.driver (name, id);

CREATE TABLE public.driver_duty_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  expected_end_at timestamptz
);
CREATE UNIQUE INDEX driver_duty_session_open_uq
  ON public.driver_duty_session (driver_id) WHERE ended_at IS NULL;

-- ── 061: the vehicle register. Mirrors 20260920143000_fleet_foundations.sql exactly. ────────────
CREATE TABLE public.vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_plate text NOT NULL CHECK (btrim(registration_plate) <> ''),
  make text NOT NULL CHECK (btrim(make) <> ''),
  model text NOT NULL CHECK (btrim(model) <> ''),
  year int CHECK (year BETWEEN 1950 AND 2100),
  body_type text NOT NULL
    CHECK (body_type IN ('van','ute','truck_light','car','motorcycle','bicycle')),
  fuel_type text CHECK (fuel_type IN ('petrol','diesel','hybrid','electric','none')),
  ownership text NOT NULL DEFAULT 'effy_owned'
    CHECK (ownership IN ('effy_owned','driver_owned')),
  payload_kg int CHECK (payload_kg > 0),
  load_volume_litres int CHECK (load_volume_litres > 0),
  crate_capacity int CHECK (crate_capacity >= 0),
  can_carry_chilled boolean NOT NULL DEFAULT false,
  can_carry_frozen boolean NOT NULL DEFAULT false,
  registration_expires_on date,
  insurance_policy_reference text,
  insurance_expires_on date,
  roadworthy_expires_on date,
  odometer_km int CHECK (odometer_km >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','off_road','retired')),
  status_reason text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicle_plate_active_uq ON public.vehicle (upper(registration_plate))
  WHERE status <> 'retired';
CREATE INDEX vehicle_status_idx ON public.vehicle (status);

CREATE TABLE public.vehicle_holding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicle (id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.driver (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  odometer_start_km int CHECK (odometer_start_km >= 0),
  odometer_end_km int CHECK (odometer_end_km >= 0),
  issued_by_sub text, returned_by_sub text, note text,
  CONSTRAINT vehicle_holding_odo_ck CHECK (
    odometer_end_km IS NULL OR odometer_start_km IS NULL OR odometer_end_km >= odometer_start_km
  ),
  CONSTRAINT vehicle_holding_period_ck CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- ⚠ THE TWO INDEXES THAT ARE FR-012 AND FR-013.
CREATE UNIQUE INDEX vehicle_holding_open_vehicle_uq
  ON public.vehicle_holding (vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX vehicle_holding_open_driver_uq
  ON public.vehicle_holding (driver_id) WHERE ended_at IS NULL;
CREATE INDEX vehicle_holding_vehicle_idx ON public.vehicle_holding (vehicle_id);
CREATE INDEX vehicle_holding_driver_idx ON public.vehicle_holding (driver_id);

CREATE TABLE public.order_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public."order" (id)
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
      TRUNCATE public.vehicle_holding, public.vehicle, public.driver_duty_session,
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
            SET contact_phone = '0400 111 222', licence_class = 'C',
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
          licenceClass: null,
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
      // ⚠ `vehicle.plate` is no longer a driver column at all — it is derived from the open holding
      // (061). Null here means "holds no vehicle", which is the correct answer for this driver.
      expect(after!.vehicle.plate).toBeNull();
      expect(after!.credentials.licenceClass).toBeNull();
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

    it("shows an on-duty driver with their zone, and no work attached to them", async () => {
      // ⚠ THE ASSERTION THAT USED TO BE HERE WAS ABOUT RUN PROGRESS — which run, stops done, next
      // stop — and it went with the work model. What is left is the honest shape of the screen
      // today: a named driver, on duty, in a zone, doing nothing, while the backlog below them
      // grows. Asserting the absence rather than deleting the case keeps a record that this screen
      // is CORRECT and the platform is not, which is the opposite of the usual reading.
      const zoneId = await seedZone();
      await seedDriver("Working", { zoneId, onDuty: true });
      await seedOrderWithPackage("EFY-STOP02", "ready_for_pickup");

      const [row] = await dutyRepo.listOnDuty();
      expect(row!.driverName).toBe("Working");
      expect(row!.zone).toBe("Inner North");
      expect(row!.overdue).toBe(false);
      expect(await dutyRepo.unassignedWork()).toMatchObject({
        readyToCollect: 1,
        driversOnDuty: 1,
      });
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
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 061 — the vehicle register and holdings, against real PostgreSQL.
  //
  // ⚠ THIS IS WHERE THIS SLICE IS ACTUALLY PROVEN. Its correctness lives almost entirely in the
  // schema — two partial unique indexes, a CHECK, a case-insensitive partial index — and a mocked
  // repository test cannot observe any of it. 056's own concurrency-token defect typechecked
  // perfectly, passed every mocked test, and would have made EVERY edit fail; only the container
  // test found it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════

  async function seedVehicle(
    plate: string,
    opts: { status?: string; chilled?: boolean; frozen?: boolean; regExpires?: string; odo?: number } = {},
  ): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.vehicle
         (registration_plate, make, model, body_type, status, can_carry_chilled, can_carry_frozen,
          registration_expires_on, odometer_km)
       VALUES ($1, 'Toyota', 'HiAce', 'van', $2, $3, $4, $5, $6) RETURNING id`,
      [plate, opts.status ?? "active", opts.chilled ?? false, opts.frozen ?? false, opts.regExpires ?? null, opts.odo ?? null],
    );
    return r.rows[0]!.id;
  }

  describe("061 C1/C2 — the two exclusion rules, PROVEN UNDER CONCURRENCY", () => {
    /**
     * ⚠ THE SINGLE MOST IMPORTANT TEST IN THIS SLICE.
     *
     * FR-012 is a concurrency claim, and the design's whole argument is that a service-level
     * read-then-write cannot make it true. Both inserts are issued WITHOUT awaiting the first, so
     * they genuinely race; exactly one must survive and the other must be refused BY THE DATABASE.
     */
    it("⚠ C1 — two CONCURRENT issues of ONE VEHICLE: exactly one succeeds", async () => {
      const v = await seedVehicle("EFY-C1");
      const a = await seedDriver("Alpha One");
      const b = await seedDriver("Bravo One");

      const results = await Promise.allSettled([
        pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, a]),
        pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, b]),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect((rejected.reason as { constraint?: string }).constraint).toBe("vehicle_holding_open_vehicle_uq");

      const open = await pool.query(
        `SELECT 1 FROM public.vehicle_holding WHERE vehicle_id = $1 AND ended_at IS NULL`, [v],
      );
      expect(open.rowCount).toBe(1);
    });

    /** ⚠ C2 — the mirror of C1 on the other axis (FR-013). One driver, two vehicles, at once. */
    it("⚠ C2 — two CONCURRENT issues to ONE DRIVER: exactly one succeeds", async () => {
      const d = await seedDriver("Charlie Two");
      const v1 = await seedVehicle("EFY-C2A");
      const v2 = await seedVehicle("EFY-C2B");

      const results = await Promise.allSettled([
        pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v1, d]),
        pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v2, d]),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect((rejected.reason as { constraint?: string }).constraint).toBe("vehicle_holding_open_driver_uq");
    });

    /** ⚠ C6 — returning frees BOTH sides. If it freed only one, the other axis would deadlock the
     *  fleet after a single shift and nothing would say why. */
    it("C6 — returning a holding frees both the vehicle and the driver", async () => {
      const v = await seedVehicle("EFY-C6");
      const d = await seedDriver("Delta Six");
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, d]);
      await pool.query(
        `UPDATE public.vehicle_holding SET ended_at = now() WHERE vehicle_id = $1 AND ended_at IS NULL`, [v],
      );

      const other = await seedDriver("Echo Six");
      const v2 = await seedVehicle("EFY-C6B");
      await expect(
        pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, other]),
      ).resolves.toBeDefined();
      await expect(
        pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v2, d]),
      ).resolves.toBeDefined();
    });
  });

  describe("061 C3/C4/C5 — schema rules a mocked test cannot see", () => {
    /** ⚠ C3 — FR-018 is enforced by the DATABASE, so it holds for every writer including one nobody
     *  has written yet. If it were a service check, the next caller would have to remember it. */
    it("C3 — a closing odometer below the opening is refused by the database", async () => {
      const v = await seedVehicle("EFY-C3");
      const d = await seedDriver("Foxtrot Three");
      const h = await pool.query<{ id: string }>(
        `INSERT INTO public.vehicle_holding (vehicle_id, driver_id, odometer_start_km)
         VALUES ($1, $2, 50000) RETURNING id`, [v, d],
      );
      await expect(
        pool.query(`UPDATE public.vehicle_holding SET ended_at = now(), odometer_end_km = 49999 WHERE id = $1`,
          [h.rows[0]!.id]),
      ).rejects.toMatchObject({ constraint: "vehicle_holding_odo_ck" });

      await expect(
        pool.query(`UPDATE public.vehicle_holding SET ended_at = now(), odometer_end_km = 50000 WHERE id = $1`,
          [h.rows[0]!.id]),
      ).resolves.toBeDefined();
    });

    /**
     * ⚠ C4 — plate uniqueness is scoped to NON-RETIRED, and the second half is the point. A retired
     * van's plate can be legitimately reissued by the state years later; a blanket unique index
     * would refuse a REAL vehicle because of a record Effy keeps only for history.
     */
    it("C4 — a duplicate plate is refused, and the SAME plate is accepted once the first is retired", async () => {
      const first = await seedVehicle("EFY-C4");
      await expect(seedVehicle("EFY-C4")).rejects.toMatchObject({ constraint: "vehicle_plate_active_uq" });

      await pool.query(`UPDATE public.vehicle SET status = 'retired' WHERE id = $1`, [first]);
      await expect(seedVehicle("EFY-C4")).resolves.toBeDefined();
    });

    /** ⚠ C5 — `abc123` and `ABC123` are the same plate to everyone except a database. */
    it("C5 — plate uniqueness is case-insensitive", async () => {
      await seedVehicle("efy-c5");
      await expect(seedVehicle("EFY-C5")).rejects.toMatchObject({ constraint: "vehicle_plate_active_uq" });
    });

    /** ⚠ C7 — retiring must not destroy history. The record is why the vehicle is kept at all. */
    it("C7 — retiring a vehicle leaves its holding history readable", async () => {
      const v = await seedVehicle("EFY-C7");
      const d = await seedDriver("Golf Seven");
      await pool.query(
        `INSERT INTO public.vehicle_holding (vehicle_id, driver_id, odometer_start_km) VALUES ($1, $2, 10)`, [v, d],
      );
      await pool.query(`UPDATE public.vehicle_holding SET ended_at = now(), odometer_end_km = 99 WHERE vehicle_id = $1`, [v]);
      await pool.query(`UPDATE public.vehicle SET status = 'retired' WHERE id = $1`, [v]);

      const history = await vehiclesRepo.listHoldings(v);
      expect(history).toHaveLength(1);
      expect(history[0]!.driverName).toBe("Golf Seven");
      expect(history[0]!.odometerEndKm).toBe(99);
    });

    /** Compliance is DERIVED, so a date that lapsed overnight is reported without anything running. */
    it("reports each lapsed compliance item by name, and reports none when dates are unset", async () => {
      await seedVehicle("EFY-CMP1", { regExpires: "2020-01-01" });
      await seedVehicle("EFY-CMP2");

      const { items } = await vehiclesRepo.listVehicles({});
      const lapsed = items.find((i) => i.registrationPlate === "EFY-CMP1");
      const unset = items.find((i) => i.registrationPlate === "EFY-CMP2");
      expect(lapsed!.complianceIssues).toEqual(["registration_expired"]);
      // ⚠ A NULL expiry is NOT a lapse — nobody has supplied the date yet, which is ordinary.
      expect(unset!.complianceIssues).toEqual([]);
    });
  });

  describe("061 C8/C9/C10 — every blocking reason, stated and complete", () => {
    /**
     * ⚠ C8 — FR-026. EVERY applicable reason, not the first one found.
     *
     * The remedy differs per reason, so a first-match list sends an operator to fix the wrong thing
     * and then wonder why the driver still cannot work.
     */
    it("⚠ C8 — emits EVERY applicable reason at once, not just the first", async () => {
      // Suspended AND no zone AND licence expired AND no vehicle: four causes, one driver.
      const id = await seedDriver("Hotel Eight", {
        zoneId: null,
        status: "suspended",
        licenceExpires: "2020-01-01",
      });
      const d = await driversRepo.getDriver(id);
      expect(new Set(d!.blockedReasons)).toEqual(
        new Set(["suspended", "no_zone", "licence_expired", "no_vehicle"]),
      );
    });

    /** ⚠ C9 — SC-005. Proven by CAUSING it, not by asserting the rule exists. */
    it("⚠ C9 — an expired licence is reported, and the reason names the licence", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("India Nine", { zoneId, licenceExpires: "2020-01-01" });
      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toContain("licence_expired");
    });

    /**
     * ⚠ C10 — the reason must name the VEHICLE's problem, not the driver's.
     *
     * This driver is faultless: active, zoned, licensed, holding a van. The van's registration has
     * lapsed. Reporting that as a problem with the person would send an operator to the wrong place.
     */
    it("⚠ C10 — a holder of a non-compliant vehicle is blocked, and NOT for a licence reason", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("Juliet Ten", { zoneId, licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-C10", { regExpires: "2020-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, id]);

      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toContain("vehicle_non_compliant");
      expect(d!.blockedReasons).not.toContain("no_vehicle");
      expect(d!.blockedReasons).not.toContain("licence_expired");
    });

    /** The happy path, asserted because FR-028 says an unblocked driver appears NOWHERE. */
    it("⚠ reports NO reasons for a driver who can actually work", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("Kilo Clean", { zoneId, licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-OK", { regExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, id]);

      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toEqual([]);
    });

    /** ⚠ An off-road vehicle blocks its holder too — the van is in a workshop, not on the road. */
    it("treats an off-road vehicle as non-compliant for its holder", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("Lima Offroad", { zoneId, licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-OFF", { status: "off_road", regExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, id]);

      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toContain("vehicle_non_compliant");
    });
  });

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

      // ⚠ 061 WIDENED THIS, AND THE WIDENING IS CORRECT RATHER THAN A REGRESSION. Both of these
      // drivers now also hold no vehicle, which is a real reason they cannot be given work — it was
      // simply unrepresentable before vehicles existed. The assertion moved from `toEqual` to naming
      // the cause it is about, because pinning an EXACT list here would mean every future reason
      // breaks a test that is not about it.
      expect(byName["Expired"]).toContain("licence_expired");
      expect(byName["Stood Down"]).toContain("suspended");
      expect(byName["Expired"]).toContain("no_vehicle");
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
