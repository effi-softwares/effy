import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import { notify } from "@effy/edge-shared/notifications";
import { migrationSql } from "@effy/edge-shared/testing";

import { batchStore, pendingStats } from "./repository";

/** 109 - the delivery drain's SQL against real PostgreSQL: claim order, row locks, outcomes, tokens, backlog. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

async function one(sub: string, priority: 0 | 1 = 0, channels: Array<"push" | "email"> = ["push"]) {
  await transact((tx) => notify(tx, { type: "order_paid", recipients: [{ sub, email: `${sub}@example.test` }], subject: { entityId: `o-${++seq}` }, dedupeScope: `s-${seq}`, channels, priority }));
}

d("delivery repository (109)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE public.notification_delivery, public.notification, public.device_token");
  });

  it("claims immediate deliveries before bulk ones, then oldest first, with the notification's words", async () => {
    await one("bulk-1", 1);
    await one("now-1", 0);
    await one("bulk-2", 1);
    await one("now-2", 0);
    const claimed = await transact((tx) => batchStore(tx).claim(10, ["push", "email"]));
    expect(claimed.map((c) => c.recipientSub)).toEqual(["now-1", "now-2", "bulk-1", "bulk-2"]);
    expect(claimed[0]).toMatchObject({
      channel: "push", audience: "customer", type: "order_paid", title: "Order confirmed",
      destination: { kind: "order", orderId: expect.any(String) }, tag: "customer-order", group: "customer", attempts: 0,
    });
  });

  it("claims only the channels asked for", async () => {
    await one("both", 0, ["push", "email"]);
    const email = await transact((tx) => batchStore(tx).claim(10, ["email"]));
    expect(email.map((c) => [c.channel, c.recipientEmail])).toEqual([["email", "both@example.test"]]);
  });

  it("two batches running at once never claim the same delivery (SKIP LOCKED)", async () => {
    for (let i = 0; i < 6; i += 1) await one(`c-${i}`);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("BEGIN");
      await b.query("BEGIN");
      const first = await batchStore(a).claim(4, ["push"]);
      const second = await batchStore(b).claim(4, ["push"]);
      expect(first).toHaveLength(4);
      expect(second).toHaveLength(2);
      expect(first.map((x) => x.id).filter((id) => second.some((y) => y.id === id))).toEqual([]);
    } finally {
      await a.query("ROLLBACK");
      await b.query("ROLLBACK");
      a.release();
      b.release();
    }
  });

  it("records each outcome: status, attempts and when it finished; a retry stays pending", async () => {
    for (const s of ["a", "b", "c", "e"]) await one(s);
    const rows = await transact((tx) => batchStore(tx).claim(10, ["push"]));
    const id = (sub: string) => rows.find((r) => r.recipientSub === sub)!.id;
    await transact((tx) => batchStore(tx).record([
      { id: id("a"), status: "sent", error: null, attempted: true },
      { id: id("b"), status: "no_device", error: null, attempted: false },
      { id: id("c"), status: "retry", error: "messaging/internal-error", attempted: true },
      { id: id("e"), status: "expired", error: null, attempted: false },
    ]));
    const after = (await pool.query(
      `SELECT n.recipient_sub, d.status, d.attempts, d.last_error, d.processed_at IS NOT NULL AS done
         FROM public.notification_delivery d JOIN public.notification n ON n.id = d.notification_id ORDER BY n.recipient_sub`,
    )).rows;
    expect(after).toEqual([
      { recipient_sub: "a", status: "sent", attempts: 1, last_error: null, done: true },
      { recipient_sub: "b", status: "no_device", attempts: 0, last_error: null, done: true },
      { recipient_sub: "c", status: "pending", attempts: 1, last_error: "messaging/internal-error", done: false },
      { recipient_sub: "e", status: "expired", attempts: 0, last_error: null, done: true },
    ]);
  });

  it("finds every recipient's devices in one query, keyed by audience and person; prunes dead ones", async () => {
    await pool.query(
      `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token, muted_types) VALUES
         ('p-1', 'customer', 'android', 'tok-a', '{}'), ('p-1', 'customer', 'ios', 'tok-b', '{}'),
         ('p-1', 'driver', 'android', 'tok-driver', '{}'), ('p-2', 'shop', 'web', 'tok-web', '{shop_new_order}')`,
    );
    const tokens = await transact((tx) => batchStore(tx).tokensFor([{ sub: "p-1", audience: "customer" }, { sub: "p-2", audience: "shop" }]));
    expect(tokens.get("customer:p-1")!.map((t) => t.fcmToken).sort()).toEqual(["tok-a", "tok-b"]);
    expect(tokens.get("shop:p-2")).toEqual([{ fcmToken: "tok-web", platform: "web", mutedTypes: ["shop_new_order"] }]);
    await transact((tx) => batchStore(tx).prune(["tok-a", "tok-a"]));
    expect((await pool.query(`SELECT fcm_token FROM public.device_token ORDER BY fcm_token`)).rows.map((r) => r.fcm_token)).toEqual(["tok-b", "tok-driver", "tok-web"]);
  });

  it("reports how many deliveries wait and how old the oldest is", async () => {
    expect(await pendingStats(pool)).toEqual({ pending: 0, oldestSeconds: 0 });
    await one("w-1");
    await pool.query(`UPDATE public.notification_delivery SET created_at = now() - interval '5 minutes'`);
    await one("w-2");
    const stats = await pendingStats(pool);
    expect(stats.pending).toBe(2);
    expect(stats.oldestSeconds).toBeGreaterThanOrEqual(299);
  });
});
