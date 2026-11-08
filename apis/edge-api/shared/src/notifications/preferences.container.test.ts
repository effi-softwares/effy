import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../testing/migrations";
import type { NotificationEntry } from "./catalogue";
import { notify, type NotifyInput } from "./notify";
import {
  applyPreferencesChange,
  askForOffers,
  CONSENT_WORDING_VERSION,
  parsePreferencesChange,
  preferencesFor,
  PreferencesRefused,
} from "./preferences";

/** 111 - the person's say, applied where notify() writes (contracts/sending-rules.md), against real PostgreSQL. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const TZ = process.env.OPERATING_TZ || "Australia/Melbourne";

vi.mock("./announce-inbox", () => ({ announceInbox: vi.fn(async () => undefined) }));

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;
const scope = () => `scope-${++seq}`;

/** A marketing kind (spec 4 adds the real ones), written under an existing type so the type CHECK is untouched. */
const OFFER: NotificationEntry = {
  audience: "customer", category: "offers", importance: "normal", tag: "customer-offer", group: "customer",
  title: "A weekend deal from Effy", body: "Fruit is 20% off until Sunday.", destination: () => ({ kind: "sale" }),
};
const NEWS: NotificationEntry = { ...OFFER, category: "news", title: "New at Effy", body: "Seasonal picks have landed." };

async function customer(tag: string): Promise<{ id: string; sub: string }> {
  const sub = `sub-${tag}-${++seq}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@example.test')::citext) RETURNING id::text AS id`,
    [sub],
  )).rows[0]!.id;
  return { id, sub };
}

async function consent(customerId: string, category: "offers" | "news", granted: boolean, via: "prompt" | "settings" | "inbox" = "settings") {
  await transact((tx) => applyPreferencesChange(tx, customerId, { surface: "app", via, consent: { [category]: granted }, wordingVersion: CONSENT_WORDING_VERSION }));
}

async function choose(customerId: string, category: string, channel: "push" | "email", enabled: boolean) {
  await transact((tx) => applyPreferencesChange(tx, customerId, { surface: "web", changes: [{ category, channel, enabled }] }));
}

const sendOffer = (sub: string, opts: { entry?: NotificationEntry; now?: Date; channels?: NotifyInput["channels"]; expiresAt?: Date } = {}) =>
  transact((tx) =>
    notify(
      tx,
      { type: "order_paid", recipients: [{ sub, email: `${sub}@example.test` }], subject: { entityId: "x" }, dedupeScope: scope(), channels: opts.channels ?? ["push"], expiresAt: opts.expiresAt },
      { entry: opts.entry ?? OFFER, now: opts.now },
    ),
  );

const sendOrderPaid = (sub: string, now?: Date) =>
  transact((tx) =>
    notify(tx, { type: "order_paid", recipients: [{ sub, email: `${sub}@example.test` }], subject: { entityId: "o" }, dedupeScope: scope(), channels: ["push", "email"] }, { now }),
  );

const rows = async (sub: string) =>
  (await pool.query<{ category: string; channel: string; status: string; not_before: Date | null }>(
    `SELECT n.category, d.channel, d.status, d.not_before FROM public.notification n
       LEFT JOIN public.notification_delivery d ON d.notification_id = n.id
      WHERE n.recipient_sub = $1 ORDER BY n.created_at, d.channel`,
    [sub],
  )).rows;

/** A moment at hh:mm today on Effy's clock. */
async function effyTime(hh: number, mm = 0): Promise<Date> {
  const r = await pool.query<{ t: Date }>(
    `SELECT ((date_trunc('day', now() AT TIME ZONE $1) + make_interval(hours => $2, mins => $3)) AT TIME ZONE $1) AS t`,
    [TZ, hh, mm],
  );
  return new Date(r.rows[0]!.t);
}
async function effyAt(dayOffset: number, hh: number): Promise<Date> {
  const r = await pool.query<{ t: Date }>(
    `SELECT ((date_trunc('day', now() AT TIME ZONE $1) + make_interval(days => $2, hours => $3)) AT TIME ZONE $1) AS t`,
    [TZ, dayOffset, hh],
  );
  return new Date(r.rows[0]!.t);
}

