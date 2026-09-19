import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The attention evaluator's SQL, against real PostgreSQL 16 and THE REAL MIGRATIONS (059, A11).
 *
 * ⚠ WHY THIS FILE EXISTS, AND WHY IT IS NOT OPTIONAL. Three of this slice's load-bearing guarantees
 * are DATABASE CONSTRAINTS, not code — and a mocked test can only ever assert that the code believes
 * them:
 *
 *   1. `UNIQUE (shop_id, kind, subject_key)` is what makes "notify once per occurrence" true. A fake
 *      that reimplements it agrees with my reading of the schema, not with the schema.
 *   2. `subject_key NOT NULL` is what stops the per-shop backlog row inserting on every run — the
 *      failure where NULL <> NULL makes the UNIQUE index useless and the console interrupts an
 *      operator every five minutes forever, behind a green suite.
 *   3. `notification_request.dedupe_key` UNIQUE is what makes a re-run a no-op.
 *
 * 056 found two wrong column names ONLY here — both typecheck perfectly and fail at runtime. 058's
 * container tests, run late because Docker was down, found three defects its whole green suite had
 * missed, including one that only the SECOND recompute of a day would ever show.
 */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async <T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
});

import {
  activeShops,
  deleteOccurrences,
  enqueueIntent,
  insertOccurrence,
  markNotified,
  recipientsForShop,
  storedOccurrences,
} from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";

function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error("no migrations found — this harness would pass vacuously");
  return files
    .map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      const start = body.indexOf("-- +goose Up");
      const rest = start < 0 ? body : body.slice(start);
      const end = rest.indexOf("-- +goose Down");
      return end < 0 ? rest : rest.slice(0, end);
    })
    .join("\n");
}

const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER = "33333333-3333-4333-8333-000000000000";

