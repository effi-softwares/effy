import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { MESSAGE_KINDS } from "@effy/shared-types";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../../lib/db";
import { migrationSql } from "../../testing/migrations";
import { messageTypeFor } from "../catalogue";
import { notify, type NotifyMessage } from "../notify";
import { applyPreferencesChange, CONSENT_WORDING_VERSION, EMAIL_WORDING_VERSION } from "../preferences";
import { messageReport } from "./report";
import { ensureUnsubscribeTokens } from "./unsubscribe";
import { makeUnsubscribeHandlers } from "./unsubscribe-handlers";

/**
 * 115 US2 - the unsubscribe link, against the real schema (T022): by token, idempotent, the one-click form, a wrong token
 * changes nothing and answers the same, undo inside 7 days and not after, the report counts it, the next offer sends no
 * email.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let handlers: ReturnType<typeof makeUnsubscribeHandlers>;
let seq = 0;

const context = { awsRequestId: "t", callbackWaitsForEmptyEventLoop: true } as unknown as Context;
const event = (e: { body?: unknown; query?: Record<string, string> }): APIGatewayProxyEventV2 =>
  ({
    requestContext: { requestId: `r-${++seq}` },
    body: e.body === undefined ? (e.query ? "List-Unsubscribe=One-Click" : undefined) : JSON.stringify(e.body),
    queryStringParameters: e.query,
    isBase64Encoded: false,
  }) as unknown as APIGatewayProxyEventV2;
const call = async (h: "unsubscribe" | "undo", e: Parameters<typeof event>[0]) => {
  const res = await handlers[h](event(e), context);
  return { status: res.statusCode, body: JSON.parse(String(res.body)) };
};

/** A customer who said yes to offers and news and turned email on for both; returns their token. */
async function subscribed(): Promise<{ id: string; sub: string; email: string; token: string }> {
  const sub = `un-${++seq}`;
  const email = `${sub}@example.test`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2::citext) RETURNING id::text AS id`, [sub, email],
  )).rows[0]!.id;
  await transact(async (tx) => {
    await applyPreferencesChange(tx, id, { surface: "web", via: "settings", consent: { offers: true, news: true }, wordingVersion: CONSENT_WORDING_VERSION });
    await applyPreferencesChange(tx, id, {
      surface: "web", emailWordingVersion: EMAIL_WORDING_VERSION,
      changes: [{ category: "offers", channel: "email", enabled: true }, { category: "news", channel: "email", enabled: true }],
    });
  });
  const token = (await transact((tx) => ensureUnsubscribeTokens(tx, [sub]))).get(sub)!;
  return { id, sub, email, token };
}

const emailOn = async (customerId: string) =>
  (await pool.query<{ category: string; enabled: boolean }>(
    `SELECT category, enabled FROM public.customer_notification_choice WHERE customer_id = $1 AND channel = 'email' ORDER BY category`,
    [customerId],
  )).rows;
const consentRows = async (customerId: string) =>
  Number((await pool.query(`SELECT count(*) AS n FROM public.customer_marketing_consent WHERE customer_id = $1`, [customerId])).rows[0].n);

async function sendOffer(people: { sub: string; email: string }[]): Promise<string> {
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.message (kind, title, body, email, created_by) VALUES ('offer', 'From Effy', 'An offer from Effy', true, 'staff-1') RETURNING id::text AS id`,
  )).rows[0]!.id;
  await pool.query(`INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, 'customer', '{}'::jsonb, '{"kind":"home"}'::jsonb)`, [id]);
  const filing = MESSAGE_KINDS.find((k) => k.kind === "offer")!.filing.customer!;
  const message: NotifyMessage = {
    messageId: id, source: "campaign", category: filing.category as NotifyMessage["category"], importance: filing.importance,
    title: "From Effy", body: "An offer from Effy", destination: { kind: "home" }, imageUrl: null,
  };
  await transact((tx) => notify(tx, {
    type: messageTypeFor("customer"), recipients: people, subject: { entityId: id }, dedupeScope: id, channels: ["push", "email"], message,
  }, { now: new Date("2026-11-12T03:00:00Z") }));
  return id;
}

const emailStatus = async (sub: string, messageId: string) =>
  (await pool.query<{ status: string }>(
    `SELECT d.status FROM public.notification n JOIN public.notification_delivery d ON d.notification_id = n.id AND d.channel = 'email'
      WHERE n.recipient_sub = $1 AND n.message_id = $2`, [sub, messageId],
  )).rows[0]?.status ?? null;

