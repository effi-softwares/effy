// Who a back-office message is for (112 R4): a closed set of filters per audience, each a reviewed SQL fragment with
// parameters. Never SQL from a client. The live count and the sending worker both build on `peopleSql`, so the count
// staff see is the same question the worker asks when it sends. Filters combine with AND; {} means everyone.
//
// The ONE place that knows how a customer, driver or shop staff member is matched (messages.guard.test.ts).
import {
  MESSAGE_LIMITS,
  OPERATING_TZ,
  type AudienceFilter,
  type AudienceFilterByAudience,
  type CustomerAudienceFilter,
  type DriverAudienceFilter,
  type NotificationAudience,
  type ShopAudienceFilter,
} from "@effy/shared-types";

import type { Queryable } from "../../lib/db";
import { ON_DUTY_EXISTS } from "../../lib/driver-duty";
import { consentGrantedSql } from "../preferences";

export class AudienceInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudienceInvalid";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSTCODE = /^\d{4}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ids(v: unknown, what: string, max: number): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) throw new AudienceInvalid(`${what}: 1–${max} ids`);
  for (const x of v) if (typeof x !== "string" || !UUID.test(x)) throw new AudienceInvalid(`${what}: not an id`);
  return [...new Set(v.map((x: string) => x.toLowerCase()))];
}

function flag(v: unknown, what: string): true {
  if (v !== true) throw new AudienceInvalid(`${what}: only true`);
  return true;
}

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], audience: string): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new AudienceInvalid(`${audience}: unknown filter ${k}`);
}

const CUSTOMER_KEYS = ["people", "postcodes", "groups", "orderedWithinDays", "neverOrdered", "hasPoints", "appUsers"] as const;
const DRIVER_KEYS = ["people", "onDuty", "workToday", "collectionToday", "deliveryToday", "clearance"] as const;
const SHOP_KEYS = ["shops", "managersOnly"] as const;

/** The closed shape (shared-types messages.ts). Throws `AudienceInvalid` on anything else. */
export function parseAudience<A extends NotificationAudience>(audience: A, json: unknown): AudienceFilterByAudience[A] {
  if (!isObject(json)) throw new AudienceInvalid(`${audience}: the filter must be an object`);
  if (audience === "customer") {
    onlyKeys(json, CUSTOMER_KEYS, audience);
    const f: CustomerAudienceFilter = {};
    if (json.people !== undefined) f.people = ids(json.people, "people", MESSAGE_LIMITS.people);
    if (json.postcodes !== undefined) {
      const v = json.postcodes;
      if (!Array.isArray(v) || v.length === 0 || v.length > MESSAGE_LIMITS.postcodes) throw new AudienceInvalid(`postcodes: 1–${MESSAGE_LIMITS.postcodes}`);
      for (const p of v) if (typeof p !== "string" || !POSTCODE.test(p)) throw new AudienceInvalid("postcodes: four digits");
      f.postcodes = [...new Set(v as string[])];
    }
    if (json.groups !== undefined) f.groups = ids(json.groups, "groups", MESSAGE_LIMITS.groups);
    if (json.orderedWithinDays !== undefined) {
      const n = json.orderedWithinDays;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MESSAGE_LIMITS.orderedWithinDays) {
        throw new AudienceInvalid(`orderedWithinDays: 1–${MESSAGE_LIMITS.orderedWithinDays}`);
      }
      f.orderedWithinDays = n;
    }
    if (json.neverOrdered !== undefined) f.neverOrdered = flag(json.neverOrdered, "neverOrdered");
    if (json.hasPoints !== undefined) f.hasPoints = flag(json.hasPoints, "hasPoints");
    if (json.appUsers !== undefined) f.appUsers = flag(json.appUsers, "appUsers");
    if (f.neverOrdered && f.orderedWithinDays) throw new AudienceInvalid("ordered recently and never ordered can't both apply");
    return f as AudienceFilterByAudience[A];
  }
  if (audience === "driver") {
    onlyKeys(json, DRIVER_KEYS, audience);
    const f: DriverAudienceFilter = {};
    if (json.people !== undefined) f.people = ids(json.people, "people", MESSAGE_LIMITS.people);
    if (json.onDuty !== undefined) f.onDuty = flag(json.onDuty, "onDuty");
    if (json.workToday !== undefined) f.workToday = flag(json.workToday, "workToday");
    if (json.collectionToday !== undefined) f.collectionToday = flag(json.collectionToday, "collectionToday");
    if (json.deliveryToday !== undefined) f.deliveryToday = flag(json.deliveryToday, "deliveryToday");
    if (json.clearance !== undefined) {
      const c = json.clearance;
      if (!isObject(c)) throw new AudienceInvalid("clearance: {function, zoneId}");
      onlyKeys(c, ["function", "zoneId"], "clearance");
      if (c.function !== "collection" && c.function !== "delivery") throw new AudienceInvalid("clearance: collection or delivery");
      if (c.zoneId !== null && (typeof c.zoneId !== "string" || !UUID.test(c.zoneId))) throw new AudienceInvalid("clearance: zoneId is an id or null");
      f.clearance = { function: c.function, zoneId: c.zoneId as string | null };
    }
    return f as AudienceFilterByAudience[A];
  }
  if (audience === "shop") {
    onlyKeys(json, SHOP_KEYS, audience);
    const f: ShopAudienceFilter = {};
    if (json.shops !== undefined) f.shops = ids(json.shops, "shops", MESSAGE_LIMITS.shops);
    if (json.managersOnly !== undefined) f.managersOnly = flag(json.managersOnly, "managersOnly");
    return f as AudienceFilterByAudience[A];
  }
  throw new AudienceInvalid(`unknown audience ${String(audience)}`);
}

