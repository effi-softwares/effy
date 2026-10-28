import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return { ...(await importOriginal<typeof import("@effy/edge-shared")>()), query, pooled: { query } };
});

import { parseListQuery } from "@effy/edge-shared";
import { migrationSql } from "@effy/edge-shared/testing";

import { SHOP_LIST_SPEC } from "./list";
import { shopViewCounts } from "./repository";
import { listShops } from "./service";

/** 103: the shop register pages, sorts, searches and counts on the server, and never ties at a page edge. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const list = (qs: Record<string, string>) => listShops(parseListQuery(qs, SHOP_LIST_SPEC));

d("103 — shop register as a console list", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    // 30 shops; every name is one of three, so sorting by name ties across page edges.
    for (let i = 1; i <= 30; i += 1) {
      await pool.query(`INSERT INTO public.shop (code, name, status) VALUES ($1, $2, $3)`, [
        `S${String(i).padStart(2, "0")}`,
        ["Alpha", "Beta", "Gamma"][i % 3],
        i % 5 === 0 ? "suspended" : "active",
      ]);
    }
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("pages with an exact total", async () => {
    const p1 = await list({ pageSize: "25" });
    expect(p1).toMatchObject({ total: 30, page: 1, pageSize: 25, totalCapped: false, nextCursor: null });
    expect(p1.items.map((s) => s.code).slice(0, 2)).toEqual(["S01", "S02"]);
    const p2 = await list({ pageSize: "25", page: "2" });
    expect(p2.items.map((s) => s.code)).toEqual(["S26", "S27", "S28", "S29", "S30"]);
  });

  it("never repeats or skips a row when the sort value ties across a page edge", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 2; page += 1) {
      const p = await list({ sort: "name", pageSize: "25", page: String(page) });
      seen.push(...p.items.map((s) => s.id));
    }
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it("answers a page past the end with the last real page", async () => {
    const p = await list({ pageSize: "25", page: "9" });
    expect(p.page).toBe(2);
    expect(p.items).toHaveLength(5);
  });

  it("filters by status, searches code and name, and drops an unknown status", async () => {
    expect((await list({ status: "suspended" })).total).toBe(6);
    expect((await list({ q: "s1" })).total).toBe(10);
    expect((await list({ q: "gam" })).total).toBe(10);
    const odd = await list({ status: "on-fire" });
    expect(odd.total).toBe(30);
    expect(odd.ignored).toEqual(["status"]);
  });

  it("counts its views for the search in one query", async () => {
    expect(await shopViewCounts(null)).toMatchObject({ all: 30, active: 24, suspended: 6 });
    expect(await shopViewCounts("beta")).toMatchObject({ all: 10 });
  });
});
