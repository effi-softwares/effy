import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

import { migrationSql } from "@effy/edge-shared/testing";

import { setPackScanning } from "./pack-scanning";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

d("096 - Require pack scanning (fleet owns the rule)", () => {
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

  it("sets the rule, audits a change once, and refuses a shop that does not exist", async () => {
    const shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('PSK', 'Pack Shop') RETURNING id`)).rows[0]!.id;
    const flag = async () => (await pool.query(`SELECT pack_scan_required FROM public.shop WHERE id = $1`, [shopId])).rows[0].pack_scan_required;
    const audits = async () =>
      (await pool.query(`SELECT action, detail FROM admin.audit_log WHERE target_type = 'shop' AND target_id = $1`, [shopId])).rows;

    expect(await flag()).toBe(false);
    expect(await setPackScanning(shopId, true, "staff-1")).toEqual({ shopId, required: true });
    expect(await flag()).toBe(true);
    await setPackScanning(shopId, true, "staff-1");
    expect(await audits()).toEqual([
      { action: "shop.pack_scanning_changed", detail: { changed: ["packScanRequired"], values: { packScanRequired: true } } },
    ]);
    await setPackScanning(shopId, false, "staff-2");
    expect(await flag()).toBe(false);
    expect(await audits()).toHaveLength(2);

    await expect(setPackScanning("00000000-0000-4000-8000-000000000000", true, "staff-1")).rejects.toMatchObject({ kind: "not_found" });
  });
});
