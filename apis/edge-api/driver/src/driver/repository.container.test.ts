import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** The driver record read against real Postgres, with the schema loaded from the real migrations. */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  };
});

import * as repo from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";

async function seedDriver(sub = "sub-1"): Promise<string> {
  const r = await holder.pool!.query(
    `INSERT INTO public.driver (cognito_sub, name, work_email)
     VALUES ($1, 'Ada Driver', 'ada@effyshopping.com') RETURNING id`,
    [sub],
  );
  return r.rows[0].id as string;
}

async function seedZone(name: string, postcode: string, status = "active"): Promise<string> {
  const r = await holder.pool!.query(
    `INSERT INTO public.delivery_zone (code, name, status, updated_by) VALUES ('Z-' || $2, $1, $3, 'test') RETURNING id`,
    [name, postcode, status],
  );
  return r.rows[0].id as string;
}

async function grant(driverId: string, zoneId: string | null): Promise<void> {
  await holder.pool!.query(
    `INSERT INTO public.driver_zone_capability (driver_id, function, zone_id)
     VALUES ($1, 'delivery', $2)`,
    [driverId, zoneId],
  );
}

describe.skipIf(!RUN)("driver record read against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    holder.pool = new Pool({ connectionString: container.getConnectionUri() });
    await holder.pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await holder.pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await holder.pool!.query(
      `TRUNCATE public.driver_zone_capability, public.vehicle_holding, public.vehicle,
                public.driver_duty_session, public.driver, public.delivery_zone CASCADE`,
    );
  });

  it("reads a driver whose record has no zone column at all", async () => {
    await seedDriver();
    const rec = await repo.findBySubject("sub-1");
    expect(rec).not.toBeNull();
    expect(rec!.name).toBe("Ada Driver");
    expect(rec!.coverageLabel).toBeNull();
  });

  it("names the single zone a driver is cleared for", async () => {
    const d = await seedDriver();
    await grant(d, await seedZone("Inner North", "3068"));
    expect((await repo.findBySubject("sub-1"))!.coverageLabel).toBe("Inner North");
  });

  it("counts several zones rather than listing them", async () => {
    const d = await seedDriver();
    await grant(d, await seedZone("Inner North", "3068"));
    await grant(d, await seedZone("Inner West", "3011"));
    expect((await repo.findBySubject("sub-1"))!.coverageLabel).toBe("2 zones");
  });

  // An every-zone grant is stored as null: it must beat a count, not join one.
  it("says Every zone for a null-zone grant, even beside named ones", async () => {
    const d = await seedDriver();
    await grant(d, null);
    await grant(d, await seedZone("Inner North", "3068"));
    expect((await repo.findBySubject("sub-1"))!.coverageLabel).toBe("Every zone");
  });

  // A clearance for a disabled zone matches no work.
  it("ignores a clearance for a disabled zone", async () => {
    const d = await seedDriver();
    await grant(d, await seedZone("Retired", "3999", "disabled"));
    expect((await repo.findBySubject("sub-1"))!.coverageLabel).toBeNull();
  });

  // The vehicle comes from the open holding.
  it("reads the vehicle through the open holding, and nothing once it is closed", async () => {
    const d = await seedDriver();
    const v = await holder.pool!.query(
      `INSERT INTO public.vehicle (registration_plate, make, model, body_type) VALUES ('ABC123', 'Toyota', 'HiAce', 'van') RETURNING id`,
    );
    await holder.pool!.query(
      `INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`,
      [v.rows[0].id, d],
    );
    expect((await repo.findBySubject("sub-1"))!.vehiclePlate).toBe("ABC123");

    await holder.pool!.query(`UPDATE public.vehicle_holding SET ended_at = now()`);
    expect((await repo.findBySubject("sub-1"))!.vehiclePlate).toBeNull();
  });
});
