import type { BannerTarget, ShopperPromotionDTO } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { parseCents } from "../lib/money";

import type { BasketLine, Candidate } from "./engine";
import { loadPictures, loadSkins, type PictureRow, type Placement, PLACEMENT_COLUMNS, placementOf, skinIdsOf, type SkinRow, resolveSkin } from "./skins";
import { type CodeRefusal, endsInOf, offerLabelOf, type PromotionWords, termsOf } from "./terms";

/**
 * The reader of the promotion tables: the cart, the payment intent, the group reads and the back-office
 * preview load promotions here only (`promotions.guard.test.ts`).
 */

export type PromotionStateName = "draft" | "scheduled" | "active" | "paused" | "used_up" | "out_of_budget" | "ended" | "archived";

export interface PromotionRecord {
  id: string;
  name: string;
  headline: string | null;
  supportingLine: string | null;
  label: string | null;
  state: PromotionStateName;
  trigger: "automatic" | "code";
  audience: PromotionWords["audience"];
  combinable: boolean;
  startsAt: Date | null;
  /** The effective end: the earlier of `ends_at` and "end now". */
  endsAt: Date | null;
  createdAt: Date;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  budgetCents: number | null;
  uses: number;
  givenCents: number;
  sharedCode: string | null;
  sharedCodeId: string | null;
  appliesTo: Candidate["appliesTo"];
  targets: { productIds: Set<string>; categoryIds: Set<string>; brands: Set<string> };
  /** Where a tap goes, when it covers exactly one product or category. */
  singleProductId: string | null;
  singleCategoryKey: string | null;
  words: PromotionWords;
}

interface Row {
  id: string;
  name: string;
  headline: string | null;
  supporting_line: string | null;
  label: string | null;
  state: PromotionStateName;
  kind: PromotionWords["kind"];
  trigger: "automatic" | "code";
  value_type: PromotionWords["valueType"];
  percent_off: string | null;
  amount_off: string | null;
  max_discount_amount: string | null;
  bxgy_buy_qty: number | null;
  bxgy_get_qty: number | null;
  bxgy_max_per_order: number | null;
  applies_to: Candidate["appliesTo"];
  delivery_types: ("effy" | "courier")[];
  audience: PromotionWords["audience"];
  min_subtotal_amount: string;
  min_quantity: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  ended_at: Date | null;
  days_of_week: number[] | null;
  minute_from: number | null;
  minute_to: number | null;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  budget_amount: string | null;
  combinable: boolean;
  created_at: Date;
  uses: string;
  given: string;
  shared_code: string | null;
  shared_code_id: string | null;
  product_ids: string[];
  category_ids: string[];
  brands: string[];
  product_names: string[];
  category_names: string[];
  category_keys: string[];
}

/** One promotion row with its state, usage, shared code and targets. `$1` is the instant. */
const PROMOTION_SELECT = `
  SELECT p.id::text, p.name, p.headline, p.supporting_line, p.label,
         public.promotion_state(p.id, $1) AS state,
         p.kind, p.trigger, p.value_type, p.percent_off::text, p.amount_off::text, p.max_discount_amount::text,
         p.bxgy_buy_qty, p.bxgy_get_qty, p.bxgy_max_per_order, p.applies_to, p.delivery_types, p.audience,
         p.min_subtotal_amount::text, p.min_quantity, p.starts_at, p.ends_at, p.ended_at, p.days_of_week,
         (extract(hour FROM p.time_from) * 60 + extract(minute FROM p.time_from))::int AS minute_from,
         (extract(hour FROM p.time_to) * 60 + extract(minute FROM p.time_to))::int AS minute_to,
         p.max_uses, p.max_uses_per_customer, p.budget_amount::text, p.combinable, p.created_at,
         u.uses::text, u.given::text,
         sc.code AS shared_code, sc.id::text AS shared_code_id,
         coalesce(t.product_ids, '{}') AS product_ids, coalesce(t.category_ids, '{}') AS category_ids,
         coalesce(t.brands, '{}') AS brands, coalesce(t.product_names, '{}') AS product_names,
         coalesce(t.category_names, '{}') AS category_names, coalesce(t.category_keys, '{}') AS category_keys
    FROM public.promotion p
    CROSS JOIN LATERAL (
      SELECT count(*) AS uses, coalesce(sum(x.goods_amount + x.delivery_amount), 0) AS given
        FROM public.promotion_use x
       WHERE x.promotion_id = p.id AND (x.status = 'confirmed' OR (x.status = 'held' AND x.hold_expires_at > $1))
    ) u
    LEFT JOIN public.promotion_code sc ON sc.promotion_id = p.id AND NOT sc.single_use
    LEFT JOIN LATERAL (
      SELECT array_agg(t.product_id::text) FILTER (WHERE t.product_id IS NOT NULL) AS product_ids,
             array_agg(t.category_id::text) FILTER (WHERE t.category_id IS NOT NULL) AS category_ids,
             array_agg(lower(btrim(t.brand))) FILTER (WHERE t.brand IS NOT NULL) AS brands,
             array_agg(pr.name) FILTER (WHERE pr.id IS NOT NULL) AS product_names,
             array_agg(c.name) FILTER (WHERE c.id IS NOT NULL) AS category_names,
             array_agg(c.key) FILTER (WHERE c.id IS NOT NULL) AS category_keys
        FROM public.promotion_target t
        LEFT JOIN public.product pr ON pr.id = t.product_id
        LEFT JOIN public.category c ON c.id = t.category_id
       WHERE t.promotion_id = p.id
    ) t ON true`;

