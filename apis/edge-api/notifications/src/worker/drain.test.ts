import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Queryable, RecipientToken } from "@effy/edge-shared";

import type { PushMessage, SendResult } from "../fcm/sender";
import { drainOnce, type BatchStore, type ClaimedDelivery, type DeliveryChannel, type DrainDeps, type Outcome } from "./drain";

/** An in-memory queue standing in for the tables: claim honours priority-then-age order and the channels asked for. */
class FakeStore {
  rows: Array<ClaimedDelivery & { priority: number; seq: number; status: string }> = [];
  tokens = new Map<string, RecipientToken[]>();
  recorded: Outcome[] = [];
  pruned: string[] = [];
  private seq = 0;

  add(over: Partial<ClaimedDelivery> & { priority?: number } = {}) {
    const id = over.id ?? `d${this.seq + 1}`;
    this.rows.push({
      id, notificationId: `n-${id}`, channel: "push", recipientEmail: null, attempts: 0, recipientSub: "sub-1",
      audience: "customer", type: "order_paid", title: "Order confirmed", body: "We've received your order.",
      entityId: "o-1", destination: { kind: "order", orderId: "o-1" }, expiresAt: null, tag: "customer-order",
      group: "customer", priority: 0, seq: this.seq++, status: "pending", ...over,
    });
  }

  /** Stands for the batch's transaction: an email must read through it, never the one-connection pool. */
  readonly db = { query: async () => ({ rows: [] }) } as unknown as Queryable;

  store(): BatchStore {
    return {
      db: this.db,
      claim: async (limit: number, channels: readonly DeliveryChannel[]) =>
        this.rows
          .filter((r) => r.status === "pending" && channels.includes(r.channel))
          .sort((a, b) => a.priority - b.priority || a.seq - b.seq)
          .slice(0, limit),
      tokensFor: async () => this.tokens,
      record: async (outcomes) => {
        this.recorded.push(...outcomes);
        for (const o of outcomes) {
          const r = this.rows.find((x) => x.id === o.id)!;
          r.status = o.status === "retry" ? "pending" : o.status;
          if (o.attempted) r.attempts += 1;
        }
      },
      prune: async (t) => void this.pruned.push(...t),
    };
  }
}

function deps(store: FakeStore, over: Partial<DrainDeps> = {}): DrainDeps & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  let clock = 1_000;
  return {
    sent,
    senderConfigured: true,
    maxAttempts: 5,
    batchSize: 100,
    deadline: Number.POSITIVE_INFINITY,
    now: () => clock++,
    inBatch: (fn) => fn(store.store()),
    sendEach: vi.fn(async (messages: readonly PushMessage[]): Promise<SendResult[]> => {
      sent.push(...messages);
      return messages.map(() => ({ ok: true, prune: false }));
    }),
    sendEmail: vi.fn(async (): Promise<SendResult> => ({ ok: true, prune: false })),
    ...over,
  };
}

const android = (t: string, mutedTypes: string[] = []): RecipientToken => ({ fcmToken: t, platform: "android", mutedTypes });