d("notification preferences and consent (111)", () => {
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
    await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 1, promo_push_per_week = 3`);
  });

  describe("at the moment of sending (FR-011, FR-017)", () => {
    it("a required category is always sent, whatever anyone chose", async () => {
      const c = await customer("req");
      const created = await transact((tx) =>
        notify(tx, { type: "order_paid", recipients: [{ sub: c.sub }], subject: { entityId: "o" }, dedupeScope: scope(), channels: ["push"] }, {
          entry: { ...OFFER, category: "important", title: "A change to your delivery", body: "Tap to see it." },
        }),
      );
      expect(created).toBe(1);
      expect(await rows(c.sub)).toEqual([{ category: "important", channel: "push", status: "pending", not_before: null }]);
    });

    it("a channel turned off is skipped, the other is sent, and the inbox item is there (SC-004)", async () => {
      const c = await customer("muted");
      await choose(c.id, "orders", "push", false);
      expect(await sendOrderPaid(c.sub)).toBe(1);
      expect((await rows(c.sub)).map((r) => [r.channel, r.status])).toEqual([["email", "pending"], ["push", "skipped"]]);
    });

    it("no choice means the default: orders on both channels", async () => {
      const c = await customer("default");
      await sendOrderPaid(c.sub);
      expect((await rows(c.sub)).map((r) => [r.channel, r.status])).toEqual([["email", "pending"], ["push", "pending"]]);
    });

    it("a promotion reaches nobody who has not said yes: no row at all (SC-001)", async () => {
      const never = await customer("never");
      const said_no = await customer("no");
      await consent(said_no.id, "offers", false);
      expect(await sendOffer(never.sub)).toBe(0);
      expect(await sendOffer(said_no.sub)).toBe(0);
      expect(await rows(never.sub)).toEqual([]);
      expect(await rows(said_no.sub)).toEqual([]);
    });

    it("yes to news is not yes to offers", async () => {
      const c = await customer("news-only");
      await consent(c.id, "news", true);
      expect(await sendOffer(c.sub)).toBe(0);
      expect(await sendOffer(c.sub, { entry: NEWS, now: await effyTime(12) })).toBe(1);
    });

    it("with a yes and push on, it is written and pushed in the day", async () => {
      const c = await customer("yes");
      await consent(c.id, "offers", true);
      expect(await sendOffer(c.sub, { now: await effyTime(12) })).toBe(1);
      expect(await rows(c.sub)).toEqual([{ category: "offers", channel: "push", status: "pending", not_before: null }]);
    });

    it("with a yes but push off, the inbox item is written and the push skipped", async () => {
      const c = await customer("yes-quiet");
      await consent(c.id, "offers", true);
      await choose(c.id, "offers", "push", false);
      expect(await sendOffer(c.sub, { now: await effyTime(12) })).toBe(1);
      expect((await rows(c.sub)).map((r) => r.status)).toEqual(["skipped"]);
    });

    it("the latest answer counts: yes then no means nothing reaches them", async () => {
      const c = await customer("changed");
      await consent(c.id, "offers", true);
      await consent(c.id, "offers", false, "inbox");
      expect(await sendOffer(c.sub)).toBe(0);
    });

    it("a promotion that does not name Effy is refused before anything is written (FR-022)", async () => {
      const c = await customer("anon");
      await consent(c.id, "offers", true);
      await expect(sendOffer(c.sub, { entry: { ...OFFER, title: "A weekend deal", body: "Fruit is 20% off." } })).rejects.toThrow(/name Effy/);
      expect(await rows(c.sub)).toEqual([]);
    });
  });

  describe("quiet hours (FR-018, SC-005)", () => {
    it("at 22:00 the inbox item is written now and the push waits for 08:00 tomorrow", async () => {
      const c = await customer("night");
      await consent(c.id, "offers", true);
      await sendOffer(c.sub, { now: await effyTime(22) });
      const [r] = await rows(c.sub);
      expect(r!.status).toBe("pending");
      expect(new Date(r!.not_before!).getTime()).toBe((await effyAt(1, 8)).getTime());
    });

    it("at 07:59 it waits for 08:00 the same day; at 08:00 it goes now", async () => {
      const a = await customer("early");
      const b = await customer("eight");
      await consent(a.id, "offers", true);
      await consent(b.id, "offers", true);
      await sendOffer(a.sub, { now: await effyTime(7, 59) });
      await sendOffer(b.sub, { now: await effyTime(8) });
      expect(new Date((await rows(a.sub))[0]!.not_before!).getTime()).toBe((await effyAt(0, 8)).getTime());
      expect((await rows(b.sub))[0]!.not_before).toBeNull();
    });

    it("an order update at 23:00 is pushed at once (FR-021)", async () => {
      const c = await customer("late-order");
      await sendOrderPaid(c.sub, await effyTime(23));
      expect((await rows(c.sub)).every((r) => r.not_before === null && r.status === "pending")).toBe(true);
    });
  });

  describe("limits (FR-019, SC-006)", () => {
    it("the second promotional push in a day goes to the inbox only", async () => {
      const c = await customer("cap-day");
      await consent(c.id, "offers", true);
      await consent(c.id, "news", true);
      const noon = await effyTime(12);
      await sendOffer(c.sub, { now: noon });
      await sendOffer(c.sub, { entry: NEWS, now: noon });
      expect((await rows(c.sub)).map((r) => r.status)).toEqual(["pending", "capped"]);
    });

    it("a capped or skipped push does not count; muted and no_device do", async () => {
      const c = await customer("cap-count");
      await consent(c.id, "offers", true);
      await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 2, promo_push_per_week = 5`);
      const noon = await effyTime(12);
      await sendOffer(c.sub, { now: noon });
      await pool.query(
        `UPDATE public.notification_delivery d SET status = 'muted' FROM public.notification n WHERE n.id = d.notification_id AND n.recipient_sub = $1`,
        [c.sub],
      );
      await sendOffer(c.sub, { now: noon });
      await sendOffer(c.sub, { now: noon });
      expect((await rows(c.sub)).map((r) => r.status)).toEqual(["muted", "pending", "capped"]);
    });

    it("the weekly limit counts the last seven days, and nothing older", async () => {
      const c = await customer("cap-week");
      await consent(c.id, "offers", true);
      await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 1, promo_push_per_week = 2`);
      const backdate = (days: number) =>
        pool.query(
          `UPDATE public.notification SET created_at = now() - make_interval(days => $2)
            WHERE recipient_sub = $1 AND created_at > now() - interval '1 hour'`,
          [c.sub, days],
        );
      await sendOffer(c.sub, { now: await effyTime(12) });
      await backdate(8); // outside the week: not counted
      await sendOffer(c.sub, { now: await effyTime(12) });
      await backdate(3);
      await sendOffer(c.sub, { now: await effyTime(12) });
      await backdate(2);
      await sendOffer(c.sub, { now: await effyTime(12) });
      expect((await rows(c.sub)).map((r) => r.status)).toEqual(["pending", "pending", "pending", "capped"]);
    });

    it("limits of 0 send promotions to the inbox only", async () => {
      const c = await customer("cap-zero");
      await consent(c.id, "offers", true);
      await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 0, promo_push_per_week = 0`);
      expect(await sendOffer(c.sub, { now: await effyTime(12) })).toBe(1);
      expect((await rows(c.sub)).map((r) => r.status)).toEqual(["capped"]);
    });

    it("two sends at the same moment never both pass a limit of 1", async () => {
      const c = await customer("cap-race");
      await consent(c.id, "offers", true);
      const noon = await effyTime(12);
      await Promise.all([sendOffer(c.sub, { now: noon }), sendOffer(c.sub, { now: noon }), sendOffer(c.sub, { now: noon })]);
      const statuses = (await rows(c.sub)).map((r) => r.status).sort();
      expect(statuses).toEqual(["capped", "capped", "pending"]);
    });

    it("order updates never count toward or are held by the limits", async () => {
      const c = await customer("cap-orders");
      await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 0, promo_push_per_week = 0`);
      await sendOrderPaid(c.sub);
      expect((await rows(c.sub)).map((r) => r.status)).toEqual(["pending", "pending"]);
    });
  });

  describe("changing preferences (FR-005..FR-010)", () => {
    it("reads defaults, then the customer's choices and consent", async () => {
      const c = await customer("read");
      const before = await preferencesFor(pool, c.id);
      expect(before.categories.find((x) => x.category === "orders")).toMatchObject({ push: true, email: true, changeable: ["push", "email"] });
      expect(before.categories.find((x) => x.category === "important")).toMatchObject({ required: true, changeable: [] });
      expect(before.consent).toEqual({ offers: { granted: false, answeredAt: null }, news: { granted: false, answeredAt: null } });
      expect(before.wordingVersion).toBe(CONSENT_WORDING_VERSION);

      await choose(c.id, "points", "email", false);
      await consent(c.id, "news", true);
      const after = await preferencesFor(pool, c.id);
      expect(after.categories.find((x) => x.category === "points")).toMatchObject({ push: true, email: false });
      expect(after.consent.news.granted).toBe(true);
      expect(after.consent.news.answeredAt).not.toBeNull();
    });

    it("every answer is kept with when, where and the wording; the latest is the current one (FR-010, SC-003)", async () => {
      const c = await customer("history");
      await consent(c.id, "offers", true, "prompt");
      await consent(c.id, "offers", false, "inbox");
      const history = (await pool.query(
        `SELECT granted, surface, via, wording_version FROM public.customer_marketing_consent WHERE customer_id = $1 ORDER BY created_at, id`,
        [c.id],
      )).rows;
      expect(history).toEqual([
        { granted: true, surface: "app", via: "prompt", wording_version: CONSENT_WORDING_VERSION },
        { granted: false, surface: "app", via: "inbox", wording_version: CONSENT_WORDING_VERSION },
      ]);
      expect((await preferencesFor(pool, c.id)).consent.offers.granted).toBe(false);
    });

    it("refuses a required category, an unknown one, a channel it lacks and an old wording (FR-009, SC-008)", () => {
      const refused = (body: unknown) => {
        try {
          parsePreferencesChange(body);
        } catch (e) {
          return e instanceof PreferencesRefused ? `${e.status} ${e.code}` : "other";
        }
        return "accepted";
      };
      expect(refused({ surface: "app", changes: [{ category: "important", channel: "push", enabled: false }] })).toBe("400 category_required");
      expect(refused({ surface: "app", changes: [{ category: "support", channel: "email", enabled: false }] })).toBe("400 category_required");
      expect(refused({ surface: "app", changes: [{ category: "work", channel: "push", enabled: false }] })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "app", changes: [{ category: "offers", channel: "email", enabled: true }] })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "app", consent: { offers: true }, via: "prompt" })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "app", consent: { offers: true }, via: "prompt", wordingVersion: "old" })).toBe("409 consent_wording_changed");
      expect(refused({ surface: "app", consent: { points: true }, via: "prompt", wordingVersion: CONSENT_WORDING_VERSION })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "tv", changes: [{ category: "orders", channel: "push", enabled: false }] })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "app" })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "app", extra: 1, changes: [{ category: "orders", channel: "push", enabled: false }] })).toBe("400 invalid_preferences_change");
      expect(refused({ surface: "web", changes: [{ category: "orders", channel: "push", enabled: false }] })).toBe("accepted");
    });

    it("the database refuses a choice for a required category even if code tried", async () => {
      const c = await customer("db-guard");
      await expect(
        pool.query(`INSERT INTO public.customer_notification_choice (customer_id, category, channel, enabled, surface) VALUES ($1, 'important', 'push', false, 'app')`, [c.id]),
      ).rejects.toThrow(/customer_notification_choice_category_check/);
    });
  });

  describe("the offers ask (FR-012, Story 2)", () => {
    async function order(customerId: string, status = "paid") {
      await pool.query(
        `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
         VALUES ($1, 'EFY-' || substr(gen_random_uuid()::text, 1, 8), 10, 12, '{}'::jsonb, $2, 'effy', 'in_coverage')`,
        [customerId, status],
      );
    }

    it("is not asked before any order, and is asked once they have one", async () => {
      const c = await customer("ask");
      expect(await askForOffers(pool, c.id)).toBe(false);
      await order(c.id, "pending_payment");
      expect(await askForOffers(pool, c.id)).toBe(true);
    });

    it("a failed payment is not an order", async () => {
      const c = await customer("ask-failed");
      await order(c.id, "failed");
      expect(await askForOffers(pool, c.id)).toBe(false);
    });

    it("'Not now' records two no's and the ask is not shown again, on any surface", async () => {
      const c = await customer("ask-no");
      await order(c.id);
      await transact((tx) => applyPreferencesChange(tx, c.id, parsePreferencesChange({ surface: "web", via: "prompt", consent: { offers: false, news: false }, wordingVersion: CONSENT_WORDING_VERSION })));
      expect(await askForOffers(pool, c.id)).toBe(false);
      const n = (await pool.query(`SELECT count(*)::int AS n FROM public.customer_marketing_consent WHERE customer_id = $1 AND NOT granted AND via = 'prompt'`, [c.id])).rows[0].n;
      expect(n).toBe(2);
    });

    it("turning Offers on in settings counts as an answer, so the ask is not shown after", async () => {
      const c = await customer("ask-settings");
      await consent(c.id, "offers", true, "settings");
      await order(c.id);
      expect(await askForOffers(pool, c.id)).toBe(false);
    });
  });

  describe("records", () => {
    it("a consent answer cannot be rewritten by the shopper role", async () => {
      const c = await customer("append-only");
      await consent(c.id, "offers", true);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE effy_shopper");
        await expect(client.query(`UPDATE public.customer_marketing_consent SET granted = false WHERE customer_id = $1`, [c.id])).rejects.toThrow(/permission denied/);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
  });
});
