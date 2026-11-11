// A customer's notification choices and marketing consent (111): the ONE writer of public.customer_notification_choice
// and public.customer_marketing_consent (preferences.guard.test.ts), and the ONE definition of "may this reach them on
// this channel", used by notify() when it writes and by the drain when it releases a held push.
//
// The policy (required, marketing, defaults) is declared once in @effy/shared-types notification-categories.ts and
// enters SQL as a VALUES list built from it, never stored. specs/111-notification-preferences/contracts/.
import { MARKETING_CONSENT } from "@effy/legal-content/consent";
import {
  categoriesFor,
  findPolicy,
  MARKETING_CATEGORIES,
  NOTIFICATION_CATEGORY_POLICY,
  type ConsentSurface,
  type ConsentVia,
  type MarketingCategory,
  type MarketingConsentDTO,
  type NotificationPreferencesChange,
  type NotificationPreferencesDTO,
  type PreferenceCategoryDTO,
  type PreferenceChannel,
} from "@effy/shared-types";

import type { Queryable } from "../lib/db";

/** Every marketing push takes this lock first, so two sends can never both pass one customer's limit (R5). */
export const PROMO_LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtext('notification:promo-limits'))`;

/** The current consent wording version; an answer given to any other is refused (409). */
export const CONSENT_WORDING_VERSION: string = MARKETING_CONSENT.version;

/** Statuses that count as a promotional push given (sent, or waiting to be). */
export const PROMO_COUNTED_STATUSES = ["pending", "sent", "no_device", "muted"] as const;

const sqlBool = (b: boolean) => (b ? "true" : "false");
const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * The policy as an SQL relation `pol(audience, category, required, marketing, push_default, email_default)`. Built from
 * code constants only (never input), so it is safe to inline.
 */
export function policyValuesSql(): string {
  const rows = NOTIFICATION_CATEGORY_POLICY.map(
    (p) =>
      `(${sqlText(p.audience)}, ${sqlText(p.category)}, ${sqlBool(p.required)}, ${sqlBool(p.marketing)}, ${sqlBool(p.defaults.push)}, ${sqlBool(p.defaults.email)})`,
  );
  return `(VALUES ${rows.join(", ")}) AS pol(audience, category, required, marketing, push_default, email_default)`;
}

/**
 * "May this reach them on this channel?" (FR-017; R6) as an SQL boolean, over a row that has `pol` (policyValuesSql),
 * a customer id expression and a channel expression. Required → yes. Marketing → only with a current yes. Otherwise
 * their choice, else the default. A recipient with no customer row (never for a customer audience) gets the default.
 */
export function channelAllowedSql(customerId: string, channel: string): string {
  return `(pol.required OR (
      (NOT pol.marketing OR EXISTS (SELECT 1 FROM public.marketing_consent_current mc
                                     WHERE mc.customer_id = ${customerId} AND mc.category = pol.category AND mc.granted))
      AND COALESCE((SELECT cc.enabled FROM public.customer_notification_choice cc
                     WHERE cc.customer_id = ${customerId} AND cc.category = pol.category AND cc.channel = ${channel}),
                   CASE ${channel} WHEN 'push' THEN pol.push_default ELSE pol.email_default END)))`;
}

/** Has a current yes for the row's (marketing) category. */
export function consentGrantedSql(customerId: string, category = "pol.category"): string {
  return `EXISTS (SELECT 1 FROM public.marketing_consent_current mc
                   WHERE mc.customer_id = ${customerId} AND mc.category = ${category} AND mc.granted)`;
}

/** Effy-clock midnight of the day containing `now` (a timestamptz expression), as a timestamptz. */
export function effyDayStartSql(now: string, tz: string): string {
  return `(date_trunc('day', ${now} AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
}

/**
 * Quiet hours (FR-018; R4): when `now` is in [21:00, 08:00) on Effy's clock, the next 08:00 there; otherwise NULL.
 * Computed on Effy's clock as it reads that night, so a daylight-saving change is honoured.
 */
export function quietUntilSql(now: string, tz: string): string {
  const local = `(${now} AT TIME ZONE ${tz})`;
  return `(CASE
      WHEN extract(hour FROM ${local}) >= 21 THEN (date_trunc('day', ${local}) + interval '1 day 8 hours') AT TIME ZONE ${tz}
      WHEN extract(hour FROM ${local}) < 8 THEN (date_trunc('day', ${local}) + interval '8 hours') AT TIME ZONE ${tz}
    END)`;
}

/**
 * How many promotional pushes this recipient was given since `since` (an SQL timestamptz expression). The partial
 * index notification_marketing_idx keeps it to their marketing rows.
 */
export function promoPushesSinceSql(recipientSub: string, since: string): string {
  return `(SELECT count(*) FROM public.notification m
             JOIN public.notification_delivery md ON md.notification_id = m.id AND md.channel = 'push'
            WHERE m.recipient_sub = ${recipientSub} AND m.audience = 'customer'
              AND m.category = ANY (ARRAY[${MARKETING_CATEGORIES.map(sqlText).join(", ")}])
              AND m.created_at >= ${since}
              AND md.status = ANY (ARRAY[${PROMO_COUNTED_STATUSES.map(sqlText).join(", ")}]))`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading and changing a customer's preferences

export class PreferencesRefused extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: "invalid_preferences_change" | "category_required" | "consent_wording_changed",
    detail: string,
  ) {
    super(detail);
  }
}