describe.skipIf(!RUN)("attention state — real PostgreSQL, real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  const tx = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try {
      return await fn(c);
    } finally {
      c.release();
    }
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(applyMigrations());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE public.shop, public.shop_attention_state, public.notification_request RESTART IDENTITY CASCADE`,
    );
    await pool.query(
      `INSERT INTO public.shop (id, code, name, status)
       VALUES ($1,'S1','Shop One','active'), ($2,'S2','Shop Two','suspended')`,
      [SHOP, OTHER],
    );
  });

  it("⚠ the migration really did widen device_token.platform to accept 'web'", async () => {
    // The whole slice rests on this one line. A CHECK that did not widen fails here and nowhere else.
    await expect(
      pool.query(
        `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token)
         VALUES ('sub-1','shop','web','tok-web-1')`,
      ),
    ).resolves.toBeDefined();
  });

  it("still refuses a platform that is not in the set", async () => {
    await expect(
      pool.query(
        `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token)
         VALUES ('sub-1','shop','windows','tok-x')`,
      ),
    ).rejects.toThrow(/device_token_platform_check/);
  });

  it("muted_types defaults to empty, so every pre-059 row keeps its behaviour", async () => {
    await pool.query(
      `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token)
       VALUES ('sub-1','shop','ios','tok-ios-1')`,
    );
    const r = await pool.query<{ muted_types: string[] }>(
      `SELECT muted_types FROM public.device_token WHERE fcm_token = 'tok-ios-1'`,
    );
    expect(r.rows[0]!.muted_types).toEqual([]);
  });

  it("accepts the four new notification types", async () => {
    for (const t of [
      "shop_awaiting_pick",
      "shop_out_of_stock",
      "shop_low_stock",
      "shop_refund_proposed",
    ]) {
      await expect(
        pool.query(
          `INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
           VALUES ('sub-1','shop',$1,'{}'::jsonb,$2)`,
          [t, `${t}:sub-1:x`],
        ),
      ).resolves.toBeDefined();
    }
  });

  it("⚠ A8 — the per-shop backlog key inserts ONCE, not on every run", async () => {
    // The `NOT NULL text` decision, tested against the index that enforces it. With a nullable uuid
    // this returns a new id every time, because NULL is never equal to itself in a UNIQUE index —
    // and the console then notifies about the backlog every five minutes, forever.
    const first = await tx((c) => insertOccurrence(c, SHOP, "awaiting_pick", ""));
    const second = await tx((c) => insertOccurrence(c, SHOP, "awaiting_pick", ""));
    const third = await tx((c) => insertOccurrence(c, SHOP, "awaiting_pick", ""));

    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(third).toBeNull();

    const rows = await tx((c) => storedOccurrences(c, SHOP));
    expect(rows).toHaveLength(1);
  });

  it("rejects a NULL subject_key outright", async () => {
    await expect(
      pool.query(
        `INSERT INTO public.shop_attention_state (shop_id, kind, subject_key) VALUES ($1,'awaiting_pick',NULL)`,
        [SHOP],
      ),
    ).rejects.toThrow(/null value|not-null/i);
  });

  it("⚠ A3 — deleting the row is what makes a recurrence a NEW occurrence", async () => {
    const first = await tx((c) => insertOccurrence(c, SHOP, "out_of_stock", "p1"));
    await tx((c) => deleteOccurrences(c, [first!]));
    const second = await tx((c) => insertOccurrence(c, SHOP, "out_of_stock", "p1"));

    expect(second).toBeTruthy();
    // ⚠ A DIFFERENT ID, which is what gives the recurrence a dedupe key the outbox has never seen.
    expect(second).not.toBe(first);
  });

  it("scopes occurrences per shop", async () => {
    await tx((c) => insertOccurrence(c, SHOP, "out_of_stock", "p1"));
    await tx((c) => insertOccurrence(c, OTHER, "out_of_stock", "p1"));
    expect(await tx((c) => storedOccurrences(c, SHOP))).toHaveLength(1);
    expect(await tx((c) => storedOccurrences(c, OTHER))).toHaveLength(1);
  });

  it("lists only ACTIVE shops", async () => {
    const shops = await activeShops();
    expect(shops.map((s) => s.id)).toEqual([SHOP]);
  });

  it("⚠ A11 — a repeated intent is a silent no-op, so a re-run cannot double-notify", async () => {
    await tx((c) =>
      enqueueIntent(c, {
        recipientSub: "sub-1",
        type: "shop_out_of_stock",
        entityId: "p1",
        dedupeKey: "shop_out_of_stock:sub-1:occ-1",
      }),
    );
    await tx((c) =>
      enqueueIntent(c, {
        recipientSub: "sub-1",
        type: "shop_out_of_stock",
        entityId: "p1",
        dedupeKey: "shop_out_of_stock:sub-1:occ-1",
      }),
    );
    const r = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.notification_request WHERE dedupe_key = 'shop_out_of_stock:sub-1:occ-1'`,
    );
    expect(r.rows[0]!.n).toBe("1");
  });

  it("⚠ concurrent runs over the same condition produce one occurrence and one intent", async () => {
    // Two overlapping schedule invocations are ordinary, not exotic. Both see the condition; only
    // one may announce it.
    const results = await Promise.all([
      tx((c) => insertOccurrence(c, SHOP, "low_stock", "p9")),
      tx((c) => insertOccurrence(c, SHOP, "low_stock", "p9")),
      tx((c) => insertOccurrence(c, SHOP, "low_stock", "p9")),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await tx((c) => storedOccurrences(c, SHOP))).toHaveLength(1);
  });

  it("marks occurrences notified, so a restart does not re-announce them", async () => {
    const id = await tx((c) => insertOccurrence(c, SHOP, "out_of_stock", "p1"));
    await tx((c) => markNotified(c, [id!]));
    const rows = await tx((c) => storedOccurrences(c, SHOP));
    expect(rows[0]!.notifiedAt).not.toBeNull();
  });

  it("⚠ resolves recipients and their manager flag from the PLATFORM RECORD", async () => {
    // ⚠ 056 found TWO WRONG COLUMN NAMES only in a container test — both typecheck perfectly and
    // fail at runtime. This query joins four tables that three slices own.
    const staff = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_staff (shop_id, cognito_sub, email, status)
       VALUES ($1,'sub-boss','boss@example.test','active'), ($1,'sub-pick','pick@example.test','active'),
              ($1,'sub-gone','gone@example.test','disabled')
       RETURNING id`,
      [SHOP],
    );
    const bossId = staff.rows[0]!.id;
    const role = await pool.query<{ id: string }>(
      `SELECT id FROM public.shop_role WHERE name = 'shop_manager'`,
    );
    await pool.query(
      `INSERT INTO public.shop_staff_role (shop_staff_id, shop_role_id) VALUES ($1,$2)`,
      [bossId, role.rows[0]!.id],
    );

    const recipients = await tx((c) => recipientsForShop(c, SHOP));
    const bySub = Object.fromEntries(recipients.map((r) => [r.sub, r.isManager]));

    expect(bySub["sub-boss"]).toBe(true);
    expect(bySub["sub-pick"]).toBe(false);
    // ⚠ FR-016 — a stood-down operator is not told to go and pick.
    expect(bySub["sub-gone"]).toBeUndefined();
  });
});
