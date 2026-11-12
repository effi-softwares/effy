// Automatic messages (115 US3/US4; contracts/routes.md): a message's words and audience plus WHEN it sends - on a
// trigger or on a repeat. Each run becomes an ordinary message created by the sending worker (runner:
// notifications/src/messages/automations.ts), so its sending, report and safeguards are 112's. The words are checked
// by the same rules as a message (`parseDraft` → `checkMessageWords`).
import { offsetListPage, parseListQuery, pooled, withTransaction, type Queryable } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import {
  MESSAGE_MUST_NAME_EFFY,
  OPERATING_TZ,
  TRIGGER_KINDS,
  TRIGGERS,
  automationWhenWords,
  messageKind,
  messageNamesEffy,
  nextDailyTriggerAt,
  nextHourlyTriggerAt,
  nextRunAt,
  trigger as triggerOf,
  type AutomationDTO,
  type AutomationDraft,
  type AutomationRowDTO,
  type ListPage,

  type RepeatEvery,
  type RepeatSchedule,
  type TriggerKind,
} from "@effy/shared-types";

import { forbiddenFor, isMessageError, MessageError } from "../errors";
import { parseDraft, type Actor } from "../service";
import { AUTOMATION_LIST_SPEC } from "./list";
import * as repo from "./repository";
import type { AutomationRecord, AutomationWrite } from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const KEYS = [
  "name", "kind", "audience", "filter", "destination", "title", "body", "pictureKey", "push", "email", "nameFallback", "mode",
  "trigger", "repeat",
] as const;

type Body = Record<string, unknown>;
const isObject = (v: unknown): v is Body => typeof v === "object" && v !== null && !Array.isArray(v);

/** A refusal naming the field (400 invalid_automation). */
export const invalidAutomation = (field: string, message: string) =>
  new MessageError(400, "invalid_automation", message, { errors: [{ field, message }] });
const notFound = () => new MessageError(404, "automation_not_found", "automatic message not found");

function validDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** An automatic message from the wire (create and edit): the message rules, then when it sends. */
export function parseAutomation(body: unknown, extraKeys: readonly string[] = []): AutomationWrite {
  if (!isObject(body)) throw invalidAutomation("body", "the body must be an object");
  for (const k of Object.keys(body)) if (![...KEYS, ...extraKeys].includes(k)) throw invalidAutomation(k, `unknown field ${k}`);
  if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.trim().length > 80) {
    throw invalidAutomation("name", "name: 1–80 characters");
  }
  if (body.kind === "direct") throw invalidAutomation("kind", "a direct message is written by hand, never automatic");
  // The message's own rules: kind, audiences the kind allows, the filter, the destination, the words, email, fallback.
  let m;
  try {
    m = parseDraft({
      kind: body.kind, title: body.title, body: body.body, pictureKey: body.pictureKey ?? null, push: body.push,
      email: body.email ?? false, nameFallback: body.nameFallback, endsAt: null,
      audiences: [{ audience: body.audience, filter: body.filter ?? {}, destination: body.destination }],
    });
  } catch (err) {
    if (isMessageError(err) && err.code !== "message_must_name_effy") {
      const field = (err.extra.errors as { field?: string }[] | undefined)?.[0]?.field ?? err.code.replace(/^invalid_/, "");
      throw invalidAutomation(field, err.message);
    }
    throw err;
  }
  // An automatic offer or news sends with nobody checking it first: it must say it's from Effy now (Spam Act).
  if (messageKind(m.kind)?.marketing && !messageNamesEffy(m.title, m.body)) {
    throw new MessageError(400, "message_must_name_effy", MESSAGE_MUST_NAME_EFFY);
  }
  const a = m.audiences[0]!;
  const base = {
    name: body.name.trim(), kind: m.kind, audience: a.audience, filter: a.filter, destination: a.destination, title: m.title,
    body: m.body, pictureKey: m.pictureKey, push: m.push, email: m.email, nameFallback: m.nameFallback,
  };
  const none = { triggerKind: null, triggerValue: null, repeatEvery: null, repeatDays: null, repeatDate: null, repeatTime: null, startsOn: null, endsOn: null };

  if (body.mode === "trigger") {
    if (body.repeat !== undefined && body.repeat !== null) throw invalidAutomation("repeat", "a triggered message has no repeat");
    if (a.audience !== "customer" || !TRIGGER_KINDS.includes(m.kind)) {
      throw invalidAutomation("trigger", "Only offers and news to customers can be sent when something happens.");
    }
    const t = body.trigger;
    if (!isObject(t) || !TRIGGERS.some((x) => x.kind === t.kind)) throw invalidAutomation("trigger", "trigger: what has to happen");
    const decl = triggerOf(t.kind as TriggerKind);
    if (typeof t.value !== "number" || !Number.isInteger(t.value) || t.value < decl.min || t.value > decl.max) {
      throw invalidAutomation("trigger.value", `${decl.label}: ${decl.min}–${decl.max} ${decl.unit}`);
    }
    return { ...base, ...none, mode: "trigger", triggerKind: decl.kind, triggerValue: t.value };
  }
  if (body.mode === "repeat") {
    if (body.trigger !== undefined && body.trigger !== null) throw invalidAutomation("trigger", "a repeating message has no trigger");
    const r = body.repeat;
    if (!isObject(r)) throw invalidAutomation("repeat", "repeat: how often and when");
    if (r.every !== "day" && r.every !== "week" && r.every !== "month") throw invalidAutomation("repeat.every", "every day, week or month");
    let days: number[] | null = null;
    if (r.every === "week") {
      const ok = Array.isArray(r.days) && r.days.length >= 1 && r.days.length <= 7 && r.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);
      if (!ok) throw invalidAutomation("repeat.days", "Choose at least one day of the week.");
      days = [...new Set(r.days as number[])].sort((x, y) => x - y);
    }
    let date: number | null = null;
    if (r.every === "month") {
      if (typeof r.date !== "number" || !Number.isInteger(r.date) || r.date < 1 || r.date > 28) {
        throw invalidAutomation("repeat.date", "A date from the 1st to the 28th (every month has one).");
      }
      date = r.date;
    }
    if (typeof r.time !== "string" || !TIME.test(r.time)) throw invalidAutomation("repeat.time", "A time, like 09:00.");
    if (!validDay(r.startsOn)) throw invalidAutomation("repeat.startsOn", "A start date.");
    const endsOn = r.endsOn ?? null;
    if (endsOn !== null && (!validDay(endsOn) || endsOn < r.startsOn)) throw invalidAutomation("repeat.endsOn", "The end date can't be before the start.");
    return {
      ...base, ...none, mode: "repeat", repeatEvery: r.every as RepeatEvery, repeatDays: days, repeatDate: date, repeatTime: r.time,
      startsOn: r.startsOn, endsOn: endsOn as string | null,
    };
  }
  throw invalidAutomation("mode", "When something happens, or on a repeat.");
}

