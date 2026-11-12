// Back-office messages (112): writing, testing and sending a message. The routes' rules live here
// (contracts/messages-api.md); the people a message reaches are worked out by the shared audience module, and every
// recipient's notification is written by notify(), so 111's consent, choices, limits and night hold apply unchanged.
// Sending to many happens in the notifications service's `messages` worker; a send here only moves the message on.
import { logger, MediaValidationError, offsetListPage, parseListQuery, pooled, presignUpload, publicImageUrl, withTransaction, type Queryable } from "@effy/edge-shared";
import { sendEmail } from "@effy/email-kit/send";
import { announce } from "@effy/edge-shared/live";
import {
  AudienceInvalid,
  checkMessageWords,
  countAudience,
  emailRecipientOf,
  ensureUnsubscribeTokens,
  isMarketingCategory,
  messageEmailVars,
  messageReport,
  messageTypeFor,
  notify,
  parseAudience,
  personSub,
  reachedAndOpened,
  resolveCustomerEmails,
  withdrawMessageItems,
  type NotificationCategory,
} from "@effy/edge-shared/notifications";
import {
  MESSAGE_KIND_VALUES,
  MESSAGE_LIMITS,
  MESSAGE_MUST_NAME_EFFY,
  NAME_FALLBACK_DEFAULT,
  normaliseFirstName,
  audiencesFor,
  messageFiling,
  messageKind,
  messageNamesEffy,
  parseDestination,
  type AudienceFilter,
  type ListPage,
  type MessageAudienceCountDTO,
  type MessageDestination,
  type MessageDTO,
  type MessageKind,
  type MessagePictureUploadDTO,
  type MessageRowDTO,
  type MessageTestDTO,
  type NotificationAudience,
} from "@effy/shared-types";

import { forbiddenFor, invalid, MessageError, notFound } from "./errors";
import { MESSAGE_LIST_SPEC } from "./list";
import * as repo from "./repository";
import type { MessageRecord, MessageWrite } from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIENCES: readonly NotificationAudience[] = ["customer", "driver", "shop"];

/** Who is asking: their subject, and whether they may manage messages (administrator or manager). */
export interface Actor {
  sub: string;
  manage: boolean;
}

type Body = Record<string, unknown>;

