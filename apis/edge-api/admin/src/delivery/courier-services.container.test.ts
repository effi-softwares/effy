import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 080 — the courier services console against the REAL schema: validation, the one default, retiring,
 * and the audit row. ⚠ Every courier name here is fictional: the real ones are the operator's.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...(await importOriginal<typeof import("@effy/edge-shared")>()),
    query,
    pooled: { query },
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
vi.mock("@effy/edge-shared/live", () => ({ announce: async () => undefined }));

import { migrationSql } from "@effy/edge-shared";

import * as svc from "./courier-services.service";

const RUN = process.env.CONTAINER_TESTS === "1";
const SUB = "manager-sub";
let container: StartedPostgreSqlContainer;
let pool: Pool;

const refusal = (p: Promise<unknown>) =>
  p.then(() => null, (e: { status?: number; code?: string; extra?: { fields?: { field: string }[] } }) => ({
    status: e.status, code: e.code, fields: e.extra?.fields?.map((f) => f.field),
  }));
const valid = { courierName: "Test Courier", serviceName: "Parcel", estimateText: "2–4 business days", maxBusinessDays: 4, pickupWeekdays: [5, 1, 1], pickupCutoff: "14:00" };

describe.skipIf(!RUN)("080 — courier services", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("starts empty — nothing is seeded", async () => {
    expect(await svc.list()).toEqual({ items: [], collectionDefault: "hub" });
  });

  it("refuses what a person can fix, field by field", async () => {
    expect(await refusal(svc.create({ ...valid, courierName: "X", estimateText: "", pickupWeekdays: [], pickupCutoff: "2pm", maxBusinessDays: 0 }, SUB)))
      .toEqual({ status: 422, code: "invalid_service", fields: ["courierName", "estimateText", "maxBusinessDays", "pickupWeekdays", "pickupCutoff"] });
  });

  it("one default at a time; the default cannot be retired or un-made", async () => {
    const a = await svc.create({ ...valid, isDefault: true }, SUB);
    expect(a).toMatchObject({ courierName: "Test Courier", pickupWeekdays: [1, 5], pickupCutoff: "14:00", status: "active", isDefault: true });
    const b = await svc.create({ ...valid, serviceName: "Express", collectsFromSupplier: true, isDefault: true }, SUB);
    expect((await svc.list()).items.map((s) => [s.serviceName, s.isDefault])).toEqual([["Express", true], ["Parcel", false]]);

    expect(await refusal(svc.update(b.id, { isDefault: false }, SUB))).toMatchObject({ status: 409, code: "default_service_required" });
    expect(await refusal(svc.update(b.id, { status: "retired" }, SUB))).toMatchObject({ status: 422, fields: ["status"] });
    expect(await refusal(svc.create({ ...valid }, SUB))).toMatchObject({ status: 409, code: "name_taken" });

    // Retiring the other keeps it listed, last.
    expect(await svc.update(a.id, { status: "retired" }, SUB)).toMatchObject({ status: "retired", isDefault: false });
    expect((await svc.list()).items.map((s) => s.status)).toEqual(["active", "retired"]);
    expect(await refusal(svc.update("not-a-uuid", {}, SUB))).toMatchObject({ status: 404 });

    const audits = (await pool.query(`SELECT action FROM admin.audit_log WHERE target_type = 'courier_service' ORDER BY created_at`)).rows.map((r) => r.action);
    expect(audits).toEqual(["courier_service.create", "courier_service.create", "courier_service.update"]);
  });
});
