import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../testing/migrations";
import { catalogueEntry } from "./catalogue";
import { notify } from "./notify";
import { markRead } from "./read";

/** 109 - one notification per person per event, deliveries only for new rows, words kept, read only by its owner. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;
const scope = () => `scope-${++seq}`;

const notifications = async (sub: string) =>
  (await pool.query(`SELECT * FROM public.notification WHERE recipient_sub = $1 ORDER BY created_at`, [sub])).rows;
const deliveries = async (sub: string) =>
  (await pool.query(
    `SELECT d.channel, d.status, d.priority, d.recipient_email FROM public.notification_delivery d
       JOIN public.notification n ON n.id = d.notification_id WHERE n.recipient_sub = $1 ORDER BY d.channel`,
    [sub],
  )).rows;

d("notify (109)", () => {
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

  it("keeps one notification per person with the catalogue's words, destination and category", async () => {
    const s = scope();
    const created = await transact((tx) =>
      notify(tx, { type: "order_paid", recipients: [{ sub: "c-1", email: "c1@example.test" }], subject: { entityId: "o-1" }, dedupeScope: s, channels: ["push"] }),
    );
    expect(created).toBe(1);
    const [n] = await notifications("c-1");
    expect(n).toMatchObject({
      audience: "customer", type: "order_paid", category: "orders", importance: "normal", source: "system",
      title: catalogueEntry("order_paid").title, body: catalogueEntry("order_paid").body, entity_id: "o-1",
      destination: { kind: "order", orderId: "o-1" }, seen_at: null, read_at: null, archived_at: null, expires_at: null,
      dedupe_key: `order_paid:c-1:${s}`,
    });
    expect(await deliveries("c-1")).toEqual([{ channel: "push", status: "pending", priority: 0, recipient_email: null }]);
  });

  it("the same event twice creates no second notification and no second push or email (FR-005)", async () => {
    const s = scope();
    const input = {
      type: "points_credited" as const, recipients: [{ sub: "c-2", email: "c2@example.test" }],
      subject: { entityId: "entry-1" }, dedupeScope: s, channels: ["push", "email"] as const,
    };
    expect(await transact((tx) => notify(tx, input))).toBe(1);
    expect(await transact((tx) => notify(tx, input))).toBe(0);
    expect(await notifications("c-2")).toHaveLength(1);
    expect(await deliveries("c-2")).toEqual([
      { channel: "email", status: "pending", priority: 0, recipient_email: "c2@example.test" },
      { channel: "push", status: "pending", priority: 0, recipient_email: null },
    ]);
  });

  it("one notification per staff member; email only for someone with an address; duplicates in the list collapse", async () => {
    const s = scope();
    const created = await transact((tx) =>
      notify(tx, {
        type: "shop_new_order",
        recipients: [{ sub: "st-1" }, { sub: "st-2", email: "st2@example.test" }, { sub: "st-1" }],
        subject: { entityId: "f-1" }, dedupeScope: s, channels: ["push", "email"],
      }),
    );
    expect(created).toBe(2);
    expect(await deliveries("st-1")).toEqual([{ channel: "push", status: "pending", priority: 0, recipient_email: null }]);
    expect((await deliveries("st-2")).map((r) => r.channel)).toEqual(["email", "push"]);
    expect((await notifications("st-1"))[0].destination).toEqual({ kind: "queue", fulfillmentId: "f-1" });
  });

  it("is kept even when no channel can deliver it (FR-006), and stores expiry and priority", async () => {
    const at = new Date("2030-01-01T10:00:00Z");
    await transact((tx) => notify(tx, { type: "run_opens_soon", recipients: [{ sub: "d-1" }], subject: { entityId: "r-1" }, dedupeScope: scope(), channels: [], expiresAt: at }));
    const [n] = await notifications("d-1");
    expect(new Date(n.expires_at).toISOString()).toBe(at.toISOString());
    expect(await deliveries("d-1")).toEqual([]);

    await transact((tx) => notify(tx, { type: "run_assigned", recipients: [{ sub: "d-1" }], subject: { entityId: "r-2" }, dedupeScope: scope(), channels: ["push"], priority: 1 }));
    expect((await deliveries("d-1"))[0].priority).toBe(1);
  });

  it("nothing is written when the change it reports is rolled back (FR-009)", async () => {
    await expect(
      transact(async (tx) => {
        await notify(tx, { type: "order_paid", recipients: [{ sub: "c-3" }], subject: { entityId: "o-3" }, dedupeScope: scope(), channels: ["push"] });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await notifications("c-3")).toEqual([]);
  });

  it("an empty recipient list is a no-op", async () => {
    expect(await transact((tx) => notify(tx, { type: "order_paid", recipients: [], subject: { entityId: "o" }, dedupeScope: scope(), channels: ["push"] }))).toBe(0);
  });

  describe("markRead", () => {
    async function one(sub: string, type: "order_paid" | "run_assigned" = "order_paid") {
      await transact((tx) => notify(tx, { type, recipients: [{ sub }], subject: { entityId: "x-1" }, dedupeScope: scope(), channels: ["push"] }));
      return (await notifications(sub)).at(-1)!.id as string;
    }

    it("the owner reads it: read and seen, the stored destination back (FR-017)", async () => {
      const id = await one("r-owner");
      const r = await markRead("r-owner", "customer", id, pool);
      expect(r).toMatchObject({ notificationId: id, destination: { kind: "order", orderId: "x-1" } });
      const [n] = await notifications("r-owner");
      expect(n.read_at).not.toBeNull();
      expect(n.seen_at).not.toBeNull();
    });

    it("a second read keeps the first read time", async () => {
      const id = await one("r-twice");
      const first = await markRead("r-twice", "customer", id, pool);
      await new Promise((ok) => setTimeout(ok, 20));
      const second = await markRead("r-twice", "customer", id, pool);
      expect(second!.readAt).toBe(first!.readAt);
    });

    it("someone else, or the same person under another audience, finds nothing (FR-014)", async () => {
      const id = await one("r-mine");
      expect(await markRead("r-someone-else", "customer", id, pool)).toBeNull();
      expect(await markRead("r-mine", "driver", id, pool)).toBeNull();
      expect(await markRead("r-mine", "customer", "not-a-uuid", pool)).toBeNull();
      expect(await markRead("r-mine", "customer", "00000000-0000-4000-8000-000000000000", pool)).toBeNull();
      expect((await notifications("r-mine"))[0].read_at).toBeNull();
    });
  });

  // 110 - pinned, inbox-only, and the live "inbox" word sent once the change has committed.
  it("stores a pin for an important notification and refuses one for a normal type", async () => {
    const until = new Date(Date.now() + 3_600_000);
    await transact((tx) =>
      notify(tx, { type: "driver_runs_today", recipients: [{ sub: "d-pin" }], subject: { entityId: "2026-11-09", count: 2 }, dedupeScope: "2026-11-09", channels: [], pinnedUntil: until }),
    );
    const [n] = await notifications("d-pin");
    expect(n).toMatchObject({ importance: "important", title: "You have 2 runs today", destination: { kind: "today" } });
    expect(new Date(n.pinned_until).getTime()).toBe(until.getTime());
    expect(await deliveries("d-pin")).toEqual([]);

    await expect(
      transact((tx) => notify(tx, { type: "order_paid", recipients: [{ sub: "c-pin" }], subject: { entityId: "o" }, dedupeScope: scope(), channels: ["push"], pinnedUntil: until })),
    ).rejects.toThrow(/only an important notification/);
  });

  it("says 1 run, not 1 runs", async () => {
    await transact((tx) =>
      notify(tx, { type: "driver_runs_today", recipients: [{ sub: "d-one" }], subject: { entityId: "2026-11-09", count: 1 }, dedupeScope: "2026-11-09", channels: [] }),
    );
    expect((await notifications("d-one"))[0].title).toBe("You have 1 run today");
  });

  it("announces inbox after commit, once per person, and not for a rollback or a repeat (FR-018)", async () => {
    const published: string[] = [];
    vi.stubEnv("LIVE_HTTP_HOST", "live.example.test");
    vi.stubEnv("AWS_REGION", "ap-southeast-2");
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { channel: string; events: string[] };
      published.push(`${body.channel.split("/").slice(0, 3).join("/")} ${body.events.join(",")}`);
      return new Response(null, { status: 200 });
    });
    try {
      const s = scope();
      let duringTx = 0;
      await transact(async (tx) => {
        await notify(tx, { type: "order_paid", recipients: [{ sub: "c-live" }], subject: { entityId: "o-l" }, dedupeScope: s, channels: ["push"] });
        duringTx = published.length;
      });
      expect(duringTx).toBe(0);
      expect(new Set(published)).toEqual(new Set(['/customer/c-live {"k":"inbox"}']));

      published.length = 0;
      await transact((tx) => notify(tx, { type: "order_paid", recipients: [{ sub: "c-live" }], subject: { entityId: "o-l" }, dedupeScope: s, channels: ["push"] }));
      expect(published).toEqual([]);

      await expect(
        transact(async (tx) => {
          await notify(tx, { type: "order_paid", recipients: [{ sub: "c-rolled" }], subject: { entityId: "o-r" }, dedupeScope: scope(), channels: ["push"] });
          throw new Error("payment failed");
        }),
      ).rejects.toThrow("payment failed");
      expect(published).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
