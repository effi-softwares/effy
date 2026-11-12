import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Queryable, type Transactor } from "@effy/edge-shared";
import { emailRecipientOf, listInbox, messageEmailVars } from "@effy/edge-shared/notifications";
import { migrationSql } from "@effy/edge-shared/testing";

import { messageFor, type ClaimedDelivery } from "../worker/drain";
import { runMessagesPass } from "./worker";

/**
 * 115 US5 (T035) - the first name across the stack: stored as a placeholder only, filled for the reader in the inbox and
 * the email, the fallback on every lock screen, drivers and shop staff by the first word of their name; and no log or
 * metric line in the path carries a body (FR-026).
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;

const BODY = "Hi {first name}, the hub opens at 8 tomorrow. From Effy";

d("115 - the first name, end to end", () => {
  let messageId: string;
  const subs = { sam: "fn-sam", nameless: "fn-none", driver: "fn-drv", shop: "fn-shop" };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    await pool.query(`INSERT INTO public.customer (cognito_sub, email, given_name) VALUES ($1, 'sam@example.test', 'Sam'), ($2, 'none@example.test', NULL)`, [subs.sam, subs.nameless]);
    await pool.query(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, 'Riley Jones', 'riley@effyshopping.com')`, [subs.driver]);
    const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('FNS', 'Shop') RETURNING id::text AS id`)).rows[0]!.id;
    await pool.query(`INSERT INTO public.shop_staff (cognito_sub, email, name, shop_id) VALUES ($1, 'kim@shop.test', 'Kim Lee', $2)`, [subs.shop, shop]);

    messageId = (await pool.query<{ id: string }>(
      `INSERT INTO public.message (kind, title, body, email, name_fallback, status, send_at, created_by)
       VALUES ('important', 'Hub hours', $1, true, 'there', 'scheduled', now(), 'staff-1') RETURNING id::text AS id`,
      [BODY],
    )).rows[0]!.id;
    for (const [audience, destination] of [["customer", { kind: "home" }], ["driver", { kind: "today" }], ["shop", { kind: "queue" }]] as const) {
      await pool.query(`INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, $2, '{}'::jsonb, $3::jsonb)`, [
        messageId, audience, JSON.stringify(destination),
      ]);
    }
    await runMessagesPass({
      db: pool as Queryable, transact, now: () => new Date(), deadline: Date.now() + 120_000, announceOps: async () => {}, announceInbox: async () => {},
    });
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("every stored body holds the placeholder with its fallback, and no name", async () => {
    const rows = (await pool.query<{ body: string; title: string }>(`SELECT title, body FROM public.notification WHERE message_id = $1`, [messageId])).rows;
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.body).toBe("Hi {first name|there}, the hub opens at 8 tomorrow. From Effy");
      expect(`${r.title} ${r.body}`).not.toMatch(/Sam|Riley|Kim/);
    }
  });

  it("the inbox gives each reader their own name, else the fallback; drivers and shop staff by their first word", async () => {
    const first = async (sub: string, audience: "customer" | "driver" | "shop") => {
      const page = await listInbox(sub, audience, {}, pool);
      return [...page.pinned, ...page.items][0]!.body;
    };
    expect(await first(subs.sam, "customer")).toBe("Hi Sam, the hub opens at 8 tomorrow. From Effy");
    expect(await first(subs.nameless, "customer")).toBe("Hi there, the hub opens at 8 tomorrow. From Effy");
    expect(await first(subs.driver, "driver")).toBe("Hi Riley, the hub opens at 8 tomorrow. From Effy");
    expect(await first(subs.shop, "shop")).toBe("Hi Kim, the hub opens at 8 tomorrow. From Effy");
  });

  it("the email has the name; the preheader and every push have the fallback", async () => {
    const row = (await pool.query<{ id: string; title: string; body: string; destination: Record<string, unknown> }>(
      `SELECT id::text AS id, title, body, destination FROM public.notification WHERE message_id = $1 AND recipient_sub = $2`, [messageId, subs.sam],
    )).rows[0]!;
    const email = messageEmailVars(
      { to: "sam@example.test", recipientSub: subs.sam, messageId, category: "important", title: row.title, body: row.body, destination: row.destination, imageUrl: null },
      await emailRecipientOf(pool, subs.sam),
      { site: "https://dev.example.test", edge: "https://edge.example.test" },
    )!;
    expect(email.vars.paragraphs.map((p) => p.text).join(" ")).toContain("Hi Sam,");
    expect(email.vars.preheader).not.toContain("Sam");

    const push = messageFor(
      { id: "d", notificationId: row.id, channel: "push", recipientEmail: null, attempts: 0, recipientSub: subs.sam, audience: "customer",
        type: "customer_message", title: row.title, body: row.body, entityId: messageId, destination: row.destination, expiresAt: null, tag: "t", group: "g" } as ClaimedDelivery,
      "token", "android",
    );
    expect(push.body).toBe("Hi there, the hub opens at 8 tomorrow. From Effy");
  });

  it("FR-026: no log or metric line on the path names a body", () => {
    const roots = [resolve(__dirname, "../worker"), resolve(__dirname, "."), resolve(__dirname, "../../../shared/src/notifications")];
    const files = roots.flatMap((r) => readdirSync(r).filter((f) => f.endsWith(".ts") && !f.includes(".test.")).map((f) => resolve(r, f)));
    const offenders = files.filter((f) => /(log\.(info|warn|error|debug)|emitMetric)\([^;]*\b(body|paragraphs|filled)\b/s.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
