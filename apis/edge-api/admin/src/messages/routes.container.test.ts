import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, announced: [] as unknown[] }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@effy/edge-shared")>();
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...orig,
    query,
    pooled: { query },
    withTransaction: (fn: (c: never) => Promise<unknown>) => orig.transactorFor(holder.pool!)(fn as never),
  };
});
vi.mock("@effy/edge-shared/live", () => ({
  announce: async (changes: unknown[]) => {
    holder.announced.push(...changes);
  },
}));

import { activityEntries, migrationSql } from "@effy/edge-shared/testing";
import { applyPreferencesChange, CONSENT_WORDING_VERSION, messageTypeFor, notify } from "@effy/edge-shared/notifications";
import { transactorFor } from "@effy/edge-shared";
import { messageFiling, type MessageKind, type NotificationAudience } from "@effy/shared-types";

import { messageActivitySource, messagesReceivedSource } from "./activity";

import { isMessageError } from "./errors";
import * as svc from "./service";

/** 112 - the messages routes against the real schema: drafts, versions, counts, tests, sends, refusals, roles. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const MANAGER = { sub: "manager-sub", manage: true };
const CSA = { sub: "csa-sub", manage: false };

let container: StartedPostgreSqlContainer;
let pool: Pool;
let n = 0;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isMessageError(e) ? e.code : `other: ${(e as Error).message}`;
  }
}

async function extraOf(p: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await p;
    return {};
  } catch (e) {
    return isMessageError(e) ? e.extra : {};
  }
}

async function driver(): Promise<{ id: string; sub: string }> {
  const sub = `drv-${++n}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, 'Driver', ($1 || '@effyshopping.com')::citext) RETURNING id::text AS id`,
    [sub],
  )).rows[0]!.id;
  return { id, sub };
}

async function customer(): Promise<{ id: string; sub: string }> {
  const sub = `cust-${++n}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@example.test')::citext) RETURNING id::text AS id`,
    [sub],
  )).rows[0]!.id;
  return { id, sub };
}

const announcementTo = (people: string[]) => ({
  kind: "announcement",
  title: "Hub opens at 7 tomorrow",
  body: "Effy's hub opens an hour late on Friday.",
  pictureKey: null,
  push: true,
  endsAt: null,
  audiences: [{ audience: "driver", filter: { people }, destination: { kind: "today" } }],
});

const events = async (id: string) =>
  (await pool.query<{ event: string; actor: string }>(`SELECT event, actor FROM public.message_event WHERE message_id = $1 ORDER BY created_at, id`, [id])).rows;


/** What the sending worker does for one page, written here so the routes' reads can be checked without it. */
async function deliver(id: string, kind: MessageKind, audience: NotificationAudience, subs: string[]): Promise<void> {
  const filing = messageFiling(kind, audience)!;
  await transactorFor(pool)((tx) =>
    notify(tx, {
      type: messageTypeFor(audience), recipients: subs.map((sub) => ({ sub })), subject: { entityId: id }, dedupeScope: id, channels: ["push"],
      message: {
        messageId: id, source: kind === "direct" ? "direct" : "campaign", category: filing.category as never, importance: filing.importance,
        title: "From Effy", body: "Hello from Effy", destination: audience === "driver" ? { kind: "today" } : audience === "shop" ? { kind: "queue" } : { kind: "home" }, imageUrl: null,
      },
    }),
  );
  await pool.query(`UPDATE public.message_audience SET matched_count = matched_count + $3 WHERE message_id = $1 AND audience = $2`, [id, audience, subs.length]);
}

const versionOf = async (id: string) => (await svc.getMessage(id)).version;