interface ChoiceRow { category: string; channel: PreferenceChannel; enabled: boolean }
interface ConsentRow { category: MarketingCategory; granted: boolean; created_at: Date }

/** The categories as the customer sees them, plus consent; `customerId` is theirs (the route resolved it). */
export async function readPreferences(db: Queryable, customerId: string): Promise<Omit<NotificationPreferencesDTO, "askForOffers" | "wordingVersion">> {
  const [choices, consent] = await Promise.all([
    db.query<ChoiceRow>(`SELECT category, channel, enabled FROM public.customer_notification_choice WHERE customer_id = $1`, [customerId]),
    db.query<ConsentRow>(`SELECT category, granted, created_at FROM public.marketing_consent_current WHERE customer_id = $1`, [customerId]),
  ]);
  const chosen = new Map(choices.rows.map((r) => [`${r.category}:${r.channel}`, r.enabled]));
  const categories: PreferenceCategoryDTO[] = categoriesFor("customer").map((p) => ({
    category: p.category,
    required: p.required,
    marketing: p.marketing,
    push: p.required ? true : (chosen.get(`${p.category}:push`) ?? p.defaults.push),
    email: p.required ? true : (chosen.get(`${p.category}:email`) ?? p.defaults.email),
    changeable: [...p.changeable],
  }));
  const state = (c: MarketingCategory) => {
    const row = consent.rows.find((r) => r.category === c);
    return { granted: row?.granted ?? false, answeredAt: row ? new Date(row.created_at).toISOString() : null };
  };
  const out: MarketingConsentDTO = { offers: state("offers"), news: state("news") };
  return { categories, consent: out };
}