describe("delivery drain (109)", () => {
  it("sends the row's own words and destination, and its notification id (FR-003)", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok-1")]);
    s.add({ title: "Words as sent", body: "Kept as they were." });
    const d = deps(s);
    const summary = await drainOnce(d);
    expect(summary.sent).toBe(1);
    expect(d.sent[0]).toMatchObject({
      token: "tok-1", type: "order_paid", notificationId: "n-d1", title: "Words as sent", body: "Kept as they were.",
      destination: '{"kind":"order","orderId":"o-1"}',
    });
    expect(s.rows[0]!.status).toBe("sent");
  });

  it("an expired notification is abandoned, never sent late (FR-007)", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok-1")]);
    s.add({ expiresAt: new Date(0) });
    const d = deps(s);
    const summary = await drainOnce(d);
    expect(summary.expired).toBe(1);
    expect(d.sent).toEqual([]);
    expect(s.recorded).toEqual([{ id: "d1", status: "expired", error: null, attempted: false }]);
  });

  it("a held promotion no longer allowed when released is skipped, never sent (111 FR-011)", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok-1")]);
    s.add({ allowed: false });
    const d = deps(s);
    const summary = await drainOnce(d);
    expect(summary.skipped).toBe(1);
    expect(d.sent).toEqual([]);
    expect(s.recorded).toEqual([{ id: "d1", status: "skipped", error: null, attempted: false }]);
  });

  it("passes the category's Android channel to the message (111 R12)", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok-1")]);
    s.add({ androidChannel: "orders" });
    const d = deps(s);
    await drainOnce(d);
    expect(d.sent[0]!.androidChannel).toBe("orders");
  });

  it("no device → no_device; every device muted → muted; neither is an attempt", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-muted", [{ fcmToken: "w", platform: "web", mutedTypes: ["order_paid"] }]);
    s.add({ id: "nobody", recipientSub: "sub-none" });
    s.add({ id: "quiet", recipientSub: "sub-muted" });
    const summary = await drainOnce(deps(s));
    expect(summary).toMatchObject({ noDevice: 1, muted: 1, sent: 0 });
    expect(s.recorded.map((o) => [o.id, o.status, o.attempted])).toEqual([["nobody", "no_device", false], ["quiet", "muted", false]]);
  });

  it("one device getting it is enough; a dead token is pruned", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("dead"), android("alive")]);
    s.add();
    const d = deps(s, {
      sendEach: async (m) => m.map((x) => (x.token === "dead"
        ? { ok: false, prune: true, errorClass: "messaging/registration-token-not-registered" }
        : { ok: true, prune: false })),
    });
    const summary = await drainOnce(d);
    expect(summary).toMatchObject({ sent: 1, pruned: 1 });
    expect(s.pruned).toEqual(["dead"]);
  });

  it("a failure that may pass is retried, then recorded failed at the limit (FR-021)", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok")]);
    s.add({ attempts: 3 });
    const failing = { sendEach: async (m: readonly PushMessage[]) => m.map(() => ({ ok: false, prune: false, errorClass: "messaging/internal-error" })) };
    await drainOnce(deps(s, failing));
    expect(s.rows[0]).toMatchObject({ status: "pending", attempts: 4 });
    await drainOnce(deps(s, failing));
    expect(s.rows[0]).toMatchObject({ status: "failed", attempts: 5 });
  });

  it("email goes through the email sender with the snapshotted address", async () => {
    const s = new FakeStore();
    s.add({ channel: "email", recipientEmail: "c@example.test", type: "order_delivered", entityId: "o-9" });
    const d = deps(s);
    const summary = await drainOnce(d);
    expect(d.sendEmail).toHaveBeenCalledWith("c@example.test", "order_delivered", "o-9", expect.anything());
    expect(summary).toMatchObject({ emailSent: 1, sent: 1 });
  });

  it("without FCM only email is claimed; push stays pending untouched", async () => {
    const s = new FakeStore();
    s.add({ id: "p" });
    s.add({ id: "e", channel: "email", recipientEmail: "c@example.test" });
    const summary = await drainOnce(deps(s, { senderConfigured: false }));
    expect(summary.disabled).toBe(true);
    expect(s.rows.find((r) => r.id === "p")).toMatchObject({ status: "pending", attempts: 0 });
    expect(s.rows.find((r) => r.id === "e")!.status).toBe("sent");
  });

  it("keeps claiming batches until the queue is empty, and stops at the deadline", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok")]);
    for (let i = 0; i < 250; i += 1) s.add();
    const all = await drainOnce(deps(s));
    expect(all).toMatchObject({ batches: 3, sent: 250 });

    const t = new FakeStore();
    t.tokens.set("customer:sub-1", [android("tok")]);
    for (let i = 0; i < 250; i += 1) t.add();
    let clock = 0;
    const one = await drainOnce(deps(t, { now: () => (clock += 10), deadline: 15 }));
    expect(one.batches).toBe(1);
  });
});

describe("sending keeps up (109 US6)", () => {
  /**
   * A one-minute invocation with a 45 s budget, against a stub FCM that takes 1.5 s per call of up to 500 messages
   * (slower than FCM usually is). 20,000 must reach a final status within 10 invocations (FR-019).
   */
  function simulatedRun(store: FakeStore, startMs: number) {
    let clock = startMs;
    return deps(store, {
      batchSize: 500,
      now: () => clock,
      deadline: startMs + 45_000,
      sendEach: async (m) => {
        clock += Math.ceil(m.length / 500) * 1_500;
        return m.map(() => ({ ok: true, prune: false }));
      },
    });
  }

  it("20,000 deliveries reach a final status within 10 one-minute runs", async () => {
    const s = new FakeStore();
    for (let i = 0; i < 20_000; i += 1) s.tokens.set(`customer:c-${i}`, [android(`t-${i}`)]);
    for (let i = 0; i < 20_000; i += 1) s.add({ id: `d${i}`, recipientSub: `c-${i}`, priority: 1 });
    let runs = 0;
    while (s.rows.some((r) => r.status === "pending") && runs < 10) {
      await drainOnce(simulatedRun(s, runs * 60_000));
      runs += 1;
    }
    expect(s.rows.filter((r) => r.status === "pending")).toHaveLength(0);
    expect(runs).toBeLessThanOrEqual(10);
  });

  it("one new notification is sent in the next run, ahead of a 20,000 bulk backlog (FR-020)", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok")]);
    for (let i = 0; i < 20_000; i += 1) s.add({ id: `bulk-${i}`, priority: 1 });
    s.add({ id: "urgent", priority: 0 });
    const d = simulatedRun(s, 0);
    d.batchSize = 500;
    // Only the first batch matters: stop after it.
    d.deadline = 1;
    await drainOnce(d);
    expect(s.rows.find((r) => r.id === "urgent")!.status).toBe("sent");
  });
});