export function scheduleOf(w: Pick<AutomationWrite, "repeatEvery" | "repeatDays" | "repeatDate" | "repeatTime" | "startsOn" | "endsOn">): RepeatSchedule | null {
  if (!w.repeatEvery || !w.repeatTime || !w.startsOn) return null;
  return { every: w.repeatEvery, days: w.repeatDays, date: w.repeatDate, time: w.repeatTime, startsOn: w.startsOn, endsOn: w.endsOn };
}

/** When it next runs from `now`: a trigger's next look (07:00 daily, or the next hour), or the repeat's next due time. */
export function nextRunFor(w: AutomationWrite, now: Date): Date | null {
  if (w.mode === "trigger") return triggerOf(w.triggerKind!).cadence === "daily" ? nextDailyTriggerAt(now, OPERATING_TZ) : nextHourlyTriggerAt(now);
  return nextRunAt(scheduleOf(w)!, now, OPERATING_TZ);
}

function draftOf(a: AutomationWrite): AutomationDraft {
  return {
    name: a.name, kind: a.kind, audience: a.audience, filter: a.filter, destination: a.destination, title: a.title, body: a.body,
    pictureKey: a.pictureKey, push: a.push, email: a.email, nameFallback: a.nameFallback, mode: a.mode,
    trigger: a.mode === "trigger" ? { kind: a.triggerKind!, value: a.triggerValue! } : null,
    repeat: a.mode === "repeat" ? scheduleOf(a) : null,
  };
}

async function load(db: Queryable, id: string, lock = false): Promise<AutomationRecord> {
  if (!UUID.test(id)) throw notFound();
  const a = await repo.readAutomation(db, id, lock);
  if (!a) throw notFound();
  return a;
}

function mustManage(actor: Actor): void {
  if (!actor.manage) throw forbiddenFor("customer support can't manage automatic messages");
}

async function told(): Promise<void> {
  await announce([{ scope: "ops", kind: "messages" }]);
}

