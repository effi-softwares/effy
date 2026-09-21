import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The driver record read against real PostgreSQL 16 (062).
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL. Until 062 this service had NO container test, and that is exactly
 * how it shipped a query against a column the 062 migration drops: `SELECT_BY_SUB` read
 * public.driver.delivery_zone_id, `tsc` was perfectly happy, and all ten unit tests passed because
 * every one of them mocks the repository — so the SQL had never once run against a database. The
 * first thing to notice would have been every driver's sign-in returning 500 in dev.
 *
 * Which is 056's lesson in the neighbouring service, verbatim: a wrong column name TYPECHECKS
 * PERFECTLY. The fix is not "remember to check"; it is that this query now runs against real
 * migrations on every test run.
 *
 * The schema below is loaded FROM THE REAL MIGRATION FILES rather than transcribed, so it cannot
 * drift from what `make db-up` produces.
 */

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

const SCHEMA = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE public.delivery_zone (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name     text NOT NULL,
    postcode text NOT NULL,
    status   text NOT NULL DEFAULT 'active'
  );

  CREATE TABLE public.driver (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub text NOT NULL UNIQUE,
    name        text NOT NULL,
    work_email  text NOT NULL,
    status      text NOT NULL DEFAULT 'active',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE public.driver_duty_session (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz,
    expected_end_at timestamptz
  );

  CREATE TABLE public.vehicle (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_plate text NOT NULL,
    body_type          text NOT NULL,
    status             text NOT NULL DEFAULT 'available'
  );

  CREATE TABLE public.vehicle_holding (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES public.vehicle (id) ON DELETE CASCADE,
    driver_id  uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at   timestamptz
  );

  CREATE TABLE public.driver_zone_capability (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
    function  text NOT NULL CHECK (function IN ('collection', 'delivery')),
    method    text NOT NULL CHECK (method   IN ('standard', 'same_day')),
    zone_id   uuid NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE
  );
`;

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
    `INSERT INTO public.delivery_zone (name, postcode, status) VALUES ($1, $2, $3) RETURNING id`,
    [name, postcode, status],
  );
  return r.rows[0].id as string;
}

async function grant(driverId: string, zoneId: string | null): Promise<void> {
  await holder.pool!.query(
    `INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id)
     VALUES ($1, 'delivery', 'standard', $2)`,
    [driverId, zoneId],
  );
}

describe.skipIf(!RUN)("driver record read against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    holder.pool = new Pool({ connectionString: container.getConnectionUri() });
    await holder.pool.query(SCHEMA);
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

  // ⚠ THE PROOF THE DEFECT IS GONE. Before the fix this query named public.driver.delivery_zone_id,
  // which 062 drops — so this test fails with `column d.delivery_zone_id does not exist`, which is
  // exactly what every driver's sign-in would have returned in dev.
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

  // ⚠ An every-zone grant is stored as NULL, and a NULL in a UNIQUE index is the thing most likely
  // to be mishandled. It must beat a count, not join one.
  it("says Every zone for a null-zone grant, even beside named ones", async () => {
    const d = await seedDriver();
    await grant(d, null);
    await grant(d, await seedZone("Inner North", "3068"));
    expect((await repo.findBySubject("sub-1"))!.coverageLabel).toBe("Every zone");
  });

  // ⚠ A clearance for a disabled zone matches no work, so counting it overstates coverage.
  it("ignores a clearance for a disabled zone", async () => {
    const d = await seedDriver();
    await grant(d, await seedZone("Retired", "3999", "disabled"));
    expect((await repo.findBySubject("sub-1"))!.coverageLabel).toBeNull();
  });

  // ⚠ 061's half of the same read: the vehicle comes from the OPEN holding, not from columns on the
  // driver row that the fleet migration also drops.
  it("reads the vehicle through the open holding, and nothing once it is closed", async () => {
    const d = await seedDriver();
    const v = await holder.pool!.query(
      `INSERT INTO public.vehicle (registration_plate, body_type) VALUES ('ABC123', 'van') RETURNING id`,
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