function isObject(v: unknown): v is Body {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function only(body: Body, keys: readonly string[]): void {
  for (const k of Object.keys(body)) if (!keys.includes(k)) throw invalid(`unknown field ${k}`);
}

function words(v: unknown, what: string, max: number): string {
  if (typeof v !== "string") throw invalid(`${what} is required`);
  const t = v.trim();
  if (t.length < 1 || t.length > max) throw invalid(`${what}: 1–${max} characters`);
  return t;
}

function isoOrNull(v: unknown, what: string): Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw invalid(`${what}: an ISO date and time, or null`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw invalid(`${what}: an ISO date and time, or null`);
  return d;
}

const DRAFT_KEYS = ["kind", "title", "body", "pictureKey", "push", "email", "nameFallback", "endsAt", "audiences"] as const;

/**
 * A draft from the wire (create and edit). The closed shape; the kind's audiences (MESSAGE_KINDS); each audience's filter
 * (the shared parser) and destination (109's list for that audience); a direct message is one person.
 */
export function parseDraft(body: unknown, extraKeys: readonly string[] = []): MessageWrite {
  if (!isObject(body)) throw invalid("the body must be an object");
  only(body, [...DRAFT_KEYS, ...extraKeys]);
  const kind = body.kind;
  if (typeof kind !== "string" || !(MESSAGE_KIND_VALUES as readonly string[]).includes(kind)) {
    throw invalid(`kind: one of ${MESSAGE_KIND_VALUES.join(", ")}`);
  }
  const k = kind as MessageKind;
  const title = words(body.title, "title", MESSAGE_LIMITS.title);
  const text = words(body.body, "body", MESSAGE_LIMITS.body);
  const pictureKey = body.pictureKey ?? null;
  if (pictureKey !== null && (typeof pictureKey !== "string" || !/^promotions\/messages-[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(pictureKey))) {
    throw invalid("pictureKey: a picture uploaded for a message, or null");
  }
  if (typeof body.push !== "boolean") throw invalid("push: true or false");
  // 115: email and the first-name fallback; absent = no email, "there".
  const email = body.email ?? false;
  if (typeof email !== "boolean") throw invalid("email: true or false");
  const nameFallback = body.nameFallback ?? NAME_FALLBACK_DEFAULT;
  if (typeof nameFallback !== "string") throw invalid("nameFallback: the word used when someone has no first name");
  if (k === "direct" && !body.push) throw invalid("a direct message always notifies the phone");
  const endsAt = isoOrNull(body.endsAt, "endsAt");
  if (endsAt && endsAt.getTime() <= Date.now()) throw invalid("endsAt: must be in the future");

  if (!Array.isArray(body.audiences) || body.audiences.length === 0 || body.audiences.length > 3) {
    throw invalid("audiences: one to three");
  }
  const allowed = audiencesFor(k);
  const seen = new Set<string>();
  const audiences: MessageWrite["audiences"] = [];
  for (const a of body.audiences as unknown[]) {
    if (!isObject(a)) throw invalid("audiences: each an object");
    only(a, ["audience", "filter", "destination"]);
    const audience = a.audience;
    if (typeof audience !== "string" || !(AUDIENCES as readonly string[]).includes(audience)) throw invalid("audience: customer, driver or shop");
    const aud = audience as NotificationAudience;
    if (!allowed.includes(aud)) throw invalid(`${messageKind(k)!.label} messages can't go to ${aud}s`);
    if (seen.has(aud)) throw invalid(`audience ${aud} twice`);
    seen.add(aud);
    let filter: AudienceFilter;
    try {
      filter = parseAudience(aud, a.filter ?? {});
    } catch (err) {
      if (err instanceof AudienceInvalid) throw new MessageError(400, "invalid_audience", err.message);
      throw err;
    }
    const destination = parseDestination(aud, a.destination === undefined ? null : JSON.stringify(a.destination));
    if (destination === null) throw new MessageError(400, "invalid_destination", `not a place a ${aud} can open`);
    audiences.push({ audience: aud, filter, destination: destination as MessageDestination });
  }
  if (k === "direct") {
    const [only1] = audiences;
    const one =
      audiences.length === 1 &&
      only1 !== undefined &&
      (only1.audience === "shop"
        ? (only1.filter as { shops?: string[] }).shops?.length === 1 && Object.keys(only1.filter).every((x) => x === "shops" || x === "managersOnly")
        : (only1.filter as { people?: string[] }).people?.length === 1 && Object.keys(only1.filter).length === 1);
    if (!one) throw invalid("a direct message is for one person, or one shop's staff");
  }
  // 115: the one check of a message's words (shared with automatic messages and the worker).
  // A draft may not name Effy yet: sending and testing check it (mustNameEffy), as in 112.
  const problem = checkMessageWords(
    { kind: k, title, body: text, nameFallback, email, audiences: audiences.map((a) => a.audience) },
    { draft: true },
  );
  if (problem) {
    throw new MessageError(400, problem.code === "message_must_name_effy" ? "message_must_name_effy" : "invalid_message", problem.message, {
      errors: [{ field: problem.field, message: problem.message }],
    });
  }
  return { kind: k, title, body: text, pictureKey, push: body.push, email, nameFallback: nameFallback.trim(), endsAt, audiences };
}

function mayWrite(actor: Actor, kind: MessageKind): void {
  if (!actor.manage && kind !== "direct") throw forbiddenFor("customer support may send a direct message to one person only");
}

function isMarketing(kind: MessageKind): boolean {
  return messageKind(kind)?.marketing ?? false;
}

function consentCategory(kind: MessageKind): "offers" | "news" | null {
  return kind === "offer" ? "offers" : kind === "news" ? "news" : null;
}

function mustNameEffy(m: { kind: MessageKind; title: string; body: string }): void {
  if (isMarketing(m.kind) && !messageNamesEffy(m.title, m.body)) {
    throw new MessageError(400, "message_must_name_effy", MESSAGE_MUST_NAME_EFFY);
  }
}

async function load(db: Queryable, id: string, lock = false): Promise<MessageRecord> {
  if (!UUID.test(id)) throw notFound();
  const m = await repo.readMessage(db, id, lock);
  if (!m) throw notFound();
  return m;
}

/** A direct message's one person must still be reachable, and a customer's order destination must be their own. */
async function checkDirect(db: Queryable, w: MessageWrite): Promise<void> {
  if (w.kind !== "direct") return;
  const a = w.audiences[0]!;
  if (a.audience === "shop") {
    const shopId = (a.filter as { shops: string[] }).shops[0]!;
    const ok = (await db.query(`SELECT 1 FROM public.shop WHERE id = $1 AND status = 'active'`, [shopId])).rowCount;
    if (!ok) throw new MessageError(409, "recipient_unavailable", "This shop is closed.");
    return;
  }
  const personId = (a.filter as { people: string[] }).people[0]!;
  if (!(await personSub(db, a.audience, personId))) {
    throw new MessageError(409, "recipient_unavailable", a.audience === "customer" ? "This customer's account is closed." : "This driver is not active.");
  }
  if (a.audience === "customer" && a.destination.kind === "order") {
    const own = (await db.query(`SELECT 1 FROM public."order" WHERE id = $1 AND customer_id = $2`, [a.destination.orderId, personId])).rowCount;
    if (!own) throw new MessageError(400, "invalid_destination", "that order is not this customer's");
  }
}

async function toDTO(db: Queryable, m: MessageRecord): Promise<MessageDTO> {
  const reported = !["draft", "scheduled", "cancelled", "not_sent"].includes(m.status);
  const report = reported ? await messageReport(db, m.id) : null;
  return {
    id: m.id,
    kind: m.kind,
    title: m.title,
    body: m.body,
    pictureKey: m.pictureKey,
    pictureUrl: m.pictureKey ? publicImageUrl(m.pictureKey) : null,
    push: m.push,
    email: m.email,
    nameFallback: m.nameFallback,
    automationId: m.automationId,
    endsAt: m.endsAt?.toISOString() ?? null,
    audiences: m.audiences.map((a) => ({
      audience: a.audience,
      filter: a.filter,
      destination: a.destination,
      report: report?.byAudience[a.audience] ?? null,
    })),
    status: m.status,
    notSentReason: m.notSentReason,
    sendAt: m.sendAt?.toISOString() ?? null,
    sentAt: m.sentAt?.toISOString() ?? null,
    withdrawnAt: m.withdrawnAt?.toISOString() ?? null,
    duplicatedFrom: m.duplicatedFrom,
    version: m.version,
    createdBy: m.createdByName ?? "Former staff",
    createdAt: m.createdAt.toISOString(),
    total: report?.total ?? null,
    reportFrozenAt: report?.frozenAt?.toISOString() ?? null,
  };
}

/** Back-office's open screens re-read (the ops kind `messages`); never throws. */
async function told(): Promise<void> {
  await announce([{ scope: "ops", kind: "messages" }]);
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function listMessages(q: Readonly<Record<string, string | undefined>> | null | undefined): Promise<ListPage<MessageRowDTO>> {
  const req = parseListQuery(q, MESSAGE_LIST_SPEC);
  const res = await repo.listMessages(req);
  const counts = await reachedAndOpened(pooled, res.rows.map((m) => m.id));
  const items = res.rows.map((m): MessageRowDTO => {
    const c = counts.get(m.id) ?? { reached: 0, opened: 0 };
    return {
      id: m.id,
      title: m.title,
      kind: m.kind,
      audiences: m.audiences.map((a) => a.audience),
      status: m.status,
      sendAt: m.sendAt?.toISOString() ?? null,
      sentAt: m.sentAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      reached: c.reached,
      openedShare: c.reached > 0 ? c.opened / c.reached : null,
    };
  });
  return offsetListPage(items, req, res);
}

export async function getMessage(id: string): Promise<MessageDTO> {
  return toDTO(pooled, await load(pooled, id));
}

/** How many people a draft reaches now (FR-009), and emails from a file resolved to customers. */
export async function audienceCount(body: unknown): Promise<MessageAudienceCountDTO> {
  if (!isObject(body)) throw invalid("the body must be an object");
  only(body, ["kind", "audiences", "resolve"]);
  const kind = body.kind;
  if (typeof kind !== "string" || !(MESSAGE_KIND_VALUES as readonly string[]).includes(kind)) throw invalid("kind is required");
  const k = kind as MessageKind;
  if (!Array.isArray(body.audiences) || body.audiences.length > 3) throw invalid("audiences: up to three");
  const out: MessageAudienceCountDTO = { audiences: [], total: 0 };
  for (const a of body.audiences as unknown[]) {
    if (!isObject(a) || typeof a.audience !== "string" || !(audiencesFor(k) as string[]).includes(a.audience)) {
      throw invalid("audiences: each one the kind allows");
    }
    const aud = a.audience as NotificationAudience;
    let filter: AudienceFilter;
    try {
      filter = parseAudience(aud, a.filter ?? {});
    } catch (err) {
      if (err instanceof AudienceInvalid) throw new MessageError(400, "invalid_audience", err.message);
      throw err;
    }
    const c = await countAudience(pooled, aud, filter, consentCategory(k));
    out.audiences.push({ audience: aud, matched: c.matched, consented: c.consented });
    out.total += isMarketing(k) ? (c.consented ?? 0) : c.matched;
  }
  if (body.resolve !== undefined) {
    if (!isObject(body.resolve) || !Array.isArray(body.resolve.emails)) throw invalid("resolve: {emails: string[]}");
    try {
      out.resolved = await resolveCustomerEmails(pooled, body.resolve.emails as string[]);
    } catch (err) {
      if (err instanceof AudienceInvalid) throw new MessageError(400, "invalid_audience", err.message);
      throw err;
    }
  }
  return out;
}

// ── Writes ────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function createMessage(body: unknown, actor: Actor): Promise<MessageDTO> {
  const w = parseDraft(body, ["fromMessageId"]);
  mayWrite(actor, w.kind);
  const from = (body as Body).fromMessageId;
  if (from !== undefined && (typeof from !== "string" || !UUID.test(from))) throw invalid("fromMessageId: a message id");
  const id = await withTransaction(async (tx) => {
    if (from && !(await repo.readMessage(tx, from))) throw notFound();
    await checkDirect(tx, w);
    const id = await repo.insertMessage(tx, w, actor.sub, (from as string | undefined) ?? null);
    await repo.appendEvent(tx, id, from ? "duplicated" : "created", actor.sub, from ? { from: from as string } : { kind: w.kind });
    return id;
  });
  await told();
  return getMessage(id);
}

export async function editMessage(id: string, body: unknown, actor: Actor): Promise<MessageDTO> {
  const w = parseDraft(body, ["version"]);
  const version = (body as Body).version;
  if (!actor.manage) throw forbiddenFor("customer support can't edit a message");
  await withTransaction(async (tx) => {
    const m = await load(tx, id, true);
    if (typeof version !== "number" || version !== m.version) throw new MessageError(409, "message_changed", "Someone else changed this message.");
    if (m.status !== "draft" && m.status !== "scheduled") throw new MessageError(409, "message_not_editable", "This message can no longer be changed.");
    if (m.status === "scheduled") mustNameEffy(w);
    await checkDirect(tx, w);
    await repo.updateMessage(tx, id, w);
    await repo.appendEvent(tx, id, "edited", actor.sub, m.status === "scheduled" ? { whileScheduled: true } : {});
  });
  await told();
  return getMessage(id);
}

export async function pictureUpload(id: string, body: unknown, actor: Actor): Promise<MessagePictureUploadDTO> {
  if (!actor.manage) throw forbiddenFor("customer support can't add a picture");
  const m = await load(pooled, id);
  if (m.status !== "draft" && m.status !== "scheduled") throw new MessageError(409, "message_not_editable", "This message can no longer be changed.");
  if (!isObject(body)) throw invalid("the body must be an object");
  try {
    const r = await presignUpload("promotions", `messages-${m.id}`, body.contentType, body.fileSize);
    return { uploadUrl: r.uploadUrl, key: r.storageKey };
  } catch (err) {
    if (err instanceof MediaValidationError) throw invalid(err.message);
    throw err;
  }
}

/** How many people one send of this message reaches now: those who said yes for offers and news, else everyone matched. */
async function sendCount(db: Queryable, m: MessageRecord): Promise<number> {
  let total = 0;
  for (const a of m.audiences) {
    const c = await countAudience(db, a.audience, a.filter, consentCategory(m.kind));
    total += isMarketing(m.kind) ? (c.consented ?? 0) : c.matched;
  }
  return total;
}

/** A real notification to one account the sender picks, with every rule applied; not counted in the report (R14). */
export async function testSend(id: string, body: unknown, actor: Actor): Promise<MessageTestDTO> {
  if (!isObject(body)) throw invalid("the body must be an object");
  only(body, ["audience", "personId"]);
  const m = await load(pooled, id);
  mayWrite(actor, m.kind);
  mustNameEffy(m);
  const audience = body.audience as NotificationAudience;
  const target = m.audiences.find((a) => a.audience === audience);
  if (!target) throw invalid("send the test to an account in one of this message's audiences");
  if (typeof body.personId !== "string") throw invalid("personId is required");
  const sub = await personSub(pooled, audience, body.personId);
  if (!sub) throw new MessageError(409, "recipient_unavailable", "That account can't receive messages.");
  const filing = messageFiling(m.kind, audience)!;
  const scope = `test:${m.id}:${crypto.randomUUID()}`;
  const type = messageTypeFor(audience);
  const written = await withTransaction(async (tx) => {
    await notify(tx, {
      type,
      recipients: [{ sub }],
      subject: { entityId: m.id },
      dedupeScope: scope,
      channels: m.push ? ["push"] : [],
      expiresAt: m.endsAt,
      pinnedUntil: filing.importance === "important" ? (m.endsAt ?? new Date(Date.now() + MESSAGE_LIMITS.importantPinDays * 86_400_000)) : null,
      message: {
        messageId: null,
        source: m.kind === "direct" ? "direct" : "campaign",
        category: filing.category as NotificationCategory,
        importance: filing.importance,
        title: `Test: ${m.title}`,
        body: m.body,
        destination: target.destination,
        imageUrl: m.pictureKey ? publicImageUrl(m.pictureKey) : null,
        nameFallback: m.nameFallback,
      },
    });
    const row = (await tx.query<{ status: string | null; not_before: Date | null }>(
      `SELECT d.status, d.not_before FROM public.notification n
         LEFT JOIN public.notification_delivery d ON d.notification_id = n.id AND d.channel = 'push'
        WHERE n.dedupe_key = $1`,
      [`${type}:${sub}:${scope}`],
    )).rows[0];
    await repo.appendEvent(tx, m.id, "test_sent", actor.sub, { to: audience, written: row !== undefined });
    return row;
  });
  // 115: the test email, sent here - not through notify(), whose switches would hide it - and recorded nowhere.
  if (m.email && audience === "customer") await sendTestEmail(m, sub, target.destination as Record<string, unknown>, filing.category);
  if (!written) return { inbox: "not_written", reason: "no_consent", push: "none" };
  const push: MessageTestDTO["push"] =
    written.status === null ? "none"
      : written.status === "skipped" ? "skipped"
        : written.status === "capped" ? "capped"
          : written.not_before && written.not_before.getTime() > Date.now() ? "held"
            : "queued";
  return { inbox: "written", reason: null, push };
}

/**
 * 115 (I5): the email of a test send, to the test account's own address, with 112's "Test: " prefix. Built by the same
 * code as every recipient's (`messageEmailVars`); a marketing test gets the account's unsubscribe token so the link works.
 * Never fails the test send: a mail problem is logged.
 */
async function sendTestEmail(m: MessageRecord, sub: string, destination: Record<string, unknown>, category: string): Promise<void> {
  try {
    const to = (await pooled.query<{ email: string | null }>(`SELECT email::text AS email FROM public.customer WHERE cognito_sub = $1`, [sub])).rows[0]?.email;
    if (!to) return;
    if (isMarketingCategory(category)) await withTransaction((tx) => ensureUnsubscribeTokens(tx, [sub]));
    const built = messageEmailVars(
      {
        to, recipientSub: sub, messageId: "", category, title: m.title,
        body: normaliseFirstName(m.body, m.nameFallback), destination,
        imageUrl: m.pictureKey ? publicImageUrl(m.pictureKey) : null,
      },
      await emailRecipientOf(pooled, sub),
      { site: (process.env.WEB_SITE_URL ?? "").replace(/\/$/, ""), edge: (process.env.EDGE_API_URL ?? "").replace(/\/$/, "") },
    );
    if (!built) return;
    await sendEmail("message", built.vars, { to, audience: "customer", headers: built.headers, subjectPrefix: "Test: " });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.name : "unknown" }, "messages: the test email was not sent");
  }
}