/** Show the one-time offers ask (FR-012): never answered, and they have placed an order (the confirmation is the gate). */
export async function askForOffers(db: Queryable, customerId: string): Promise<boolean> {
  const res = await db.query<{ ask: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM public.customer_marketing_consent WHERE customer_id = $1)
            AND EXISTS (SELECT 1 FROM public."order" WHERE customer_id = $1 AND status <> 'failed') AS ask`,
    [customerId],
  );
  return res.rows[0]?.ask ?? false;
}

/** The whole GET body. */
export async function preferencesFor(db: Queryable, customerId: string): Promise<NotificationPreferencesDTO> {
  const [base, ask] = await Promise.all([readPreferences(db, customerId), askForOffers(db, customerId)]);
  return { ...base, askForOffers: ask, wordingVersion: CONSENT_WORDING_VERSION };
}

const SURFACES: readonly ConsentSurface[] = ["app", "web"];
const VIAS: readonly ConsentVia[] = ["settings", "prompt", "inbox"];
const CHANGE_FIELDS = new Set(["surface", "via", "changes", "consent", "wordingVersion"]);

/** A validated change, or a refusal (the contract's table). Pure, so the handler and tests share it. */
export function parsePreferencesChange(body: unknown): NotificationPreferencesChange {
  const bad = (detail: string) => new PreferencesRefused(400, "invalid_preferences_change", detail);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw bad("the body must be an object");
  const b = body as Record<string, unknown>;
  const unknown = Object.keys(b).find((k) => !CHANGE_FIELDS.has(k));
  if (unknown) throw bad(`${unknown} is not a preference field`);
  if (!SURFACES.includes(b.surface as ConsentSurface)) throw bad("surface must be app or web");
  if (b.changes === undefined && b.consent === undefined) throw bad("nothing to change");

  const changes: NonNullable<NotificationPreferencesChange["changes"]> = [];
  if (b.changes !== undefined) {
    if (!Array.isArray(b.changes) || b.changes.length === 0 || b.changes.length > 20) throw bad("changes must be a list of 1 to 20");
    for (const c of b.changes as unknown[]) {
      const ch = c as Record<string, unknown> | null;
      if (!ch || typeof ch !== "object" || typeof ch.category !== "string" || (ch.channel !== "push" && ch.channel !== "email") || typeof ch.enabled !== "boolean") {
        throw bad("each change needs a category, a channel (push or email) and enabled");
      }
      const policy = findPolicy("customer", ch.category);
      if (!policy) throw bad(`${ch.category} is not a customer category`);
      if (policy.required) throw new PreferencesRefused(400, "category_required", `${policy.label} messages can't be turned off`);
      if (!policy.changeable.includes(ch.channel)) throw bad(`${policy.label} has no ${ch.channel} choice`);
      changes.push({ category: ch.category, channel: ch.channel, enabled: ch.enabled });
    }
  }

  let consent: NotificationPreferencesChange["consent"];
  if (b.consent !== undefined) {
    const c = b.consent as Record<string, unknown> | null;
    if (!c || typeof c !== "object" || Array.isArray(c)) throw bad("consent must be an object");
    const keys = Object.keys(c);
    if (keys.length === 0) throw bad("consent names no category");
    for (const k of keys) {
      if (!(MARKETING_CATEGORIES as string[]).includes(k)) throw bad(`${k} is not a marketing category`);
      if (typeof c[k] !== "boolean") throw bad(`consent.${k} must be true or false`);
    }
    if (!VIAS.includes(b.via as ConsentVia)) throw bad("via must be settings, prompt or inbox");
    if (typeof b.wordingVersion !== "string" || b.wordingVersion === "") throw bad("wordingVersion is required with consent");
    if (b.wordingVersion !== CONSENT_WORDING_VERSION) {
      throw new PreferencesRefused(409, "consent_wording_changed", "the wording has changed; read it again");
    }
    consent = c as NotificationPreferencesChange["consent"];
  }

  return {
    surface: b.surface as ConsentSurface,
    ...(b.via !== undefined ? { via: b.via as ConsentVia } : {}),
    ...(changes.length > 0 ? { changes } : {}),
    ...(consent ? { consent } : {}),
    ...(b.wordingVersion !== undefined ? { wordingVersion: b.wordingVersion as string } : {}),
  };
}

/**
 * Apply a validated change in the caller's transaction: upsert each choice, append one consent row per key given (an
 * explicit answer is always recorded, even when it repeats the current one).
 */
export async function applyPreferencesChange(tx: Queryable, customerId: string, change: NotificationPreferencesChange): Promise<void> {
  for (const c of change.changes ?? []) {
    await tx.query(
      `INSERT INTO public.customer_notification_choice (customer_id, category, channel, enabled, surface)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (customer_id, category, channel)
       DO UPDATE SET enabled = EXCLUDED.enabled, surface = EXCLUDED.surface, changed_at = now()`,
      [customerId, c.category, c.channel, c.enabled, change.surface],
    );
  }
  const answers = Object.entries(change.consent ?? {}).filter((e): e is [MarketingCategory, boolean] => typeof e[1] === "boolean");
  if (answers.length > 0) {
    await tx.query(
      `INSERT INTO public.customer_marketing_consent (customer_id, category, granted, surface, via, wording_version)
       SELECT $1, a.category, a.granted, $4, $5, $6 FROM unnest($2::text[], $3::boolean[]) AS a(category, granted)`,
      [customerId, answers.map((a) => a[0]), answers.map((a) => a[1]), change.surface, change.via, change.wordingVersion],
    );
  }
}

/** The customer behind a sub, or null. */
export async function customerIdForSub(db: Queryable, sub: string): Promise<string | null> {
  const res = await db.query<{ id: string }>(`SELECT id FROM public.customer WHERE cognito_sub = $1`, [sub]);
  return res.rows[0]?.id ?? null;
}