d("115 - the unsubscribe link", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    handlers = makeUnsubscribeHandlers({ db: pool, transact });
    await pool.query(`UPDATE public.notification_settings SET promo_push_per_day = 20, promo_push_per_week = 100`);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("by token: email off for offers and news, a no on the record naming the message; a second call writes nothing", async () => {
    const c = await subscribed();
    const messageId = await sendOffer([c]);
    const first = await call("unsubscribe", { body: { token: c.token, messageId } });
    expect(first).toEqual({ status: 200, body: { ok: true, undoable: true } });
    expect(await emailOn(c.id)).toEqual([{ category: "news", enabled: false }, { category: "offers", enabled: false }]);
    const nos = (await pool.query(
      `SELECT category, surface, via, message_id::text AS message_id FROM public.customer_marketing_consent
        WHERE customer_id = $1 AND channel = 'email' AND NOT granted ORDER BY category`, [c.id],
    )).rows;
    expect(nos).toEqual([
      { category: "news", surface: "email", via: "email_link", message_id: messageId },
      { category: "offers", surface: "email", via: "email_link", message_id: messageId },
    ]);
    const before = await consentRows(c.id);
    expect((await call("unsubscribe", { body: { token: c.token, messageId } })).body.ok).toBe(true);
    expect(await consentRows(c.id)).toBe(before);
  });

  it("the one-click form (?t=&m=) works the same, recorded as the mail program's button", async () => {
    const c = await subscribed();
    const res = await call("unsubscribe", { query: { t: c.token, m: "00000000-0000-4000-8000-000000000000" } });
    expect(res.body.ok).toBe(true);
    expect(await emailOn(c.id)).toEqual([{ category: "news", enabled: false }, { category: "offers", enabled: false }]);
    const via = (await pool.query(
      `SELECT DISTINCT via, message_id FROM public.customer_marketing_consent WHERE customer_id = $1 AND channel = 'email' AND NOT granted`, [c.id],
    )).rows;
    // A message that is not there is recorded as no message, never a refusal.
    expect(via).toEqual([{ via: "one_click", message_id: null }]);
  });

  it("a wrong or malformed token changes nothing and answers the same shape", async () => {
    const c = await subscribed();
    const before = await consentRows(c.id);
    for (const token of ["A".repeat(43), "short", 42, undefined]) {
      expect(await call("unsubscribe", { body: { token } })).toEqual({ status: 200, body: { ok: false, undoable: false } });
    }
    expect((await call("unsubscribe", { body: "not an object" })).body).toEqual({ ok: false, undoable: false });
    expect(await consentRows(c.id)).toBe(before);
    expect(await emailOn(c.id)).toEqual([{ category: "news", enabled: true }, { category: "offers", enabled: true }]);
  });

  it("undo within 7 days restores both switches with a yes; after 7 days it is refused", async () => {
    const c = await subscribed();
    await call("unsubscribe", { body: { token: c.token } });
    expect(await call("undo", { body: { token: c.token } })).toEqual({ status: 200, body: { ok: true } });
    expect(await emailOn(c.id)).toEqual([{ category: "news", enabled: true }, { category: "offers", enabled: true }]);
    expect((await call("undo", { body: { token: c.token } })).body.ok, "nothing left to undo").toBe(false);

    const late = await subscribed();
    await call("unsubscribe", { body: { token: late.token } });
    await pool.query(
      `UPDATE public.customer_marketing_consent SET created_at = now() - interval '8 days' WHERE customer_id = $1 AND NOT granted`, [late.id],
    );
    expect((await call("undo", { body: { token: late.token } })).body.ok).toBe(false);
    expect(await emailOn(late.id)).toEqual([{ category: "news", enabled: false }, { category: "offers", enabled: false }]);
    expect((await call("undo", { body: { token: "A".repeat(43) } })).body).toEqual({ ok: false });
  });

  it("the message's report counts the unsubscribe, and the next offer sends that customer no email", async () => {
    const c = await subscribed();
    const stays = await subscribed();
    const first = await sendOffer([c, stays]);
    await call("unsubscribe", { body: { token: c.token, messageId: first } });
    expect((await messageReport(pool, first)).total.email!.unsubscribed).toBe(1);
    const next = await sendOffer([c, stays]);
    expect(await emailStatus(c.sub, next)).toBe("skipped");
    expect(await emailStatus(stays.sub, next)).toBe("pending");
  });
});