/** A statement and its parameters. Parameters are numbered from $1. */
export interface Sql {
  text: string;
  values: unknown[];
}

class Params {
  readonly values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/** A run (any, or of one kind) still to do today on Effy's clock: the same rule as the driver's catch-up notice (110). */
function driverRoundToday(p: Params, now: Date, kind: "collection" | "delivery" | null): string {
  const tz = p.add(OPERATING_TZ);
  const day = `(${p.add(now.toISOString())}::timestamptz AT TIME ZONE ${tz})::date`;
  return `EXISTS (SELECT 1 FROM public.driver_round r
                   WHERE r.driver_id = d.id AND r.status IN ('planned', 'in_progress')
                     AND (r.deadline_at AT TIME ZONE ${tz})::date = ${day}
                     ${kind ? `AND r.kind = ${p.add(kind)}` : ""})`;
}

/**
 * Everyone in the audience who matches, one row per person: `sub` (their sign-in subject) and `id` (the customer, driver
 * or shop staff id). Active people only: an open, active customer account; an active driver; active staff of an
 * active shop.
 */
function peopleSql(p: Params, audience: NotificationAudience, filter: AudienceFilter, now: Date): string {
  const where: string[] = [];
  if (audience === "customer") {
    const f = filter as CustomerAudienceFilter;
    if (f.people) where.push(`c.id = ANY(${p.add(f.people)}::uuid[])`);
    if (f.postcodes) {
      where.push(`EXISTS (SELECT 1 FROM public.customer_address a WHERE a.customer_id = c.id AND a.postal_code = ANY(${p.add(f.postcodes)}::text[]))`);
    }
    if (f.groups) {
      where.push(`EXISTS (SELECT 1 FROM public.customer_address a
                            JOIN public.delivery_zone_postcode z ON z.postcode = a.postal_code
                           WHERE a.customer_id = c.id AND z.zone_id = ANY(${p.add(f.groups)}::uuid[]))`);
    }
    if (f.orderedWithinDays) {
      where.push(`EXISTS (SELECT 1 FROM public."order" o
                           WHERE o.customer_id = c.id AND o.status = 'paid'
                             AND COALESCE(o.placed_at, o.created_at) >= ${p.add(now.toISOString())}::timestamptz - make_interval(days => ${p.add(f.orderedWithinDays)}::int))`);
    }
    if (f.neverOrdered) where.push(`NOT EXISTS (SELECT 1 FROM public."order" o WHERE o.customer_id = c.id AND o.status = 'paid')`);
    if (f.hasPoints) where.push(`public.points_usable(c.id, ${p.add(now.toISOString())}::timestamptz) > 0`);
    if (f.appUsers) where.push(`EXISTS (SELECT 1 FROM public.device_token t WHERE t.subject_sub = c.cognito_sub AND t.audience = 'customer')`);
    return `SELECT c.cognito_sub AS sub, c.id
              FROM public.customer c
             WHERE c.cognito_sub IS NOT NULL AND c.status = 'active' AND c.closure_state = 'open'
               ${where.map((w) => `AND ${w}`).join("\n               ")}`;
  }
  if (audience === "driver") {
    const f = filter as DriverAudienceFilter;
    if (f.people) where.push(`d.id = ANY(${p.add(f.people)}::uuid[])`);
    if (f.onDuty) where.push(ON_DUTY_EXISTS);
    if (f.workToday) where.push(driverRoundToday(p, now, null));
    if (f.collectionToday) where.push(driverRoundToday(p, now, "collection"));
    if (f.deliveryToday) where.push(driverRoundToday(p, now, "delivery"));
    if (f.clearance) {
      // Cleared for that area, or everywhere. "Everywhere" asked for (zoneId null) means cleared everywhere.
      const fn = p.add(f.clearance.function);
      where.push(
        f.clearance.zoneId
          ? `EXISTS (SELECT 1 FROM public.driver_zone_capability k WHERE k.driver_id = d.id AND k.function = ${fn}
                       AND (k.zone_id IS NULL OR k.zone_id = ${p.add(f.clearance.zoneId)}::uuid))`
          : `EXISTS (SELECT 1 FROM public.driver_zone_capability k WHERE k.driver_id = d.id AND k.function = ${fn} AND k.zone_id IS NULL)`,
      );
    }
    return `SELECT d.cognito_sub AS sub, d.id
              FROM public.driver d
             WHERE d.cognito_sub IS NOT NULL AND d.status = 'active'
               ${where.map((w) => `AND ${w}`).join("\n               ")}`;
  }
  const f = filter as ShopAudienceFilter;
  if (f.shops) where.push(`ss.shop_id = ANY(${p.add(f.shops)}::uuid[])`);
  if (f.managersOnly) where.push(`EXISTS (SELECT 1 FROM public.shop_staff_role r WHERE r.staff_id = ss.id AND r.role_key = 'shop_manager')`);
  return `SELECT ss.cognito_sub AS sub, ss.id
            FROM public.shop_staff ss
            JOIN public.shop s ON s.id = ss.shop_id
           WHERE ss.cognito_sub IS NOT NULL AND ss.status = 'active' AND s.status = 'active'
             ${where.map((w) => `AND ${w}`).join("\n             ")}`;
}

/** The next page of people after `afterSub`, ordered by `sub`: the sending worker's cursor (R3). */
export function recipientsSql(
  audience: NotificationAudience,
  filter: AudienceFilter,
  opts: { afterSub: string | null; limit: number; now?: Date },
): Sql {
  const p = new Params();
  const people = peopleSql(p, audience, filter, opts.now ?? new Date());
  const after = p.add(opts.afterSub ?? "");
  const limit = p.add(opts.limit);
  return {
    text: `SELECT DISTINCT sub FROM (${people}) people WHERE sub > ${after} ORDER BY sub LIMIT ${limit}`,
    values: p.values,
  };
}

/**
 * How many people match, and, for offers and news, how many of them have a current yes for that category: one query,
 * so "match" and "said yes" never disagree.
 */
export function countSql(audience: NotificationAudience, filter: AudienceFilter, consentCategory: "offers" | "news" | null, now?: Date): Sql {
  const p = new Params();
  const people = peopleSql(p, audience, filter, now ?? new Date());
  const consented =
    consentCategory && audience === "customer"
      ? `count(DISTINCT people.sub) FILTER (WHERE ${consentGrantedSql("people.id", p.add(consentCategory))})::int`
      : "NULL::int";
  return { text: `SELECT count(DISTINCT people.sub)::int AS matched, ${consented} AS consented FROM (${people}) people`, values: p.values };
}

export async function countAudience(
  db: Queryable,
  audience: NotificationAudience,
  filter: AudienceFilter,
  consentCategory: "offers" | "news" | null,
  now?: Date,
): Promise<{ matched: number; consented: number | null }> {
  const q = countSql(audience, filter, consentCategory, now);
  const row = (await db.query<{ matched: number; consented: number | null }>(q.text, q.values)).rows[0];
  return { matched: row?.matched ?? 0, consented: row?.consented ?? null };
}

/** One person, by the id staff know them by: their sign-in subject, or null when they can't be reached (closed, …). */
export async function personSub(db: Queryable, audience: NotificationAudience, personId: string, now?: Date): Promise<string | null> {
  if (!UUID.test(personId)) return null;
  const filter: AudienceFilter = audience === "shop" ? {} : { people: [personId.toLowerCase()] };
  const p = new Params();
  const people = peopleSql(p, audience, filter, now ?? new Date());
  const id = p.add(personId.toLowerCase());
  const row = (await db.query<{ sub: string }>(`SELECT sub FROM (${people}) people WHERE people.id = ${id}::uuid LIMIT 1`, p.values)).rows[0];
  return row?.sub ?? null;
}

/**
 * Emails from a file, resolved to customer ids (R4): found ids (each once), how many were not found, how many repeated.
 * Case-insensitive. The draft stores ids, never the emails.
 */
export async function resolveCustomerEmails(
  db: Queryable,
  emails: readonly string[],
): Promise<{ ids: string[]; notFound: number; repeated: number }> {
  if (emails.length > MESSAGE_LIMITS.people) throw new AudienceInvalid(`at most ${MESSAGE_LIMITS.people} emails`);
  const cleaned = emails.map((e) => (typeof e === "string" ? e.trim().toLowerCase() : "")).filter((e) => e.length > 0);
  const unique = [...new Set(cleaned)];
  const repeated = cleaned.length - unique.length;
  if (unique.length === 0) return { ids: [], notFound: 0, repeated };
  const res = await db.query<{ id: string; email: string }>(
    `SELECT c.id::text AS id, lower(c.email::text) AS email
       FROM public.customer c
      WHERE lower(c.email::text) = ANY($1::text[]) AND c.status = 'active' AND c.closure_state = 'open'`,
    [unique],
  );
  const found = new Set(res.rows.map((r) => r.email));
  return { ids: [...new Set(res.rows.map((r) => r.id))], notFound: unique.filter((e) => !found.has(e)).length, repeated };
}

/** True when this audience's filter narrows nothing: the "all customers" typed confirmation (R12). */
export function isWholeAudience(filter: AudienceFilter): boolean {
  return Object.keys(filter).length === 0;
}