const cents = (s: string | null): number | null => (s === null ? null : parseCents(s));

function coversWords(r: Row): string | null {
  if (r.applies_to === "cart") return null;
  const names = r.applies_to === "products" ? r.product_names : r.applies_to === "categories" ? r.category_names : r.brands.map(titleCase);
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join(" and ");
  return r.applies_to === "products" ? `${names.length} products` : r.applies_to === "categories" ? `${names.length} categories` : `${names.length} brands`;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

function toRecord(r: Row): PromotionRecord {
  const endedAt = r.ended_at && (!r.ends_at || r.ended_at < r.ends_at) ? r.ended_at : r.ends_at;
  const words: PromotionWords = {
    kind: r.kind,
    valueType: r.value_type,
    percentOff: r.percent_off === null ? null : Number(r.percent_off),
    amountOffCents: cents(r.amount_off),
    maxDiscountCents: cents(r.max_discount_amount),
    bxgy: r.kind === "bxgy" && r.bxgy_buy_qty && r.bxgy_get_qty ? { buy: r.bxgy_buy_qty, get: r.bxgy_get_qty, maxPerOrder: r.bxgy_max_per_order } : null,
    covers: coversWords(r),
    deliveryTypes: r.delivery_types,
    audience: r.audience,
    minSubtotalCents: cents(r.min_subtotal_amount) ?? 0,
    minQuantity: r.min_quantity,
    daysOfWeek: r.days_of_week,
    minuteFrom: r.minute_from,
    minuteTo: r.minute_to,
    maxUsesPerCustomer: r.max_uses_per_customer,
  };
  return {
    id: r.id,
    name: r.name,
    headline: r.headline,
    supportingLine: r.supporting_line,
    label: r.label,
    state: r.state,
    trigger: r.trigger,
    audience: r.audience,
    combinable: r.combinable,
    startsAt: r.starts_at,
    endsAt: endedAt,
    createdAt: r.created_at,
    maxUses: r.max_uses,
    maxUsesPerCustomer: r.max_uses_per_customer,
    budgetCents: cents(r.budget_amount),
    uses: Number(r.uses),
    givenCents: cents(r.given) ?? 0,
    sharedCode: r.shared_code,
    sharedCodeId: r.shared_code_id,
    appliesTo: r.applies_to,
    targets: { productIds: new Set(r.product_ids), categoryIds: new Set(r.category_ids), brands: new Set(r.brands) },
    singleProductId: r.applies_to === "products" && r.product_ids.length === 1 ? r.product_ids[0]! : null,
    singleCategoryKey: r.applies_to === "categories" && r.category_keys.length === 1 ? r.category_keys[0]! : null,
    words,
  };
}

/** Promotions by id, or every live one (published, not archived). */
export async function loadPromotions(db: Queryable, filter: { ids?: readonly string[]; live?: boolean; automaticOnly?: boolean }, now: Date): Promise<PromotionRecord[]> {
  const where: string[] = [];
  const args: unknown[] = [now];
  if (filter.ids) {
    args.push(filter.ids);
    where.push(`p.id = ANY($${args.length}::uuid[])`);
  }
  if (filter.live) where.push(`p.published_at IS NOT NULL AND p.archived_at IS NULL`);
  if (filter.automaticOnly) where.push(`p.trigger = 'automatic'`);
  const res = await db.query<Row>(`${PROMOTION_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.created_at`, args);
  return res.rows.map(toRecord);
}

// Who the shopper is

export interface ShopperFacts {
  customerId: string;
  /** Has an order that reached payment and was not cancelled ("first order"). */
  hasOrdered: boolean;
  createdAt: Date;
  chosenIn: Set<string>;
  usesByPromotion: Map<string, number>;
}

export async function shopperFacts(db: Queryable, customerId: string, now: Date, excludeOrderId: string | null = null): Promise<ShopperFacts> {
  const [me, chosen, used] = await Promise.all([
    db.query<{ created_at: Date; has_ordered: boolean }>(
      `SELECT c.created_at,
              EXISTS (SELECT 1 FROM public."order" o
                       WHERE o.customer_id = c.id AND o.status NOT IN ('pending_payment', 'failed', 'canceled')
                         AND ($2::uuid IS NULL OR o.id <> $2)) AS has_ordered
         FROM public.customer c WHERE c.id = $1`,
      [customerId, excludeOrderId],
    ),
    db.query<{ promotion_id: string }>(`SELECT promotion_id::text FROM public.promotion_customer WHERE customer_id = $1`, [customerId]),
    db.query<{ promotion_id: string; n: string }>(
      `SELECT promotion_id::text, count(*)::text AS n FROM public.promotion_use
        WHERE customer_id = $1 AND ($3::uuid IS NULL OR order_id <> $3)
          AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > $2))
        GROUP BY promotion_id`,
      [customerId, now, excludeOrderId],
    ),
  ]);
  return {
    customerId,
    hasOrdered: me.rows[0]?.has_ordered ?? false,
    createdAt: me.rows[0]?.created_at ?? now,
    chosenIn: new Set(chosen.rows.map((r) => r.promotion_id)),
    usesByPromotion: new Map(used.rows.map((r) => [r.promotion_id, Number(r.n)])),
  };
}

/** Whether this shopper may use it: null = yes. */
export function eligibility(rec: PromotionRecord, facts: ShopperFacts | null): "sign_in" | "not_eligible" | "already_used" | null {
  if (rec.audience !== "everyone" || rec.maxUsesPerCustomer !== null) {
    if (!facts) return rec.audience === "everyone" ? null : "sign_in";
  }
  if (facts) {
    if (rec.audience === "first_order" && facts.hasOrdered) return "not_eligible";
    if (rec.audience === "new_customers" && facts.createdAt < (rec.startsAt ?? rec.createdAt)) return "not_eligible";
    if (rec.audience === "chosen" && !facts.chosenIn.has(rec.id)) return "not_eligible";
    if (rec.maxUsesPerCustomer !== null && (facts.usesByPromotion.get(rec.id) ?? 0) >= rec.maxUsesPerCustomer) return "already_used";
  }
  return null;
}

export function toCandidate(rec: PromotionRecord, code: { id: string; text: string } | null = null): Candidate {
  const w = rec.words;
  return {
    id: rec.id,
    name: rec.name,
    headline: rec.headline,
    kind: w.kind,
    valueType: w.valueType,
    percentOff: w.percentOff,
    amountOffCents: w.amountOffCents,
    maxDiscountCents: w.maxDiscountCents,
    bxgy: w.bxgy,
    appliesTo: rec.appliesTo,
    targets: rec.targets,
    deliveryTypes: w.deliveryTypes,
    minSubtotalCents: w.minSubtotalCents,
    minQuantity: w.minQuantity,
    daysOfWeek: w.daysOfWeek,
    minuteFrom: w.minuteFrom,
    minuteTo: w.minuteTo,
    combinable: rec.combinable,
    endsAt: rec.endsAt,
    createdAt: rec.createdAt,
    budgetLeftCents: rec.budgetCents === null ? null : Math.max(0, rec.budgetCents - rec.givenCents),
    codeId: code?.id ?? null,
    codeText: code?.text ?? null,
  };
}

// Codes

export interface FoundCode {
  codeId: string;
  promotionId: string;
  codeText: string;
  singleUse: boolean;
  /** A single-use code already held or used by another order. */
  taken: boolean;
}

/** Matched without regard to case or spaces. */
export const normaliseCode = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();

export async function findCode(db: Queryable, raw: string, now: Date, excludeOrderId: string | null = null): Promise<FoundCode | null> {
  const code = normaliseCode(raw);
  if (!code) return null;
  const res = await db.query<{ id: string; promotion_id: string; code: string; single_use: boolean; taken: boolean }>(
    `SELECT c.id::text, c.promotion_id::text, c.code, c.single_use,
            EXISTS (SELECT 1 FROM public.promotion_use u
                     WHERE u.code_id = c.id AND c.single_use AND ($3::uuid IS NULL OR u.order_id <> $3)
                       AND (u.status = 'confirmed' OR (u.status = 'held' AND u.hold_expires_at > $2))) AS taken
       FROM public.promotion_code c WHERE upper(regexp_replace(c.code, '\\s', '', 'g')) = $1`,
    [code, now, excludeOrderId],
  );
  const r = res.rows[0];
  return r ? { codeId: r.id, promotionId: r.promotion_id, codeText: r.code, singleUse: r.single_use, taken: r.taken } : null;
}

export async function codeById(db: Queryable, codeId: string): Promise<{ codeId: string; promotionId: string; codeText: string; singleUse: boolean } | null> {
  const r = (
    await db.query<{ id: string; promotion_id: string; code: string; single_use: boolean }>(
      `SELECT id::text, promotion_id::text, code, single_use FROM public.promotion_code WHERE id = $1`,
      [codeId],
    )
  ).rows[0];
  return r ? { codeId: r.id, promotionId: r.promotion_id, codeText: r.code, singleUse: r.single_use } : null;
}

/** Why an entered code cannot be used now, or null when it can be (before the basket is judged). */
export function codeRefusal(rec: PromotionRecord | undefined, found: FoundCode, facts: ShopperFacts | null): CodeRefusal | null {
  if (!rec || rec.state === "draft" || rec.state === "archived") return "promo_unknown";
  if (rec.state === "scheduled") return "promo_not_started";
  if (rec.state === "ended" || rec.state === "paused") return "promo_ended";
  if (rec.state === "used_up") return "promo_used_up";
  if (rec.state === "out_of_budget") return "promo_out_of_budget";
  if (found.taken) return "promo_code_used";
  const e = eligibility(rec, facts);
  if (e === "sign_in") return "promo_sign_in";
  if (e === "not_eligible") return "promo_not_eligible";
  if (e === "already_used") return "promo_already_used";
  return null;
}

// The candidates for a basket

export interface CandidateSet {
  candidates: Candidate[];
  records: Map<string, PromotionRecord>;
  /** Why the entered code cannot be used, when it cannot. */
  enteredRefusal: CodeRefusal | null;
}

/**
 * Every promotion that could apply to this shopper now: the automatic ones they may use, plus the one
 * whose code they entered. The basket itself is judged by the engine.
 */
export async function candidatesFor(
  db: Queryable,
  input: { customerId: string | null; enteredCodeId: string | null; now: Date; excludeOrderId?: string | null },
): Promise<CandidateSet> {
  const { now } = input;
  const exclude = input.excludeOrderId ?? null;
  const entered = input.enteredCodeId ? await codeById(db, input.enteredCodeId) : null;
  const [auto, facts] = await Promise.all([
    loadPromotions(db, { live: true, automaticOnly: true }, now),
    input.customerId ? shopperFacts(db, input.customerId, now, exclude) : Promise.resolve(null),
  ]);
  const records = new Map(auto.map((r) => [r.id, r]));
  const candidates: Candidate[] = auto.filter((r) => r.state === "active" && eligibility(r, facts) === null).map((r) => toCandidate(r));

  let enteredRefusal: CodeRefusal | null = null;
  if (entered) {
    const [rec] = await loadPromotions(db, { ids: [entered.promotionId] }, now);
    if (rec) records.set(rec.id, rec);
    const found = await findCode(db, entered.codeText, now, exclude);
    enteredRefusal = found ? codeRefusal(rec, found, facts) : "promo_unknown";
    if (!enteredRefusal && rec) {
      const others = candidates.filter((c) => c.id !== rec.id);
      candidates.length = 0;
      candidates.push(...others, toCandidate(rec, { id: entered.codeId, text: entered.codeText }));
    }
  }
  return { candidates, records, enteredRefusal };
}

/** The basket lines with what the engine needs to match targets: the categories it is in (with ancestors), brand. */
export async function basketLinesFor(
  db: Queryable,
  lines: readonly { lineId: string; productId: string; unitCents: number; quantity: number }[],
): Promise<BasketLine[]> {
  if (lines.length === 0) return [];
  const ids = [...new Set(lines.map((l) => l.productId))];
  const res = await db.query<{ id: string; brand: string | null; category_ids: string[] }>(
    // A product is in its home leaf, its extra placements and every category above them (101 FR-009).
    `SELECT p.id::text, lower(btrim(p.brand)) AS brand,
            coalesce((SELECT array_agg(DISTINCT a.ancestor_id::text)
                        FROM public.category_ancestor a
                       WHERE a.category_id = p.primary_category_id
                          OR a.category_id IN (SELECT pp.category_id FROM public.product_placement pp WHERE pp.product_id = p.id)), '{}') AS category_ids
       FROM public.product p WHERE p.id = ANY($1::uuid[])`,
    [ids],
  );
  const facts = new Map(res.rows.map((r) => [r.id, r]));
  return lines.map((l) => ({
    ...l,
    brand: facts.get(l.productId)?.brand ?? null,
    categoryIds: facts.get(l.productId)?.category_ids ?? [],
  }));
}

// What the clients are shown

function targetOf(rec: PromotionRecord): BannerTarget {
  if (rec.singleProductId) return { kind: "product", productId: rec.singleProductId };
  if (rec.singleCategoryKey) return { kind: "category", categoryKey: rec.singleCategoryKey };
  return { kind: "promotion", promotionId: rec.id };
}

export function shopperPromotion(rec: PromotionRecord, now: Date): ShopperPromotionDTO {
  return {
    id: rec.id,
    kind: rec.words.kind,
    headline: rec.headline ?? offerLabelOf(rec.words),
    supportingLine: rec.supportingLine,
    label: rec.label,
    // A promotion with only single-use codes shows none.
    code: rec.trigger === "code" ? rec.sharedCode : null,
    terms: termsOf(rec.words),
    endsIn: endsInOf(rec.endsAt, now),
    target: targetOf(rec),
  };
}

/** Why a member of a group is not shown to this shopper now, or null when it is. */
export function hiddenBecause(rec: PromotionRecord, facts: ShopperFacts | null, personal: boolean): PromotionStateName | "personal" | null {
  if (rec.state !== "active") return rec.state;
  if (!personal && rec.audience !== "everyone") return "personal";
  const e = eligibility(rec, facts);
  if (e === "sign_in" && rec.audience === "everyone") return null;
  return e ? "personal" : null;
}

/**
 * Display groups by key, each group's promotions in order, only those this shopper could use now.
 * `personal` is the signed-in read; otherwise everyone-audience only. An unknown key answers empty.
 */
export async function groupPromotions(
  db: Queryable,
  keys: readonly string[],
  input: { customerId: string | null; now: Date },
): Promise<{ key: string; promotions: ShopperPromotionDTO[] }[]> {
  const wanted = [...new Set(keys.filter((k) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(k)))].slice(0, 12);
  if (wanted.length === 0) return keys.map((key) => ({ key, promotions: [] }));
  const members = await db.query<{ key: string; promotion_id: string; size: string; member_skin_id: string | null; default_skin_id: string; default_code_skin_id: string | null; image_id: string | null }>(
    `SELECT g.key, m.promotion_id::text, ${PLACEMENT_COLUMNS}
       FROM public.promotion_group g JOIN public.promotion_group_member m ON m.group_id = g.id
      WHERE g.key = ANY($1::text[])
      ORDER BY g.key, m.position, m.promotion_id`,
    [wanted],
  );
  const ids = [...new Set(members.rows.map((r) => r.promotion_id))];
  const placements = members.rows.map(placementOf);
  const [recs, facts, skins, pictures] = await Promise.all([
    ids.length ? loadPromotions(db, { ids }, input.now) : Promise.resolve([]),
    input.customerId ? shopperFacts(db, input.customerId, input.now) : Promise.resolve(null),
    loadSkins(db, skinIdsOf(placements)),
    loadPictures(db, ids),
  ]);
  const byId = new Map(recs.map((r) => [r.id, r]));
  const personal = input.customerId !== null;
  return keys.map((key) => ({
    key,
    promotions: members.rows.flatMap((m, i) => {
      if (m.key !== key) return [];
      const r = byId.get(m.promotion_id);
      if (r === undefined || hiddenBecause(r, facts, personal) !== null) return [];
      return [placedPromotion(r, placements[i]!, skins, pictures.get(r.id) ?? [], input.now)];
    }),
  }));
}

/** A promotion as shown in one place: the shopper's words plus its skin there. */
export function placedPromotion(
  rec: PromotionRecord,
  placement: Placement,
  skins: ReadonlyMap<string, SkinRow>,
  pictures: readonly PictureRow[],
  now: Date,
): ShopperPromotionDTO {
  const dto = shopperPromotion(rec, now);
  const skin = resolveSkin(placement, dto.code !== null, skins, pictures);
  return skin ? { ...dto, skin } : dto;
}
