import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Queryable, type Transactor } from "@effy/edge-shared";
import { requestBadgeCorrections, withdrawMessageItems } from "@effy/edge-shared/notifications";
import { migrationSql } from "@effy/edge-shared/testing";

import type { BadgeMessage, SendResult } from "../fcm/sender";
import { sendBadgeCorrections } from "./badge";

/**
 * 116 C6 against the real schema (T017): a change queues one row per person; a burst is one correction; a young row
 * waits; expiries and withdrawals are found by the watermark sweep, even after skipped runs; only app devices of
 * customers and drivers get one; a dead token is removed; the count and keep list are right.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;
let sent: BadgeMessage[];
let answer: (m: BadgeMessage) => SendResult;

const deps = (now: Date) => ({
  db: pool as Queryable,
  transact,
  now: () => now,
  senderConfigured: true,
  sendBadges: async (messages: readonly BadgeMessage[]) => {
    sent.push(...messages);
    return messages.map(answer);
  },
});

async function person(audience: "customer" | "driver" | "shop", platforms: ("android" | "ios" | "web")[]): Promise<string> {
  const sub = `bd-${++seq}`;
  for (const platform of platforms) {
    await pool.query(
      `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token) VALUES ($1, $2, $3, $4)`,
      [sub, audience, platform, `${sub}-${platform}`],
    );
  }
  return sub;
}

async function item(sub: string, audience: string, over: { seen?: boolean; expiresAt?: Date; messageId?: string; createdAt?: Date } = {}): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.notification (recipient_sub, audience, type, category, importance, title, body, destination, dedupe_key,
                                      seen_at, expires_at, message_id, created_at)
     VALUES ($1, $2, $3, $4, 'normal', 'T', 'B', '{"kind":"home"}'::jsonb, $5, $6, $7, $8::uuid, COALESCE($9, now())) RETURNING id::text AS id`,
    [sub, audience, audience === "driver" ? "run_opens_soon" : "order_paid", audience === "driver" ? "work" : "orders", `k-${++seq}`,
     over.seen ? new Date() : null, over.expiresAt ?? null, over.messageId ?? null, over.createdAt ?? null],
  )).rows[0]!.id;
}

const queued = async () => (await pool.query(`SELECT recipient_sub, audience FROM public.notification_badge_correction ORDER BY 1`)).rows;
const T = (s: number) => new Date(Date.now() + s * 1000);

d("116 - badge corrections", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 300_000);

  beforeEach(async () => {
    sent = [];
    answer = () => ({ ok: true, prune: false });
    // Each test sees only its own people: earlier items can't be swept into this one.
    await pool.query(`UPDATE public.notification SET seen_at = now() WHERE seen_at IS NULL`);
    await pool.query(`DELETE FROM public.notification_badge_correction`);
    await pool.query(`UPDATE public.notification_badge_sweep SET swept_to = now()`);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("SC-004: a burst of 20 changes is one row and one correction per device; a young row waits 15 s", async () => {
    const sub = await person("customer", ["android", "ios"]);
    await item(sub, "customer");
    for (let i = 0; i < 20; i++) await requestBadgeCorrections(pool, [{ audience: "customer", sub }]);
    expect(await queued()).toEqual([{ recipient_sub: sub, audience: "customer" }]);
    await sendBadgeCorrections(deps(T(5)));
    expect(sent).toEqual([]);
    const s = await sendBadgeCorrections(deps(T(20)));
    expect(sent.map((m) => m.platform).sort()).toEqual(["android", "ios"]);
    expect(s.byAudience.customer.sent).toBe(1);
    expect(await queued()).toEqual([]);
  });

  it("carries the unseen count and the latest unseen ids to keep (not seen, archived or expired ones)", async () => {
    const sub = await person("driver", ["android"]);
    const a = await item(sub, "driver", { createdAt: new Date(Date.now() - 60_000) });
    const b = await item(sub, "driver");
    await item(sub, "driver", { seen: true });
    await item(sub, "driver", { expiresAt: new Date(Date.now() - 1000) });
    await requestBadgeCorrections(pool, [{ audience: "driver", sub }]);
    await sendBadgeCorrections(deps(T(20)));
    expect(sent).toEqual([{ token: `${sub}-android`, platform: "android", count: 2, keep: [b, a] }]);
  });

  it("an expiry and a withdrawal are found by the sweep - and a run skipped for five minutes still finds them", async () => {
    const sub = await person("customer", ["ios"]);
    const message = (await pool.query<{ id: string }>(
      `INSERT INTO public.message (kind, title, body, created_by) VALUES ('announcement', 'From Effy', 'Hello', 'staff-1') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await item(sub, "customer", { messageId: message });
    await item(sub, "customer", { expiresAt: T(1) });
    await pool.query(`UPDATE public.notification_badge_sweep SET swept_to = now() - interval '5 minutes'`);
    await transact((tx) => withdrawMessageItems(tx, message));
    await sendBadgeCorrections(deps(T(2))); // queued now (the expiry and the withdrawal), too young to send
    expect(await queued()).toEqual([{ recipient_sub: sub, audience: "customer" }]);
    await sendBadgeCorrections(deps(T(30)));
    expect(sent).toEqual([{ token: `${sub}-ios`, platform: "ios", count: 0, keep: [] }]);
  });

  it("only customers' and drivers' app devices: never the web, never shop staff", async () => {
    const web = await person("customer", ["web"]);
    const shop = await person("shop", ["web"]);
    await requestBadgeCorrections(pool, [{ audience: "customer", sub: web }, { audience: "shop", sub: shop }]);
    expect(await queued()).toEqual([{ recipient_sub: web, audience: "customer" }]);
    const s = await sendBadgeCorrections(deps(T(20)));
    expect(sent).toEqual([]);
    expect(s.byAudience.customer.noDevices).toBe(1);
  });

  it("a token FCM calls dead is removed; a failure is counted, never retried as a burst", async () => {
    const sub = await person("customer", ["android", "ios"]);
    answer = (m) => (m.platform === "android" ? { ok: false, prune: true, errorClass: "messaging/registration-token-not-registered" } : { ok: false, prune: false, errorClass: "x" });
    await requestBadgeCorrections(pool, [{ audience: "customer", sub }]);
    const s = await sendBadgeCorrections(deps(T(20)));
    expect(s.pruned).toBe(1);
    expect(s.byAudience.customer.failed).toBe(1);
    expect((await pool.query(`SELECT platform FROM public.device_token WHERE subject_sub = $1`, [sub])).rows).toEqual([{ platform: "ios" }]);
    expect(await queued()).toEqual([]);
  });

  it("without FCM the queue is left for later", async () => {
    const sub = await person("customer", ["ios"]);
    await requestBadgeCorrections(pool, [{ audience: "customer", sub }]);
    const s = await sendBadgeCorrections({ ...deps(T(20)), senderConfigured: false });
    expect(s.queued).toBe(1);
    expect(await queued()).toHaveLength(1);
  });
});
