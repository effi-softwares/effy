import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { MESSAGE_KINDS, type MessageKind } from "@effy/shared-types";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../../lib/db";
import { migrationSql } from "../../testing/migrations";
import { messageTypeFor } from "../catalogue";
import { listInbox } from "../inbox";
import { notify, type NotifyMessage } from "../notify";
import {
  applyPreferencesChange,
  CONSENT_WORDING_VERSION,
  EMAIL_WORDING_VERSION,
  PreferencesRefused,
  readPreferences,
} from "../preferences";
import { messageReport } from "./report";

/**
 * 115 US1 - a message by email, against the real schema: who gets one (the matrix, SC-003), the night hold and the limits
 * on email (FR-011, G1), the first name stored as a placeholder only (R8), and the report adding up (SC-007).
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

const DAY = new Date("2026-11-12T03:00:00Z"); // 14:00 Melbourne
const NIGHT = new Date("2026-11-12T11:00:00Z"); // 22:00 Melbourne

async function customer(opts: { email?: boolean; givenName?: string | null } = {}): Promise<{ id: string; sub: string; email: string | null }> {
  const sub = `em-${++seq}`;
  const email = opts.email === false ? null : `${sub}@example.test`;
  // Since 113 only an erased account has no address (customer_erased_ck) - which is exactly "no address" here.
  const id = (await pool.query<{ id: string }>(
    email === null
      ? `INSERT INTO public.customer (cognito_sub, email, closure_state, erased_at) VALUES ($1, NULL, 'erased', now()) RETURNING id::text AS id`
      : `INSERT INTO public.customer (cognito_sub, email, given_name) VALUES ($1, $2::citext, $3) RETURNING id::text AS id`,
    email === null ? [sub] : [sub, email, opts.givenName ?? null],
  )).rows[0]!.id;
  return { id, sub, email };
}

async function sayYes(customerId: string, category: "offers" | "news"): Promise<void> {
  await transact((tx) =>
    applyPreferencesChange(tx, customerId, { surface: "web", via: "settings", consent: { [category]: true }, wordingVersion: CONSENT_WORDING_VERSION }),
  );
}

async function emailSwitch(customerId: string, category: "offers" | "news", on: boolean): Promise<void> {
  await transact((tx) =>
    applyPreferencesChange(tx, customerId, {
      surface: "web", changes: [{ category, channel: "email", enabled: on }], emailWordingVersion: EMAIL_WORDING_VERSION,
    }),
  );
}

async function messageRow(kind: MessageKind, email = true): Promise<string> {
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.message (kind, title, body, email, created_by) VALUES ($1, 'From Effy', 'Hi {first name}, from Effy', $2, 'staff-1')
     RETURNING id::text AS id`,
    [kind, email],
  )).rows[0]!.id;
  await pool.query(
    `INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, 'customer', '{}'::jsonb, '{"kind":"home"}'::jsonb)`,
    [id],
  );
  return id;
}

function message(kind: MessageKind, messageId: string): NotifyMessage {
  const filing = MESSAGE_KINDS.find((k) => k.kind === kind)!.filing.customer!;
  return {
    messageId, source: "campaign", category: filing.category as NotifyMessage["category"], importance: filing.importance,
    title: "From Effy", body: "Hi {first name}, from Effy", destination: { kind: "home" }, imageUrl: null, nameFallback: "friend",
  };
}

async function send(kind: MessageKind, people: { sub: string; email: string | null }[], now = DAY, id?: string): Promise<string> {
  const messageId = id ?? (await messageRow(kind));
  await transact((tx) =>
    notify(tx, {
      type: messageTypeFor("customer"), recipients: people.map((p) => ({ sub: p.sub, email: p.email })), subject: { entityId: messageId },
      dedupeScope: messageId, channels: ["push", "email"], message: message(kind, messageId),
    }, { now }),
  );
  return messageId;
}

const emailOf = async (sub: string, messageId: string) =>
  (await pool.query<{ status: string; not_before: Date | null }>(
    `SELECT d.status, d.not_before FROM public.notification n
       JOIN public.notification_delivery d ON d.notification_id = n.id AND d.channel = 'email'
      WHERE n.recipient_sub = $1 AND n.message_id = $2`,
    [sub, messageId],
  )).rows[0] ?? null;

const written = async (sub: string, messageId: string) =>
  ((await pool.query(`SELECT 1 FROM public.notification WHERE recipient_sub = $1 AND message_id = $2`, [sub, messageId])).rowCount ?? 0) > 0;

d("115 - a message by email", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  beforeEach(async () => {
    // Fresh limits each test: a high cap unless a test sets it.
    await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 20, promo_push_per_week = 100`);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("SC-003: an offer email goes only with a yes to offers AND the email switch on", async () => {
    for (const yes of [true, false]) {
      for (const on of [true, false]) {
        const c = await customer();
        if (yes) await sayYes(c.id, "offers");
        if (yes && on) await emailSwitch(c.id, "offers", true);
        const id = await send("offer", [c]);
        if (!yes) {
          expect(await written(c.sub, id), "no yes: nothing at all").toBe(false);
          continue;
        }
        expect((await emailOf(c.sub, id))?.status, `yes=${yes} on=${on}`).toBe(on ? "pending" : "skipped");
      }
    }
  });

  it("the email switch cannot be turned on without a yes, and needs the current email wording", async () => {
    const c = await customer();
    await expect(emailSwitch(c.id, "offers", true)).rejects.toBeInstanceOf(PreferencesRefused);
    await sayYes(c.id, "offers");
    await emailSwitch(c.id, "offers", true);
    const prefs = await readPreferences(pool, c.id);
    expect(prefs.categories.find((p) => p.category === "offers")).toMatchObject({ email: true, changeable: ["push", "email"] });
    expect(prefs.emailWordingVersion).toBe(EMAIL_WORDING_VERSION);
    // The email answer is in the record, and does not change who gets offers (111's view reads notification answers only).
    const answers = (await pool.query(`SELECT channel, granted FROM public.customer_marketing_consent WHERE customer_id = $1 ORDER BY created_at`, [c.id])).rows;
    expect(answers).toEqual([{ channel: "notifications", granted: true }, { channel: "email", granted: true }]);
    await emailSwitch(c.id, "offers", false);
    expect((await pool.query(`SELECT granted FROM public.marketing_consent_current WHERE customer_id = $1 AND category = 'offers'`, [c.id])).rows[0]).toEqual({ granted: true });
  });

  it("an important email goes to everyone with an address, whatever their marketing choices", async () => {
    const withAddress = await customer();
    const without = await customer({ email: false });
    const id = await send("important", [withAddress, without]);
    expect((await emailOf(withAddress.sub, id))?.status).toBe("pending");
    expect(await emailOf(without.sub, id)).toBeNull();
    expect(await written(without.sub, id)).toBe(true);
  });

  it("G1: a marketing email at night is held to 08:00, like the push", async () => {
    const c = await customer();
    await sayYes(c.id, "news");
    await emailSwitch(c.id, "news", true);
    const id = await send("news", [c], NIGHT);
    const e = await emailOf(c.sub, id);
    expect(e?.status).toBe("pending");
    expect(e?.not_before?.toISOString()).toBe("2026-11-12T21:00:00.000Z"); // 08:00 Melbourne next morning
  });

  it("G1: the daily limit counts messages, not pushes - over it, push and email are both capped and the inbox item stays", async () => {
    await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 1, promo_push_per_week = 3`);
    const c = await customer();
    await sayYes(c.id, "offers");
    await emailSwitch(c.id, "offers", true);
    // Push off: before 115 the limit counted pushes, so an email-only customer was never limited.
    await transact((tx) => applyPreferencesChange(tx, c.id, { surface: "web", changes: [{ category: "offers", channel: "push", enabled: false }] }));
    const first = await send("offer", [c]);
    expect((await emailOf(c.sub, first))?.status).toBe("pending");
    await pool.query(`UPDATE public.notification_delivery SET status = 'sent' WHERE recipient_email IS NOT NULL`);
    const second = await send("offer", [c]);
    expect(await written(c.sub, second)).toBe(true);
    expect((await emailOf(c.sub, second))?.status).toBe("capped");
  });

  it("R8: the body is stored as a placeholder - no name in any row - and filled when read", async () => {
    const sam = await customer({ givenName: "Sam" });
    const nameless = await customer({ givenName: null });
    const id = await send("important", [sam, nameless]);
    const stored = (await pool.query<{ body: string }>(`SELECT body FROM public.notification WHERE message_id = $1`, [id])).rows.map((r) => r.body);
    expect(new Set(stored)).toEqual(new Set(["Hi {first name|friend}, from Effy"]));
    const firstItem = async (sub: string) => {
      const page = await listInbox(sub, "customer", {}, pool);
      return [...page.pinned, ...page.items][0]!.body;
    };
    expect(await firstItem(sam.sub)).toBe("Hi Sam, from Effy");
    expect(await firstItem(nameless.sub)).toBe("Hi friend, from Effy");
  });

  it("SC-007: the email part of the report adds up to the people reached", async () => {
    const on = await customer();
    const off = await customer();
    const none = await customer({ email: false });
    for (const c of [on, off, none]) await sayYes(c.id, "offers");
    await emailSwitch(on.id, "offers", true);
    const id = await send("offer", [on, off, none]);
    const r = (await messageReport(pool, id)).total;
    const e = r.email!;
    expect(e.waiting).toBe(1);
    expect(e.notSent.turnedOff).toBe(1);
    expect(e.notSent.noAddress).toBe(1);
    const parts = e.sent + e.failed + e.heldForNight + e.waiting + e.overLimit + e.notSent.noAddress + e.notSent.turnedOff + e.notSent.suppressed + e.notSent.ended;
    expect(parts).toBe(r.reached);
  });
});
