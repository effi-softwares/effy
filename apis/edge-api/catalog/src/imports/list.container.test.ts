import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return { ...(await importOriginal<typeof import("@effy/edge-shared")>()), query, pooled: { query } };
});
vi.mock("@effy/edge-shared/live", () => ({ announce: async () => undefined }));
vi.mock("./aws", () => ({ enqueue: async () => undefined }));

import { parseListQuery } from "@effy/edge-shared";
import { migrationSql } from "@effy/edge-shared/testing";

import { IMPORT_LIST_SPEC } from "./list";
import { list } from "./service";

/** 103: imports page with an exact total, filter by shop and state, search the file name. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopA: string;
const page = (qs: Record<string, string>) => list(parseListQuery(qs, IMPORT_LIST_SPEC));

d("103 — the imports list", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    shopA = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('IA', 'Alpha') RETURNING id`)).rows[0]!.id;
    const shopB = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('IB', 'Beta') RETURNING id`)).rows[0]!.id;
    for (let i = 0; i < 30; i += 1) {
      await pool.query(
        `INSERT INTO public.product_import (shop_id, file_name, file_sha256, columns, margin_kind, margin_value, created_by, row_count, state, created_at)
         VALUES ($1, $2, $3, '[]'::jsonb, 'percent', 10, 'sub', 0, $4, '2026-10-01T00:00:00Z')`,
        [i % 3 === 0 ? shopB : shopA, `list-${i}.xlsx`, `sha${i}`, i % 2 === 0 ? "done" : "failed"],
      );
    }
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("pages 30 imports written in the same instant without repeating one", async () => {
    const p1 = await page({ pageSize: "25" });
    const p2 = await page({ pageSize: "25", page: "2" });
    expect(p1.total).toBe(30);
    const ids = [...p1.items, ...p2.items].map((i) => i.importId);
    expect(new Set(ids).size).toBe(30);
  });

  it("filters by shop and state and searches the file name", async () => {
    expect((await page({ shopId: shopA })).total).toBe(20);
    expect((await page({ state: "failed" })).total).toBe(15);
    expect((await page({ q: "list-1" })).total).toBe(11);
  });
});