describe("116 D7 - urgency on iPhones, from importance and category", () => {
  const ios = (t: string): RecipientToken => ({ fcmToken: t, platform: "ios", mutedTypes: [] });
  const levels = async (on: boolean) => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [ios("tok-1")]);
    s.add({ id: "imp", importance: "important", category: "important" });
    s.add({ id: "msg", importance: "important", category: "offers", type: "customer_message" });
    s.add({ id: "off", importance: "normal", category: "offers", type: "customer_message" });
    s.add({ id: "ord", importance: "normal", category: "orders" });
    const d = deps(s, { timeSensitiveOn: on });
    await drainOnce(d);
    return Object.fromEntries(d.sent.map((m) => [m.notificationId, m.interruptionLevel]));
  };

  it("switched on: important (system or a back-office message) breaks through; offers are quiet; the rest ordinary", async () => {
    expect(await levels(true)).toEqual({ "n-imp": "time-sensitive", "n-msg": "time-sensitive", "n-off": "passive", "n-ord": "active" });
  });

  it("switched off (before the paid Apple account): nothing asks for time-sensitive, and nothing fails", async () => {
    expect(await levels(false)).toEqual({ "n-imp": "active", "n-msg": "active", "n-off": "passive", "n-ord": "active" });
  });
});

describe("an email that throws never re-sends the batch's pushes (dev, 2026-11-13)", () => {
  it("the push is recorded sent and the email becomes a retry, then a failure - the batch is never rolled back", async () => {
    const s = new FakeStore();
    s.tokens.set("customer:sub-1", [android("tok-1")]);
    s.add({ id: "push", channel: "push", type: "customer_message", category: "important", importance: "important" });
    s.add({ id: "mail", channel: "email", recipientEmail: "a@example.test", type: "customer_message", category: "important" });
    const d = deps(s, { sendMessageEmail: vi.fn(async () => { throw new Error("template exploded"); }) });
    await drainOnce(d);
    expect(d.sent).toHaveLength(1);
    expect(s.recorded.find((o) => o.id === "push")).toMatchObject({ status: "sent" });
    expect(s.recorded.find((o) => o.id === "mail")).toMatchObject({ status: "retry", error: "threw:Error", attempted: true });

    const last = new FakeStore();
    last.add({ id: "mail", channel: "email", recipientEmail: "a@example.test", type: "customer_message", attempts: 4 });
    await drainOnce(deps(last, { sendMessageEmail: vi.fn(async () => { throw new Error("again"); }) }));
    expect(last.recorded[0]).toMatchObject({ status: "failed", error: "threw:Error" });
  });
});

describe("emails read through the batch's own transaction (the pool has one connection)", () => {
  it("both email paths are handed the batch's db - never left to borrow from the pool the batch holds", async () => {
    const s = new FakeStore();
    s.add({ id: "msg", channel: "email", recipientEmail: "a@example.test", type: "customer_message" });
    s.add({ id: "sys", channel: "email", recipientEmail: "a@example.test", type: "order_delivered" });
    const sendMessageEmail = vi.fn(async (_d: ClaimedDelivery, _db: Queryable): Promise<SendResult> => ({ ok: true, prune: false }));
    const d = deps(s, { sendMessageEmail });
    await drainOnce(d);
    expect(sendMessageEmail.mock.calls[0]![1]).toBe(s.db);
    expect((d.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]![3]).toBe(s.db);
  });

  it("the email sender never reads through the shared pool or query() while sending", () => {
    const src = readFileSync(resolve(__dirname, "email-sender.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/^import .*$/gm, "");
    expect(src).not.toMatch(/await query[<(]/);
    // `pooled` only as a parameter default (for callers outside a transaction).
    expect(src.match(/pooled/g)?.length ?? 0).toBe(src.match(/db: Queryable = pooled/g)?.length ?? 0);
  });
});