async function toDTO(db: Queryable, a: AutomationRecord, actor: Actor): Promise<AutomationDTO> {
  return {
    ...draftOf(a),
    id: a.id,
    status: a.status,
    nextRunAt: a.nextRunAt?.toISOString() ?? null,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    activatedAt: a.activatedAt.toISOString(),
    version: a.version,
    createdBy: a.createdByName ?? "Former staff",
    createdAt: a.createdAt.toISOString(),
    mayEdit: actor.manage && a.status !== "finished",
    runs: await repo.recentRuns(db, a.id),
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function listAutomations(q: Readonly<Record<string, string | undefined>> | null | undefined): Promise<ListPage<AutomationRowDTO>> {
  const req = parseListQuery(q, AUTOMATION_LIST_SPEC);
  const res = await repo.listAutomations(req);
  const items = res.rows.map((a): AutomationRowDTO => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    audience: a.audience,
    mode: a.mode,
    when: automationWhenWords(draftOf(a)),
    status: a.status,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    nextRunAt: a.nextRunAt?.toISOString() ?? null,
  }));
  return offsetListPage(items, req, res);
}

export async function getAutomation(id: string, actor: Actor): Promise<AutomationDTO> {
  return toDTO(pooled, await load(pooled, id), actor);
}

// ── Writes ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Created active: it runs from its next time, and a trigger looks only at moments from now (no backlog, R6). */
export async function createAutomation(body: unknown, actor: Actor, now = new Date()): Promise<AutomationDTO> {
  mustManage(actor);
  const w = parseAutomation(body);
  const next = nextRunFor(w, now);
  if (!next) throw invalidAutomation("repeat.endsOn", "This schedule ends before it would first send.");
  const id = await withTransaction(async (tx) => {
    const id = await repo.insertAutomation(tx, w, next, actor.sub);
    await repo.appendAutomationEvent(tx, id, "created", actor.sub, { mode: w.mode, kind: w.kind });
    return id;
  });
  await told();
  return getAutomation(id, actor);
}

/** L7: a different trigger (kind, number, or mode) looks only at moments from now. */
export const triggerChanged = (a: Pick<AutomationWrite, "mode" | "triggerKind" | "triggerValue">, w: AutomationWrite) =>
  a.mode !== w.mode || a.triggerKind !== w.triggerKind || a.triggerValue !== w.triggerValue;

/** An edit changes future runs only (FR-020). A changed trigger looks only at moments from now (L7). */
export async function editAutomation(id: string, body: unknown, actor: Actor, now = new Date()): Promise<AutomationDTO> {
  mustManage(actor);
  const w = parseAutomation(body, ["version"]);
  const version = (body as Body).version;
  await withTransaction(async (tx) => {
    const a = await load(tx, id, true);
    if (typeof version !== "number" || version !== a.version) throw new MessageError(409, "automation_changed", "Someone else changed this automatic message.");
    if (a.status === "finished") throw new MessageError(409, "automation_finished", "This automatic message has ended.");
    let next: Date | null = null;
    if (a.status === "active") {
      next = nextRunFor(w, now);
      if (!next) throw invalidAutomation("repeat.endsOn", "This schedule has no send left.");
    }
    const reactivate = triggerChanged(a, w);
    await repo.updateAutomation(tx, id, w, next, reactivate);
    await repo.appendAutomationEvent(tx, id, "edited", actor.sub, reactivate ? { triggerChanged: true } : {});
  });
  await told();
  return getAutomation(id, actor);
}

/** Pause, resume or end. Resume never sends what was missed (FR-019): the next run is from now, and triggers look from now. */
export async function changeAutomationState(id: string, body: unknown, actor: Actor, now = new Date()): Promise<AutomationDTO> {
  mustManage(actor);
  if (!isObject(body) || !["pause", "resume", "end"].includes(body.action as string)) throw invalidAutomation("action", "action: pause, resume or end");
  const action = body.action as "pause" | "resume" | "end";
  await withTransaction(async (tx) => {
    const a = await load(tx, id, true);
    if (typeof body.version !== "number" || body.version !== a.version) throw new MessageError(409, "automation_changed", "Someone else changed this automatic message.");
    if (action === "pause") {
      if (a.status !== "active") throw new MessageError(409, "automation_not_active", "Only a running automatic message can be paused.");
      await repo.changeState(tx, id, "paused", null, false);
      await repo.appendAutomationEvent(tx, id, "paused", actor.sub);
    } else if (action === "resume") {
      if (a.status !== "paused") throw new MessageError(409, "automation_not_paused", "Only a paused automatic message can be resumed.");
      const next = nextRunFor(a, now);
      if (!next) throw new MessageError(409, "automation_schedule_ended", "This schedule has no send left. End it, or change its end date.");
      await repo.changeState(tx, id, "active", next, true);
      await repo.appendAutomationEvent(tx, id, "resumed", actor.sub);
    } else {
      if (a.status === "finished") throw new MessageError(409, "automation_finished", "This automatic message has already ended.");
      await repo.changeState(tx, id, "finished", null, false);
      await repo.appendAutomationEvent(tx, id, "ended", actor.sub);
    }
  });
  await told();
  return getAutomation(id, actor);
}

