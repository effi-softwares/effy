import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { layoutFits, skinProblems, type DesignedLayout, type GroupSize, type SkinSettings } from "@effy/shared-types";

import { migrationSql } from "../lib/load-migrations";

/**
 * 095 — the skins migration against the REAL schema: nothing a shopper sees changes (every group wears
 * Classic), the starter skins are valid and readable, `mega-nav` starts with what the aisles menu showed,
 * and the foreign keys keep a skin in use and drop a removed picture from its placements.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const MIGRATION = "20261022090000_promotion_skins.sql";

let container: StartedPostgreSqlContainer;
let pool: Pool;

const rows = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows as T[];
const one = async <T>(sql: string, args: unknown[] = []) => (await rows<T>(sql, args))[0] as T;

async function promotion(name: string) {
  return (
    await one<{ id: string }>(
      `INSERT INTO public.promotion (name, kind, trigger, value_type, percent_off, applies_to, created_by, published_at)
       VALUES ($1, 'cart', 'automatic', 'percent', 10, 'cart', 'staff-1', now()) RETURNING id::text AS id`,
      [name],
    )
  ).id;
}

async function place(key: string, promotionId: string, position: number) {
  await pool.query(
    `INSERT INTO public.promotion_group_member (group_id, promotion_id, position)
     SELECT id, $2::uuid, $3 FROM public.promotion_group WHERE key = $1`,
    [key, promotionId, position],
  );
}

d("095 — promotion skins migration", () => {
  let hero1: string, hero2: string, between: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
    await pool.query(migrationSql({ before: MIGRATION }));
    hero1 = await promotion("Hero one");
    hero2 = await promotion("Hero two");
    between = await promotion("Between");
    await place("home-hero", hero1, 0);
    await place("home-hero", hero2, 1);
    await place("home-between", between, 0);
    await place("home-between", hero1, 1); // in both: shown once in the menu, at its first place
    await pool.query(migrationSql({ from: MIGRATION }));
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("every group wears Classic, so no shopper sees a change", async () => {
    const groups = await rows<{ key: string; layout: string; size: string; code: string | null }>(
      `SELECT g.key, s.layout, g.size, g.default_code_skin_id::text AS code
         FROM public.promotion_group g JOIN public.promotion_skin s ON s.id = g.default_skin_id ORDER BY g.sort`,
    );
    expect(groups.map((g) => g.key)).toEqual(["home-hero", "home-side", "home-between", "offers", "cart", "mega-nav"]);
    expect(groups.every((g) => g.layout === "classic" && g.code === null)).toBe(true);
    expect(await rows(`SELECT 1 FROM public.promotion_group_member WHERE skin_id IS NOT NULL OR image_id IS NOT NULL`)).toEqual([]);
  });

  it("the aisles menu starts with what it showed: home-hero, then home-between, once each", async () => {
    const menu = await rows<{ promotion_id: string }>(
      `SELECT m.promotion_id::text FROM public.promotion_group_member m JOIN public.promotion_group g ON g.id = m.group_id
        WHERE g.key = 'mega-nav' ORDER BY m.position`,
    );
    expect(menu.map((m) => m.promotion_id)).toEqual([hero1, hero2, between]);
  });

  it("the starter skins are valid and readable, and every layout fits a size", async () => {
    const skins = await rows<{ name: string; layout: DesignedLayout; settings: SkinSettings }>(
      `SELECT name, layout, settings FROM public.promotion_skin WHERE layout <> 'classic' ORDER BY name`,
    );
    expect(skins).toHaveLength(6);
    for (const s of skins) {
      expect({ name: s.name, ...skinProblems(s.layout, s.settings) }).toEqual({ name: s.name, issues: [], unreadable: [] });
      expect((["large", "medium", "small", "strip"] as GroupSize[]).some((size) => layoutFits(s.layout, size))).toBe(true);
    }
  });

  it("there is one Classic skin", async () => {
    await expect(
      pool.query(`INSERT INTO public.promotion_skin (name, layout, created_by) VALUES ('Another', 'classic', 'x')`),
    ).rejects.toThrow(/promotion_skin_one_classic/);
  });

  it("a skin in use cannot be removed; a removed picture leaves its placements", async () => {
    const skin = await one<{ id: string }>(`SELECT id::text FROM public.promotion_skin WHERE name = 'Panel — Effy blue'`);
    const img = await one<{ id: string }>(
      `INSERT INTO public.promotion_image (promotion_id, storage_key, width, height, alt, created_by)
       VALUES ($1, 'promotions/x/a.jpg', 1600, 900, 'A basket', 'staff-1') RETURNING id::text AS id`,
      [hero1],
    );
    await pool.query(
      `UPDATE public.promotion_group_member SET skin_id = $1, image_id = $2
        WHERE promotion_id = $3 AND group_id = (SELECT id FROM public.promotion_group WHERE key = 'home-hero')`,
      [skin.id, img.id, hero1],
    );
    await expect(pool.query(`DELETE FROM public.promotion_skin WHERE id = $1`, [skin.id])).rejects.toThrow(/foreign key/);
    await pool.query(`DELETE FROM public.promotion_image WHERE id = $1`, [img.id]);
    const m = await one<{ image_id: string | null; skin_id: string }>(
      `SELECT image_id::text, skin_id::text FROM public.promotion_group_member
        WHERE promotion_id = $1 AND group_id = (SELECT id FROM public.promotion_group WHERE key = 'home-hero')`,
      [hero1],
    );
    expect(m).toEqual({ image_id: null, skin_id: skin.id });
  });

  it("shoppers read skins and pictures but cannot write them", async () => {
    const grants = await rows<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'effy_shopper' AND table_name IN ('promotion_skin', 'promotion_image') AND privilege_type <> 'SELECT'`,
    );
    expect(grants.filter((g) => ["INSERT", "UPDATE", "DELETE"].includes(g.privilege_type))).toEqual([]);
  });
});
