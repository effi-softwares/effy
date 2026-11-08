import { describe, expect, it, vi } from "vitest";

import type { RecipientToken } from "@effy/edge-shared";

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

  store(): BatchStore {
    return {
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
    expect(d.sendEmail).toHaveBeenCalledWith("c@example.test", "order_delivered", "o-9");
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