/** Send now, or at a time (R7, R12): the count confirmed, the largest message respected, the kind's rules met. */
export async function sendMessage(id: string, body: unknown, actor: Actor, now = new Date()): Promise<MessageDTO> {
  if (!isObject(body)) throw invalid("the body must be an object");
  only(body, ["version", "sendAt", "confirmCount", "typedCount"]);
  const sendAt = isoOrNull(body.sendAt, "sendAt");
  const later = sendAt !== null && sendAt.getTime() > now.getTime() + 30_000;
  if (typeof body.confirmCount !== "number" || !Number.isInteger(body.confirmCount) || body.confirmCount < 0) {
    throw invalid("confirmCount: the number of people you were shown");
  }
  const confirmCount = body.confirmCount;
  await withTransaction(async (tx) => {
    const m = await load(tx, id, true);
    mayWrite(actor, m.kind);
    if (!actor.manage && later) throw forbiddenFor("customer support sends a direct message now");
    if (body.version !== m.version) throw new MessageError(409, "message_changed", "Someone else changed this message.");
    if (m.status !== "draft" && m.status !== "scheduled") throw new MessageError(409, "message_not_editable", "This message has already gone.");
    if (m.endsAt && m.endsAt.getTime() <= (later ? sendAt!.getTime() : now.getTime())) throw invalid("it would end before it is sent");
    mustNameEffy(m);
    await checkDirect(tx, m);
    const count = await sendCount(tx, m);
    if (count === 0) throw new MessageError(409, "audience_empty", "Nobody matches this audience.", { count });
    const limit = await repo.maxRecipients(tx);
    if (count > limit) throw new MessageError(409, "too_many_recipients", `This message would reach ${count} people; the most is ${limit}.`, { count, limit });
    if (Math.abs(count - confirmCount) > Math.floor(count * 0.05)) {
      throw new MessageError(409, "audience_changed", "The number of people has changed. Check it and send again.", { count });
    }
    const whole = m.audiences.some((a) => a.audience === "customer" && Object.keys(a.filter).length === 0);
    if (whole && body.typedCount !== count) {
      throw new MessageError(409, "confirmation_required", "Type the number of customers to send to all of them.", { count });
    }
    if (later) {
      await repo.changeStatus(tx, m.id, { status: "scheduled", sendAt: sendAt! });
      await repo.appendEvent(tx, m.id, "scheduled", actor.sub, { count, at: sendAt!.toISOString() });
    } else {
      await repo.changeStatus(tx, m.id, { status: "sending", sendAt: now });
      await repo.appendEvent(tx, m.id, "sending", actor.sub, { count });
    }
  });
  await told();
  return getMessage(id);
}

