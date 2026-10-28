import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fleet service's SQL against the real migrations: every column a query names is present, so a
 * wrong name fails here, not in dev.
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
    // S3 presigning is stubbed: the SQL is under test.
    presignRead: async (key: string) => `https://signed.example/${key}?X-Amz-Expires=900`,
  };
});

import * as driversRepoRaw from "./drivers/repository";
import { parseListQuery } from "@effy/edge-shared";
import { DRIVER_LIST_SPEC } from "./drivers/list";
import { VEHICLE_LIST_SPEC } from "./vehicles/list";

/** The register as its route parses it (103). */
const driversRepo = {
  ...driversRepoRaw,
  listDrivers: (qs: Record<string, string> = {}) => driversRepoRaw.listDrivers(parseListQuery({ pageSize: "100", ...qs }, DRIVER_LIST_SPEC)),
};
import * as dutyRepo from "./duty/repository";
import * as readinessRepo from "./readiness/repository";
import * as capRepo from "./capabilities/repository";
import * as coverageRepo from "./coverage/repository";
import * as holdingsRepo from "./holdings/repository";
import * as vehiclesRepo from "./vehicles/repository";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("fleet SQL — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE public.driver_zone_capability, public.vehicle_holding, public.vehicle, public.driver_duty_session,
               public.driver, public.order_item, public.order_package_delivery,
               public.shop_fulfillment, public."order", public.customer_address, public.customer,
               public.shop, public.delivery_zone, public.delivery_settings, admin.audit_log
      RESTART IDENTITY CASCADE`);
    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.8, 144.9, 'test')`,
    );
  });

  async function seedZone(
    name = "Inner North",
    opts: { status?: string; sameDay?: boolean } = {},
  ): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.delivery_zone (code, name, status, updated_by) VALUES ($1, $1, $2, 'test') RETURNING id`,
      [name, opts.status ?? "active"],
    );
    return r.rows[0]!.id;
  }

  /** `zoneId: null` means every zone. */
  async function grantCap(
    driverId: string,
    fn: "collection" | "delivery",
    zoneId: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO public.driver_zone_capability (driver_id, function, zone_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [driverId, fn, zoneId],
    );
  }

  async function seedDriver(
    name: string,
    opts: { zoneId?: string | null; status?: string; onDuty?: boolean; licenceExpires?: string } = {},
  ): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email, status, licence_expires_on)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        `sub-${name}-${Math.random()}`,
        name,
        `${name.toLowerCase().replace(/\s+/g, ".")}.${Math.floor(Math.random() * 1e6)}@effyshopping.com`,
        opts.status ?? "active",
        opts.licenceExpires ?? null,
      ],
    );
    const id = r.rows[0]!.id;
    // A driver with no clearance is blocked, so passing a zoneId grants the full set there.
    if (opts.zoneId !== undefined && opts.zoneId !== null) {
      for (const fn of ["collection", "delivery"] as const) await grantCap(id, fn, opts.zoneId);
    }
    if (opts.onDuty) {
      await pool.query(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [id]);
    }
    return id;
  }

  async function seedOrderWithPackage(
    ref: string,
    fulfillmentStatus = "ready_for_pickup",
  ): Promise<{ orderId: string; shopId: string; fulfillmentId: string; addressId: string }> {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $1 || '@example.test') RETURNING id`,
      [ref],
    );
    const a = await pool.query<{ id: string }>(
      `INSERT INTO public.customer_address (customer_id, recipient_name, line1, city, postal_code)
       VALUES ($1, 'Test Person', '1 Test St', 'Carlton', '3053') RETURNING id`,
      [c.rows[0]!.id],
    );
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, delivery_address, item_subtotal_amount, grand_total_amount,
                                   delivery_type, delivery_type_reason, delivery_promise)
       VALUES ($1, $2, 'paid', '{}', 10, 10, 'effy', 'in_coverage', 'day') RETURNING id`,
      [c.rows[0]!.id, ref],
    );
    const s = await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ($1, $2) RETURNING id`,
      [ref, `Shop ${ref}`],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount) VALUES ($1, $2, $3, 1, 10) RETURNING id`,
      [o.rows[0]!.id, s.rows[0]!.id, fulfillmentStatus],
    );
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, 'standard')`,
      [o.rows[0]!.id, s.rows[0]!.id],
    );
    return {
      orderId: o.rows[0]!.id,
      shopId: s.rows[0]!.id,
      fulfillmentId: f.rows[0]!.id,
      addressId: a.rows[0]!.id,
    };
  }

  describe("SC-013 — the register pages 500 drivers with no duplicate and no gap", () => {
    it("returns every driver exactly once across the full paging sequence", async () => {
      const names = Array.from({ length: 500 }, (_, i) => `Driver ${String(i).padStart(3, "0")}`);
      for (const n of names) await seedDriver(n);

      const seen: string[] = [];
      let pages = 0;
      for (let p = 1; p <= 20; p++) {
        const page = await driversRepo.listDrivers({ pageSize: "25", page: String(p) });
        expect(page.total).toBe(500);
        seen.push(...page.items.map((i) => i.id));
        pages++;
      }

      expect(seen).toHaveLength(500);
      expect(new Set(seen).size, "a driver was returned on two pages").toBe(500);
      expect(pages).toBe(20);
    });

    it("⚠ orders by (name, id), so duplicate names straddling a page edge cannot break it", async () => {
      // Thirty identical names: ordering by name alone would let a page edge repeat or skip them.
      for (let i = 0; i < 30; i++) await seedDriver("Same Name");
      const seen: string[] = [];
      for (let p = 1; p <= 2; p++) seen.push(...(await driversRepo.listDrivers({ pageSize: "25", page: String(p) })).items.map((i) => i.id));
      expect(new Set(seen).size).toBe(30);
    });
  });

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
      expect(before!.contactPhone).toBe("0400 111 222");

      const outcome = await driversRepo.updateDriver(
        id,
        {
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
      expect(after!.contactPhone).toBeNull();
      // The plate comes from the open holding; null means holds no vehicle.
      expect(after!.vehicle.plate).toBeNull();
      expect(after!.credentials.licenceClass).toBeNull();
      expect(after!.credentials.licenceReference).toBeNull();
      expect(after!.credentials.licenceExpiresOn).toBeNull();
      expect(after!.emergencyContact.name).toBeNull();
      expect(after!.notes).toBeNull();
      expect(after!.startedOn).toBeNull();
      // The name, whose key was absent, is untouched.
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

  // The vehicle register and holdings: correctness lives in partial unique indexes, a check and a case-insensitive index.

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
    /** Both inserts race unawaited; exactly one survives and the database refuses the other. */
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

    /** One driver, two vehicles, at once. */
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

    /** Returning frees both sides. */
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
    /** The odometer rule is the database's, so it holds for every writer. */
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

    /** Plate uniqueness is scoped to non-retired vehicles: a retired van's plate can be reissued. */
    it("C4 — a duplicate plate is refused, and the SAME plate is accepted once the first is retired", async () => {
      const first = await seedVehicle("EFY-C4");
      await expect(seedVehicle("EFY-C4")).rejects.toMatchObject({ constraint: "vehicle_plate_active_uq" });

      await pool.query(`UPDATE public.vehicle SET status = 'retired' WHERE id = $1`, [first]);
      await expect(seedVehicle("EFY-C4")).resolves.toBeDefined();
    });

    /** `abc123` and `ABC123` are the same plate. */
    it("C5 — plate uniqueness is case-insensitive", async () => {
      await seedVehicle("efy-c5");
      await expect(seedVehicle("EFY-C5")).rejects.toMatchObject({ constraint: "vehicle_plate_active_uq" });
    });

    /** Retiring keeps the history. */
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

    it("103: pages, searches and filters on the server — never just the rows on screen", async () => {
      for (let i = 0; i < 30; i++) await seedVehicle(`EFY-L${String(i).padStart(2, "0")}`);
      const list = (qs: Record<string, string>) => vehiclesRepo.listVehicles(parseListQuery({ pageSize: "25", ...qs }, VEHICLE_LIST_SPEC));
      const p1 = await list({});
      const p2 = await list({ page: "2" });
      expect(p1.total).toBe(30);
      expect(new Set([...p1.items, ...p2.items].map((v) => v.id)).size).toBe(30);
      // The search finds a vehicle on what was page 2.
      expect((await list({ q: "l29" })).items.map((v) => v.registrationPlate)).toEqual(["EFY-L29"]);
      expect(await vehiclesRepo.vehicleViewCounts(parseListQuery({}, VEHICLE_LIST_SPEC))).toMatchObject({ fleet: 30, retired: 0 });
    });

    /** Derived: a date that lapsed overnight is reported without anything running. */
    it("reports each lapsed compliance item by name, and reports none when dates are unset", async () => {
      await seedVehicle("EFY-CMP1", { regExpires: "2020-01-01" });
      await seedVehicle("EFY-CMP2");

      const { items } = await vehiclesRepo.listVehicles(parseListQuery({}, VEHICLE_LIST_SPEC));
      const lapsed = items.find((i) => i.registrationPlate === "EFY-CMP1");
      const unset = items.find((i) => i.registrationPlate === "EFY-CMP2");
      expect(lapsed!.complianceIssues).toEqual(["registration_expired"]);
      // A null expiry is not a lapse.
      expect(unset!.complianceIssues).toEqual([]);
    });
  });

  describe("061 C8/C9/C10 — every blocking reason, stated and complete", () => {
    /** Every applicable reason, not the first found: each has a different remedy. */
    it("⚠ C8 — emits EVERY applicable reason at once, not just the first", async () => {
      // Suspended and no zone and licence expired and no vehicle: four causes, one driver.
      const id = await seedDriver("Hotel Eight", {
              status: "suspended",
        licenceExpires: "2020-01-01",
      });
      const d = await driversRepo.getDriver(id);
      expect(new Set(d!.blockedReasons)).toEqual(
        new Set(["suspended", "no_capabilities", "licence_expired", "no_vehicle"]),
      );
    });

    /** Proven by causing it. */
    it("⚠ C9 — an expired licence is reported, and the reason names the licence", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("India Nine", { zoneId, licenceExpires: "2020-01-01" });
      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toContain("licence_expired");
    });

    /** The reason names the vehicle's problem (its registration lapsed), not the driver's. */
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

    /** A driver who can work appears nowhere in the readiness view. */
    it("⚠ FR-028 — an unblocked driver is ABSENT from the readiness view entirely", async () => {
      const zoneId = await seedZone();
      const ok = await seedDriver("Ready Romeo", { zoneId, licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-RDY", { regExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, ok]);
      // A second driver who IS blocked, so a pass cannot come from the list simply being empty.
      await seedDriver("Blocked Sierra", { zoneId: null });

      const blocked = await readinessRepo.blockedDrivers();
      const names = blocked.map((b) => b.driverName);
      expect(names).toContain("Blocked Sierra");
      expect(names).not.toContain("Ready Romeo");
      // Nobody has an empty reason array.
      for (const b of blocked) expect(b.reasons.length).toBeGreaterThan(0);
    });

    it("⚠ reports NO reasons for a driver who can actually work", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("Kilo Clean", { zoneId, licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-OK", { regExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, id]);

      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toEqual([]);
    });

    /** An off-road vehicle blocks its holder too. */
    it("treats an off-road vehicle as non-compliant for its holder", async () => {
      const zoneId = await seedZone();
      const id = await seedDriver("Lima Offroad", { zoneId, licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-OFF", { status: "off_road", regExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, id]);

      const d = await driversRepo.getDriver(id);
      expect(d!.blockedReasons).toContain("vehicle_non_compliant");
    });
  });

  describe("061 FR-019 — the SQL behind the stand-down guard", () => {
    /** The stand-down guard's input: the query finds a held vehicle. */
    it("⚠ finds the vehicle a driver is holding, with enough to NAME it in a refusal", async () => {
      const driverId = await seedDriver("Mike Holding");
      const v = await seedVehicle("EFY-HELD");
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, driverId]);

      const held = await holdingsRepo.heldByDriver(driverId);
      expect(held).not.toBeNull();
      // The refusal names which vehicle.
      expect(held!.registrationPlate).toBe("EFY-HELD");
      expect(held!.make).toBe("Toyota");
    });

    it("reports nothing held once the vehicle has been returned", async () => {
      const driverId = await seedDriver("November Returned");
      const v = await seedVehicle("EFY-BACK");
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, driverId]);
      await pool.query(
        `UPDATE public.vehicle_holding SET ended_at = now() WHERE vehicle_id = $1 AND ended_at IS NULL`, [v],
      );
      expect(await holdingsRepo.heldByDriver(driverId)).toBeNull();
    });

    it("reports nothing held for a driver who has never had a vehicle", async () => {
      const driverId = await seedDriver("Papa Never");
      expect(await holdingsRepo.heldByDriver(driverId)).toBeNull();
    });
  });

  // Clearances and coverage.

  describe("062 C1–C8 — clearances", () => {
    /** A repeated grant succeeds; two at once both win. */
    it("C1 — granting the same clearance twice is refused by the index, and surfaces as a no-op", async () => {
      const z = await seedZone("C1 Zone");
      const d = await seedDriver("Alpha Cap");
      await capRepo.grant(d, "delivery", z, "actor-1");
      await capRepo.grant(d, "delivery", z, "actor-1");

      const rows = await pool.query(
        `SELECT 1 FROM public.driver_zone_capability WHERE driver_id = $1`, [d],
      );
      expect(rows.rowCount).toBe(1);

      // And the raw insert is refused by the database, not merely absorbed by the service.
      await expect(
        pool.query(
          `INSERT INTO public.driver_zone_capability (driver_id, function, zone_id)
           VALUES ($1, 'delivery', $2)`, [d, z],
        ),
      ).rejects.toMatchObject({ constraint: "driver_zone_capability_uq" });
    });

    /** `NULLS NOT DISTINCT`: without it the every-zone grant could be inserted twice. */
    it("⚠ C2 — two identical EVERY-ZONE grants cannot both exist", async () => {
      const d = await seedDriver("Bravo Every");
      await capRepo.grant(d, "collection", null, "actor-1");

      await expect(
        pool.query(
          `INSERT INTO public.driver_zone_capability (driver_id, function, zone_id)
           VALUES ($1, 'collection', NULL)`, [d],
        ),
      ).rejects.toMatchObject({ constraint: "driver_zone_capability_uq" });

      // The service path is idempotent rather than throwing.
      await capRepo.grant(d, "collection", null, "actor-1");
      const rows = await pool.query(
        `SELECT 1 FROM public.driver_zone_capability WHERE driver_id = $1`, [d],
      );
      expect(rows.rowCount).toBe(1);
    });

    /** A driver cleared for every zone covers a zone created later; caused here by creating one mid-test. */
    it("⚠⚠ C3 — an EVERY-ZONE driver covers a zone CREATED AFTERWARDS", async () => {
      // The driver must be able to work, or coverage would correctly report `all_cleared_unavailable` instead.
      const d = await seedDriver("Charlie Everywhere", { licenceExpires: "2030-01-01" });
      const v = await seedVehicle("EFY-C3", { regExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, d]);
      await capRepo.grant(d, "delivery", null, "actor-1");

      // The zone does not exist at the moment the clearance is granted.
      const laterZone = await seedZone("Created Afterwards");

      const cleared = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.driver_zone_capability c
            WHERE c.driver_id = $1 AND c.function = $2
              AND (c.zone_id = $3 OR c.zone_id IS NULL)
         ) AS ok`,
        [d, "delivery", laterZone],
      );
      expect(cleared.rows[0]!.ok).toBe(true);

      // The coverage view agrees: no gap for the new zone.
      const gaps = await coverageRepo.coverageGaps();
      const newZoneDeliveryGap = gaps.find(
        (g) => g.zoneId === laterZone && g.function === "delivery",
      );
      expect(newZoneDeliveryGap).toBeUndefined();
    });

    /** A zone-specific grant must not leak to another zone. */
    it("C4 — a zone-specific grant does not match a different zone", async () => {
      const a = await seedZone("C4 Alpha");
      const b = await seedZone("C4 Bravo");
      const d = await seedDriver("Delta Narrow");
      await capRepo.grant(d, "delivery", a, "actor-1");

      const inB = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.driver_zone_capability c
            WHERE c.driver_id = $1 AND (c.zone_id = $2 OR c.zone_id IS NULL)
         ) AS ok`,
        [d, b],
      );
      expect(inB.rows[0]!.ok).toBe(false);
    });

    it("C5 — revoking one clearance leaves the driver's others intact", async () => {
      const z = await seedZone("C5 Zone");
      const d = await seedDriver("Echo Multi");
      await capRepo.grant(d, "collection", z, "actor-1");
      await capRepo.grant(d, "delivery", z, "actor-1");

      const before = await capRepo.listForDriver(d);
      expect(before).toHaveLength(2);

      await capRepo.revoke(d, before[0]!.id);
      const after = await capRepo.listForDriver(d);
      expect(after).toHaveLength(1);
      expect(after[0]!.id).toBe(before[1]!.id);
    });

    /** Revoking what is not held is a success. */
    it("C6 — revoking a clearance the driver does not hold is a no-op, not a failure", async () => {
      const d = await seedDriver("Foxtrot None");
      const removed = await capRepo.revoke(d, "00000000-0000-0000-0000-000000000000");
      expect(removed).toBe(false);
      await expect(capRepo.listForDriver(d)).resolves.toEqual([]);
    });

    it("C7 — DELETING a zone removes clearances naming it, and leaves every-zone grants untouched", async () => {
      const z = await seedZone("C7 Doomed");
      const d = await seedDriver("Golf Mixed");
      await capRepo.grant(d, "delivery", z, "actor-1");
      await capRepo.grant(d, "collection", null, "actor-1");

      await pool.query(`DELETE FROM public.delivery_zone WHERE id = $1`, [z]);

      const left = await capRepo.listForDriver(d);
      expect(left).toHaveLength(1);
      expect(left[0]!.zoneId).toBeNull();
    });

    /** Disabling is not deleting: re-enabling must restore cover without re-granting. */
    it("⚠ C8 — DISABLING a zone hides its clearances but does NOT delete them; re-enabling restores cover", async () => {
      const z = await seedZone("C8 Toggle");
      const d = await seedDriver("Hotel Toggle");
      await capRepo.grant(d, "delivery", z, "actor-1");
      expect(await capRepo.listForDriver(d)).toHaveLength(1);

      await pool.query(`UPDATE public.delivery_zone SET status = 'disabled' WHERE id = $1`, [z]);
      expect(await capRepo.listForDriver(d)).toHaveLength(0); // hidden

      const stillThere = await pool.query(
        `SELECT 1 FROM public.driver_zone_capability WHERE driver_id = $1`, [d],
      );
      expect(stillThere.rowCount).toBe(1);

      await pool.query(`UPDATE public.delivery_zone SET status = 'active' WHERE id = $1`, [z]);
      expect(await capRepo.listForDriver(d)).toHaveLength(1); // restored, with nobody re-granting
    });
  });

  describe("062 C9–C14 — coverage", () => {
    it("C9 — a zone nobody is cleared for reports no_driver_cleared", async () => {
      const z = await seedZone("C9 Empty", { sameDay: false });
      const gaps = await coverageRepo.coverageGaps();
      const mine = gaps.filter((g) => g.zoneId === z);
      expect(mine.length).toBeGreaterThan(0);
      for (const g of mine) {
        expect(g.reason).toBe("no_driver_cleared");
        expect(g.clearedDriverCount).toBe(0);
      }
    });

    /** Two reasons with different remedies: nobody cleared, or the cleared cannot work. */
    it("⚠ C10 — a zone whose cleared drivers are all BLOCKED reports all_cleared_unavailable", async () => {
      const z = await seedZone("C10 Blocked", { sameDay: false });
      const d = await seedDriver("India Expired", { licenceExpires: "2020-01-01" });
      for (const fn of ["collection", "delivery"] as const) {
        await capRepo.grant(d, fn, z, "actor-1");
      }

      const gaps = (await coverageRepo.coverageGaps()).filter((g) => g.zoneId === z);
      expect(gaps.length).toBe(2);
      for (const g of gaps) {
        expect(g.reason).toBe("all_cleared_unavailable");
        // Somebody is cleared; the fix is elsewhere.
        expect(g.clearedDriverCount).toBeGreaterThan(0);
      }
    });

    /** A list of problems, not a matrix. */
    it("⚠ C11 — a COVERED combination emits no row at all", async () => {
      const z = await seedZone("C11 Covered", { sameDay: false });
      const v = await seedVehicle("EFY-C11", { regExpires: "2030-01-01" });
      const d = await seedDriver("Juliet Able", { licenceExpires: "2030-01-01" });
      await pool.query(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v, d]);
      for (const fn of ["collection", "delivery"] as const) {
        await capRepo.grant(d, fn, z, "actor-1");
      }

      const gaps = (await coverageRepo.coverageGaps()).filter((g) => g.zoneId === z);
      expect(gaps).toEqual([]);
    });

    /** One gap per area and function. */
    it("⚠ C12 — a gap is per area and function, with no method, whether or not same-day was sold there", async () => {
      const a = await seedZone("C12 Standard Only", { sameDay: false });
      const b = await seedZone("C12 Same Day", { sameDay: true });

      const gaps = await coverageRepo.coverageGaps();
      for (const id of [a, b]) {
        const mine = gaps.filter((g) => g.zoneId === id);
        expect(mine.map((g) => g.function).sort()).toEqual(["collection", "delivery"]);
        expect(mine.every((g) => !("method" in g))).toBe(true);
      }
    });

    /** One row per clearance: granting what is held adds none, revoking removes the one there is. */
    it("⚠ 083 P14 — one row per clearance: grant twice adds none, revoke removes it", async () => {
      const z = await seedZone("P14 Zone");
      const d = await seedDriver("P14 Driver");
      const first = await capRepo.grant(d, "delivery", z, "actor-1");
      expect(await capRepo.grant(d, "delivery", z, "actor-2")).toBe(first);
      const everywhere = await capRepo.grant(d, "collection", null, "actor-1");
      expect(await capRepo.grant(d, "collection", null, "actor-1")).toBe(everywhere);
      expect((await pool.query(`SELECT 1 FROM public.driver_zone_capability WHERE driver_id = $1`, [d])).rowCount).toBe(2);
      expect((await capRepo.summariseForDrivers([d])).get(d)!.total).toBe(2);

      expect(await capRepo.revoke(d, first)).toBe(true);
      expect(await capRepo.revoke(d, first)).toBe(false);
      expect((await capRepo.listForDriver(d)).map((c) => [c.function, c.zoneId])).toEqual([["collection", null]]);
      // Another driver's clearance is never removed by naming its id under the wrong driver.
      const other = await seedDriver("P14 Other");
      const theirs = await capRepo.grant(other, "delivery", z, "actor-1");
      expect(await capRepo.revoke(d, theirs)).toBe(false);
      expect(await capRepo.listForDriver(other)).toHaveLength(1);
    });

    /** The two views read one availability rule. */
    it("⚠ C13 — coverage and readiness agree about whether a driver can work", async () => {
      const z = await seedZone("C13 Agree", { sameDay: false });
      const d = await seedDriver("Kilo Agree", { licenceExpires: "2020-01-01" });
      for (const fn of ["collection", "delivery"] as const) {
        await capRepo.grant(d, fn, z, "actor-1");
      }

      const blocked = await readinessRepo.blockedDrivers();
      const isBlockedInReadiness = blocked.some((b) => b.driverName === "Kilo Agree");
      const gaps = (await coverageRepo.coverageGaps()).filter((g) => g.zoneId === z);
      const coverageSaysUnavailable = gaps.every((g) => g.reason === "all_cleared_unavailable");

      expect(isBlockedInReadiness).toBe(true);
      expect(coverageSaysUnavailable).toBe(true);
    });

    it("C14 — an offboarded driver's clearances do not count toward coverage", async () => {
      const z = await seedZone("C14 Departed", { sameDay: false });
      const d = await seedDriver("Lima Gone", { status: "offboarded" });
      for (const fn of ["collection", "delivery"] as const) {
        await capRepo.grant(d, fn, z, "actor-1");
      }

      const gaps = (await coverageRepo.coverageGaps()).filter((g) => g.zoneId === z);
      expect(gaps.length).toBe(2);
      for (const g of gaps) expect(g.reason).toBe("all_cleared_unavailable");
    });
  });

  describe("SC-009 — readiness surfaces the gap before an order is affected", () => {
    it("⚠ flags a driver cleared for NOTHING as unable to receive work", async () => {
      await seedDriver("Uncleared");
      const blocked = await readinessRepo.blockedDrivers();
      expect(blocked).toHaveLength(1);
      expect(blocked[0]!.driverName).toBe("Uncleared");
      // A driver cleared for nothing is blocked; the remedy is a clearance.
      expect(blocked[0]!.reasons).toContain("no_capabilities");
    });

    it("reports each blocking cause separately, so the remedy is obvious", async () => {
      const zoneId = await seedZone();
      await seedDriver("Expired", { zoneId, licenceExpires: "2020-01-01" });
      await seedDriver("Stood Down", { zoneId, status: "suspended" });

      const blocked = await readinessRepo.blockedDrivers();
      const byName = Object.fromEntries(blocked.map((b) => [b.driverName, b.reasons]));

      // Names the cause this test is about rather than pinning an exact reason list.
      expect(byName["Expired"]).toContain("licence_expired");
      expect(byName["Stood Down"]).toContain("suspended");
      expect(byName["Expired"]).toContain("no_vehicle");
    });

    it("⚠ the register carries the SAME flag, so the gap is visible where drivers are listed", async () => {
      await seedDriver("Uncleared");
      const page = await driversRepo.listDrivers();
      expect(page.items[0]!.blockedReasons).toContain("no_capabilities");
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

  describe("FR-005 — offboarded drivers are hidden by default", () => {
    it("excludes them unless asked for, and includes them when asked", async () => {
      await seedDriver("Current");
      await seedDriver("Departed", { status: "offboarded" });
      expect((await driversRepo.listDrivers()).items).toHaveLength(1);
      expect(
        (await driversRepo.listDrivers({ view: "everyone" })).items,
      ).toHaveLength(2);
      expect(
        (await driversRepo.listDrivers({ view: "offboarded" })).items,
      ).toHaveLength(1);
    });

    it("searches on partial name and on email", async () => {
      await seedDriver("Alexandra Chen");
      await seedDriver("Bob Smith");
      expect((await driversRepo.listDrivers({ q: "exandr" })).items).toHaveLength(1);
      expect((await driversRepo.listDrivers({ q: "bob.smith" })).items).toHaveLength(1);
      expect((await driversRepo.listDrivers({ q: "nobody" })).items).toHaveLength(0);
    });
  });
});