d("112 - back-office messages", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 6 });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  describe("drafts", () => {
    it("creates a draft, reads it back, and announces it", async () => {
      const a = await driver();
      holder.announced.length = 0;
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      expect(m).toMatchObject({ kind: "announcement", status: "draft", version: 1, total: null, pictureUrl: null });
      expect(m.audiences).toEqual([{ audience: "driver", filter: { people: [a.id] }, destination: { kind: "today" }, report: null }]);
      expect((await svc.getMessage(m.id)).title).toBe("Hub opens at 7 tomorrow");
      expect(holder.announced).toEqual([{ scope: "ops", kind: "messages" }]);
      expect(await events(m.id)).toEqual([{ event: "created", actor: "manager-sub" }]);
    });

    it("edits with the current version only; a stale one is refused", async () => {
      const a = await driver();
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      const edited = await svc.editMessage(m.id, { ...announcementTo([a.id]), title: "Hub opens at 8", version: 1 }, MANAGER);
      expect(edited).toMatchObject({ title: "Hub opens at 8", version: 2 });
      expect(await codeOf(svc.editMessage(m.id, { ...announcementTo([a.id]), version: 1 }, MANAGER))).toBe("message_changed");
      expect(await codeOf(svc.getMessage("nope"))).toBe("message_not_found");
    });

    it("lists messages: search, filters, paging", async () => {
      const a = await driver();
      for (let i = 0; i < 3; i += 1) await svc.createMessage({ ...announcementTo([a.id]), title: `Listed ${i}` }, MANAGER);
      const page = await svc.listMessages({ q: "Listed", sort: "title" });
      expect(page.total).toBe(3);
      expect(page.items.map((x) => x.title)).toEqual(["Listed 0", "Listed 1", "Listed 2"]);
      expect(page.items[0]).toMatchObject({ kind: "announcement", audiences: ["driver"], status: "draft", reached: 0, openedShare: null });
      expect((await svc.listMessages({ q: "Listed", audience: "customer" })).total).toBe(0);
      const drafts = await svc.listMessages({ q: "Listed", status: "sent" });
      expect(drafts.total).toBe(0);
    });
  });

  describe("counting", () => {
    it("counts each audience now, and for offers who said yes", async () => {
      const yes = await customer();
      const no = await customer();
      await transactorFor(pool)((tx) => applyPreferencesChange(tx, yes.id, { surface: "app", via: "settings", consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION }));
      const c = await svc.audienceCount({ kind: "offer", audiences: [{ audience: "customer", filter: { people: [yes.id, no.id] } }] });
      expect(c).toEqual({ audiences: [{ audience: "customer", matched: 2, consented: 1 }], total: 1 });
      expect(await codeOf(svc.audienceCount({ kind: "offer", audiences: [{ audience: "driver", filter: {} }] }))).toBe("invalid_message");
      expect(await codeOf(svc.audienceCount({ kind: "announcement", audiences: [{ audience: "driver", filter: { nope: true } }] }))).toBe("invalid_audience");
    });
  });

  describe("test and send", () => {
    it("a test reaches one chosen account, marked, and is not counted", async () => {
      const a = await driver();
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      const t = await svc.testSend(m.id, { audience: "driver", personId: a.id }, MANAGER);
      expect(t).toEqual({ inbox: "written", reason: null, push: "queued" });
      const rows = (await pool.query(`SELECT title, message_id FROM public.notification WHERE recipient_sub = $1`, [a.sub])).rows;
      expect(rows).toEqual([{ title: "Test: Hub opens at 7 tomorrow", message_id: null }]);
      // A second test arrives too.
      await svc.testSend(m.id, { audience: "driver", personId: a.id }, MANAGER);
      expect((await pool.query(`SELECT count(*)::int AS n FROM public.notification WHERE recipient_sub = $1`, [a.sub])).rows[0].n).toBe(2);
      expect(await codeOf(svc.testSend(m.id, { audience: "shop", personId: a.id }, MANAGER))).toBe("invalid_message");
    });

    it("sends now with the count confirmed; a changed count or a stale version is refused", async () => {
      const a = await driver();
      const b = await driver();
      const m = await svc.createMessage(announcementTo([a.id, b.id]), MANAGER);
      expect(await codeOf(svc.sendMessage(m.id, { version: m.version, confirmCount: 5 }, MANAGER))).toBe("audience_changed");
      expect(await extraOf(svc.sendMessage(m.id, { version: m.version, confirmCount: 5 }, MANAGER))).toEqual({ count: 2 });
      expect(await codeOf(svc.sendMessage(m.id, { version: 99, confirmCount: 2 }, MANAGER))).toBe("message_changed");
      const sent = await svc.sendMessage(m.id, { version: m.version, confirmCount: 2 }, MANAGER);
      expect(sent.status).toBe("sending");
      expect(sent.sendAt).not.toBeNull();
      expect((await events(m.id)).map((e) => e.event)).toEqual(["created", "sending"]);
      expect(await codeOf(svc.sendMessage(m.id, { version: sent.version, confirmCount: 2 }, MANAGER))).toBe("message_not_editable");
    });

    it("refuses a message nobody matches", async () => {
      const a = await driver();
      await pool.query(`UPDATE public.driver SET status = 'suspended' WHERE id = $1`, [a.id]);
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      expect(await codeOf(svc.sendMessage(m.id, { version: 1, confirmCount: 0 }, MANAGER))).toBe("audience_empty");
    });
  });

  describe("roles", () => {
    it("customer support may not write anything but a direct message", async () => {
      const a = await driver();
      expect(await codeOf(svc.createMessage(announcementTo([a.id]), CSA))).toBe("forbidden");
    });
  });

  describe("schedule, cancel, stop, withdraw (US2)", () => {
    it("a future time schedules it; edits stay allowed; cancel ends it", async () => {
      const a = await driver();
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      const at = new Date(Date.now() + 3_600_000).toISOString();
      const s = await svc.sendMessage(m.id, { version: m.version, confirmCount: 1, sendAt: at }, MANAGER);
      expect(s).toMatchObject({ status: "scheduled", sendAt: at });
      const e = await svc.editMessage(m.id, { ...announcementTo([a.id]), title: "Changed", version: s.version }, MANAGER);
      expect(e).toMatchObject({ status: "scheduled", title: "Changed" });
      expect((await svc.cancelMessage(m.id, { version: e.version }, MANAGER)).status).toBe("cancelled");
      expect(await codeOf(svc.cancelMessage(m.id, {}, MANAGER))).toBe("message_not_editable");
      expect((await events(m.id)).map((x) => x.event)).toEqual(["created", "scheduled", "edited", "cancelled"]);
    });

    it("a time in the past means now", async () => {
      const a = await driver();
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      const s = await svc.sendMessage(m.id, { version: 1, confirmCount: 1, sendAt: "2020-01-01T00:00:00Z" }, MANAGER);
      expect(s.status).toBe("sending");
    });

    it("stop keeps those who have it; withdraw ends every item and the report says so", async () => {
      const a = await driver();
      const b = await driver();
      const m = await svc.createMessage(announcementTo([a.id, b.id]), MANAGER);
      await svc.sendMessage(m.id, { version: 1, confirmCount: 2 }, MANAGER);
      await deliver(m.id, "announcement", "driver", [a.sub]);
      const stopped = await svc.stopMessage(m.id, { version: await versionOf(m.id) }, MANAGER);
      expect(stopped.status).toBe("stopped");
      expect(stopped.total).toMatchObject({ matched: 1, reached: 1 });
      const w = await svc.withdrawMessage(m.id, { version: stopped.version }, MANAGER);
      expect(w.status).toBe("withdrawn");
      const left = (await pool.query(`SELECT count(*)::int AS n FROM public.notification WHERE message_id = $1 AND (expires_at IS NULL OR expires_at > now())`, [m.id])).rows[0].n;
      expect(left).toBe(0);
      expect(await codeOf(svc.withdrawMessage(m.id, {}, MANAGER))).toBe("message_not_editable");
      const log = await activityEntries(pool, messageActivitySource(m.id));
      expect(log.map((x) => x.title)).toEqual(["Withdrawn", "Stopped", "Sending started", "Written"]);
    });

    it("refuses more people than the largest message", async () => {
      await pool.query(`UPDATE public.notification_settings SET max_recipients_per_message = 1`);
      const a = await driver();
      const b = await driver();
      const m = await svc.createMessage(announcementTo([a.id, b.id]), MANAGER);
      expect(await extraOf(svc.sendMessage(m.id, { version: 1, confirmCount: 2 }, MANAGER))).toEqual({ count: 2, limit: 1 });
      await pool.query(`UPDATE public.notification_settings SET max_recipients_per_message = 20000`);
    });
  });

  describe("the report (US3)", () => {
    it("adds up: push parts to reached, reached and no yes to matched (SC-005)", async () => {
      const c1 = await customer();
      const c2 = await customer();
      const c3 = await customer();
      for (const c of [c1, c2]) {
        await transactorFor(pool)((tx) => applyPreferencesChange(tx, c.id, { surface: "app", via: "settings", consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION }));
      }
      const offer = { ...announcementTo([]), kind: "offer", title: "Effy: fruit 20% off", audiences: [{ audience: "customer", filter: { people: [c1.id, c2.id, c3.id] }, destination: { kind: "sale" } }] };
      const m = await svc.createMessage(offer, MANAGER);
      await svc.sendMessage(m.id, { version: 1, confirmCount: 2 }, MANAGER);
      await deliver(m.id, "offer", "customer", [c1.sub, c2.sub, c3.sub]);
      await pool.query(`UPDATE public.notification_delivery d SET status = 'sent' FROM public.notification n WHERE n.id = d.notification_id AND n.recipient_sub = $1`, [c1.sub]);
      await pool.query(`UPDATE public.notification SET seen_at = now(), read_at = now() WHERE recipient_sub = $1`, [c1.sub]);
      const r = (await svc.getMessage(m.id)).total!;
      expect(r).toMatchObject({ matched: 3, reached: 2, noConsent: 1, seen: 1, opened: 1 });
      const pushSum = Object.values(r.push).reduce((x, y) => x + y, 0);
      expect(pushSum).toBe(r.reached);
      expect(r.reached + r.noConsent).toBe(r.matched);
      const row = (await svc.listMessages({ q: "fruit" })).items[0]!;
      expect(row).toMatchObject({ reached: 2, openedShare: 0.5 });
    });
  });

  describe("direct messages and roles (US4, SC-007)", () => {
    it("customer support sends a direct message to one person now, and nothing else", async () => {
      const c = await customer();
      const direct = { ...announcementTo([]), kind: "direct", title: "About your order", audiences: [{ audience: "customer", filter: { people: [c.id] }, destination: { kind: "points" } }] };
      const m = await svc.createMessage(direct, CSA);
      expect(await codeOf(svc.sendMessage(m.id, { version: 1, confirmCount: 1, sendAt: new Date(Date.now() + 3_600_000).toISOString() }, CSA))).toBe("forbidden");
      expect((await svc.sendMessage(m.id, { version: 1, confirmCount: 1 }, CSA)).status).toBe("sending");
      expect(await codeOf(svc.stopMessage(m.id, {}, CSA))).toBe("forbidden");
      expect(await codeOf(svc.withdrawMessage(m.id, {}, CSA))).toBe("forbidden");
      expect(await codeOf(svc.editMessage(m.id, { ...direct, version: 1 }, CSA))).toBe("forbidden");
      expect(await codeOf(svc.pictureUpload(m.id, {}, CSA))).toBe("forbidden");
      expect(await codeOf(svc.createMessage({ ...direct, audiences: [{ audience: "customer", filter: { people: [c.id, (await customer()).id] }, destination: { kind: "home" } }] }, CSA))).toBe("invalid_message");
      await deliver(m.id, "direct", "customer", [c.sub]);
      const received = await activityEntries(pool, messagesReceivedSource("customer", c.id));
      expect(received.map((x) => x.title)).toEqual(["About your order"]);
    });

    it("refuses a closed account and someone else's order", async () => {
      const c = await customer();
      await pool.query(`UPDATE public.customer SET closure_state = 'closing' WHERE id = $1`, [c.id]);
      const direct = { ...announcementTo([]), kind: "direct", audiences: [{ audience: "customer", filter: { people: [c.id] }, destination: { kind: "home" } }] };
      expect(await codeOf(svc.createMessage(direct, CSA))).toBe("recipient_unavailable");
      const other = await customer();
      const theirs = { ...direct, audiences: [{ audience: "customer", filter: { people: [other.id] }, destination: { kind: "order", orderId: "33333333-3333-4333-8333-333333333333" } }] };
      expect(await codeOf(svc.createMessage(theirs, CSA))).toBe("invalid_destination");
    });
  });

  describe("customers (US5, US6)", () => {
    it("all customers needs the count typed", async () => {
      await customer();
      const m = await svc.createMessage({ ...announcementTo([]), kind: "important", audiences: [{ audience: "customer", filter: {}, destination: { kind: "home" } }] }, MANAGER);
      const { count } = (await extraOf(svc.sendMessage(m.id, { version: 1, confirmCount: 0 }, MANAGER))) as { count: number };
      expect(await codeOf(svc.sendMessage(m.id, { version: 1, confirmCount: count }, MANAGER))).toBe("confirmation_required");
      expect((await svc.sendMessage(m.id, { version: 1, confirmCount: count, typedCount: count }, MANAGER)).status).toBe("sending");
    });

    it("offers and news must name Effy; a test to someone without a yes is not delivered", async () => {
      const c = await customer();
      const offer = { ...announcementTo([]), kind: "offer", title: "20% off fruit", body: "This weekend only.", audiences: [{ audience: "customer", filter: { people: [c.id] }, destination: { kind: "sale" } }] };
      const m = await svc.createMessage(offer, MANAGER);
      expect(await codeOf(svc.sendMessage(m.id, { version: 1, confirmCount: 0 }, MANAGER))).toBe("message_must_name_effy");
      expect(await codeOf(svc.testSend(m.id, { audience: "customer", personId: c.id }, MANAGER))).toBe("message_must_name_effy");
      const e = await svc.editMessage(m.id, { ...offer, body: "From Effy, this weekend only.", version: 1 }, MANAGER);
      expect(await svc.testSend(e.id, { audience: "customer", personId: c.id }, MANAGER)).toEqual({ inbox: "not_written", reason: "no_consent", push: "none" });
      expect(await codeOf(svc.sendMessage(m.id, { version: e.version, confirmCount: 0 }, MANAGER))).toBe("audience_empty");
    });

    it("duplicates keep the words and audience, and say where they came from (US7)", async () => {
      const a = await driver();
      const m = await svc.createMessage(announcementTo([a.id]), MANAGER);
      const copy = await svc.createMessage({ ...announcementTo([a.id]), fromMessageId: m.id }, MANAGER);
      expect(copy).toMatchObject({ status: "draft", duplicatedFrom: m.id, sendAt: null });
      expect((await events(copy.id)).map((x) => x.event)).toEqual(["duplicated"]);
    });
  });
});