async function act(id: string, body: unknown, actor: Actor, from: readonly string[], step: (tx: Queryable, m: MessageRecord) => Promise<void>): Promise<MessageDTO> {
  if (!actor.manage) throw forbiddenFor("customer support can't do this");
  const version = isObject(body) ? body.version : undefined;
  await withTransaction(async (tx) => {
    const m = await load(tx, id, true);
    if (version !== undefined && version !== m.version) throw new MessageError(409, "message_changed", "Someone else changed this message.");
    if (!from.includes(m.status)) throw new MessageError(409, "message_not_editable", "This message can't do that now.");
    await step(tx, m);
  });
  await told();
  return getMessage(id);
}

export const cancelMessage = (id: string, body: unknown, actor: Actor) =>
  act(id, body, actor, ["scheduled"], async (tx, m) => {
    await repo.changeStatus(tx, m.id, { status: "cancelled" });
    await repo.appendEvent(tx, m.id, "cancelled", actor.sub);
  });

export const stopMessage = (id: string, body: unknown, actor: Actor) =>
  act(id, body, actor, ["sending"], async (tx, m) => {
    await repo.changeStatus(tx, m.id, { status: "stopped" });
    await repo.appendEvent(tx, m.id, "stopped", actor.sub);
  });

/** Ends everyone's item now (R8); a message still sending stops too. Pushes already shown can't be taken back. */
export const withdrawMessage = (id: string, body: unknown, actor: Actor) =>
  act(id, body, actor, ["sending", "sent", "stopped"], async (tx, m) => {
    const ended = await withdrawMessageItems(tx, m.id);
    await repo.changeStatus(tx, m.id, { status: "withdrawn" });
    await repo.appendEvent(tx, m.id, "withdrawn", actor.sub, { ended });
  });

