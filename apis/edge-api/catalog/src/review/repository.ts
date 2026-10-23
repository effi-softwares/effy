// Every decision is one transaction: re-read under a row lock with the version the reviewer saw,
// change the live product, write the audit row and enqueue the shop's notifications.
// The version is `updated_at::text`, compared as text: a JS Date loses microseconds.

import type pg from "pg";

import { query, withTransaction } from "@effy/edge-shared";

export interface QueueRow {
  product_id: string;
  kind: "new_product" | "change";
  shop_id: string;
  shop_name: string;
  product_name: string;
  submitted_at: Date;
  submitted_at_text: string;
  waiting_hours: string;
}

export interface QueueParams {
  shopId: string | null;
  kind: "new_product" | "change" | null;
  q: string | null;
  afterSubmittedAt: string | null;
  afterProductId: string | null;
  limit: number;
}

/** New products and pending changes as one list, oldest first, so neither goes unwatched. */
const QUEUE_ROWS = `
      SELECT p.id AS product_id, 'new_product'::text AS kind, p.shop_id, s.name AS shop_name,
             p.name AS product_name, p.submitted_at
        FROM public.product p
        JOIN public.shop s ON s.id = p.shop_id
       WHERE p.approved_at IS NULL AND p.review_state = 'in_review'
      UNION ALL
      SELECT p.id, 'change'::text, p.shop_id, s.name, p.name, pc.submitted_at
        FROM public.product_change pc
        JOIN public.product p ON p.id = pc.product_id
        JOIN public.shop s ON s.id = p.shop_id
       WHERE pc.state = 'in_review'
`;

/** $1 shop, $2 kind, $3 name. */
const QUEUE_FILTERS = `
   WHERE ($1::uuid IS NULL OR q.shop_id = $1)
     AND ($2::text IS NULL OR q.kind = $2)
     AND ($3::text IS NULL OR lower(q.product_name) LIKE '%' || lower($3) || '%')
`;

const QUEUE = `
  SELECT q.product_id, q.kind, q.shop_id, q.shop_name, q.product_name, q.submitted_at,
         q.submitted_at::text AS submitted_at_text,
         floor(extract(epoch FROM (now() - q.submitted_at)) / 3600)::text AS waiting_hours
    FROM (${QUEUE_ROWS}) q
  ${QUEUE_FILTERS}
     AND ($4::text IS NULL OR (q.submitted_at, q.product_id) > ($4::timestamptz, $5::uuid))
   ORDER BY q.submitted_at, q.product_id
   LIMIT $6
`;

/** The rail's count: the same rows and filters as the list, without the cursor. */
const QUEUE_COUNT = `
  SELECT count(*)::text AS n
    FROM (${QUEUE_ROWS}) q
  ${QUEUE_FILTERS}
`;

export async function listQueue(p: QueueParams): Promise<QueueRow[]> {
  const res = await query<QueueRow>(QUEUE, [p.shopId, p.kind, p.q, p.afterSubmittedAt, p.afterProductId, p.limit]);
  return res.rows;
}

export async function countQueue(p: Pick<QueueParams, "shopId" | "kind" | "q">): Promise<number> {
  const res = await query<{ n: string }>(QUEUE_COUNT, [p.shopId, p.kind, p.q]);
  return Number(res.rows[0]?.n ?? 0);
}

export interface MarginNotSetRow {
  product_id: string;
  shop_id: string;
  shop_name: string;
  product_name: string;
  shop_price_amount: string;
  status: string;
}

/** They sell at the shop's price until Effy sets one. */
export async function listMarginNotSet(
  shopId: string | null,
  afterProductId: string | null,
  limit: number,
): Promise<MarginNotSetRow[]> {
  const res = await query<MarginNotSetRow>(
    `SELECT p.id AS product_id, p.shop_id, s.name AS shop_name, p.name AS product_name,
            -- The lowest shop price among its active variants ("from").
            (SELECT min(v.shop_price_amount) FROM public.product_variant v
              WHERE v.product_id = p.id AND v.state = 'active')::text AS shop_price_amount,
            p.status
       FROM public.product p
       JOIN public.shop s ON s.id = p.shop_id
      WHERE p.approved_at IS NOT NULL AND p.margin_kind IS NULL AND p.status <> 'archived'
        AND ($1::uuid IS NULL OR p.shop_id = $1)
        AND ($2::uuid IS NULL OR p.id > $2)
      ORDER BY p.id
      LIMIT $3`,
    [shopId, afterProductId, limit],
  );
  return res.rows;
}

/** Whole hours; null when the queue is empty. */
export async function oldestWaitingHours(): Promise<number | null> {
  const res = await query<{ hours: string | null }>(
    `SELECT floor(extract(epoch FROM (now() - min(submitted_at))) / 3600)::text AS hours
       FROM (
         SELECT submitted_at FROM public.product WHERE approved_at IS NULL AND review_state = 'in_review'
         UNION ALL
         SELECT submitted_at FROM public.product_change WHERE state = 'in_review'
       ) q`,
  );
  const h = res.rows[0]?.hours;
  return h === null || h === undefined ? null : Number(h);
}

export interface ProductRow {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_status: string;
  name: string;
  brand: string | null;
  short_description: string;
  long_description: string | null;
  product_type_id: string;
  type_name: string;
  primary_category_id: string;
  category_name: string;
  gst_status: "taxable" | "gst_free" | null;
  unit_basis: string | null;
  status: string;
  margin_kind: "percent" | "amount" | null;
  margin_value: string | null;
  approved: boolean;
  review_state: "none" | "in_review" | "sent_back";
  submitted_at: Date | null;
  version: string;
}

const PRODUCT = `
  SELECT p.id, p.shop_id, s.name AS shop_name, s.status AS shop_status,
         p.name, p.brand, p.short_description, p.long_description,
         p.product_type_id, pt.name AS type_name, p.primary_category_id, c.name AS category_name,
         p.gst_status, p.unit_basis, p.status,
         -- Prices, codes and weights are the VARIANTS' (readVariantSets).
         p.margin_kind, p.margin_value::text AS margin_value,
         p.approved_at IS NOT NULL AS approved, p.review_state, p.submitted_at,
         p.updated_at::text AS version
    FROM public.product p
    JOIN public.shop s ON s.id = p.shop_id
    JOIN public.product_type pt ON pt.id = p.product_type_id
    JOIN public.category c ON c.id = p.primary_category_id
   WHERE p.id = $1
`;

type Runner = { query: pg.PoolClient["query"] } | null;

async function run<T extends pg.QueryResultRow>(tx: Runner, sql: string, params: unknown[]): Promise<pg.QueryResult<T>> {
  return tx ? (tx.query(sql, params as never[]) as unknown as Promise<pg.QueryResult<T>>) : query<T>(sql, params);
}

export async function readProduct(productId: string, tx: Runner = null, lock = false): Promise<ProductRow | null> {
  const res = await run<ProductRow>(tx, PRODUCT + (lock ? " FOR UPDATE OF p" : ""), [productId]);
  return res.rows[0] ?? null;
}

export interface AttributeRow {
  attribute_definition_id: string;
  key: string;
  name: string;
  value_text: string | null;
  value_number: string | null;
  value_boolean: boolean | null;
  value_options: string[] | null;
}

export async function readAttributes(productId: string): Promise<AttributeRow[]> {
  const res = await query<AttributeRow>(
    `SELECT pav.attribute_definition_id, ad.key, ad.name,
            pav.value_text, pav.value_number::text AS value_number, pav.value_boolean, pav.value_options
       FROM public.product_attribute_value pav
       JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = $1
      ORDER BY ad.name`,
    [productId],
  );
  return res.rows;
}

export interface MediaRow {
  storage_key: string;
  is_primary: boolean;
  display_order: number;
  alt_text: string | null;
  /** The live image it keeps, or null for a new upload. */
  source_media_id: string | null;
}

export async function readLiveMedia(productId: string): Promise<MediaRow[]> {
  const res = await query<MediaRow>(
    `SELECT storage_key, is_primary, display_order, alt_text, id::text AS source_media_id
       FROM public.product_media WHERE product_id = $1
      ORDER BY is_primary DESC, display_order, created_at`,
    [productId],
  );
  return res.rows;
}

export interface ChangeRow {
  id: string;
  proposed: Record<string, unknown>;
  media_changed: boolean;
  state: "in_review" | "sent_back";
  submitted_at: Date;
  version: string;
}

export async function readChange(productId: string, tx: Runner = null, lock = false): Promise<ChangeRow | null> {
  const res = await run<ChangeRow>(
    tx,
    `SELECT id, proposed, media_changed, state, submitted_at, updated_at::text AS version
       FROM public.product_change WHERE product_id = $1` + (lock ? " FOR UPDATE" : ""),
    [productId],
  );
  return res.rows[0] ?? null;
}

export async function readChangeMedia(changeId: string, tx: Runner = null): Promise<MediaRow[]> {
  const res = await run<MediaRow>(
    tx,
    `SELECT storage_key, is_primary, display_order, alt_text, source_media_id::text AS source_media_id
       FROM public.product_change_media WHERE change_id = $1
      ORDER BY is_primary DESC, display_order, created_at`,
    [changeId],
  );
  return res.rows;
}

/**
 * Names for a proposal's ids ("Bakery → Dairy"). Inside a decision pass the transaction: the pool's
 * one connection is held by it.
 */
export async function namesFor(typeIds: string[], categoryIds: string[], attributeIds: string[], tx: Runner = null) {
  const [types, categories, attributes] = await Promise.all([
    run<{ id: string; name: string; status: string }>(
      tx, `SELECT id::text, name, status FROM public.product_type WHERE id = ANY($1::uuid[])`, [typeIds]),
    run<{ id: string; name: string; status: string }>(
      tx, `SELECT id::text, name, status FROM public.category WHERE id = ANY($1::uuid[])`, [categoryIds]),
    run<{ id: string; name: string; key: string }>(
      tx, `SELECT id::text, name, key FROM public.attribute_definition WHERE id = ANY($1::uuid[])`, [attributeIds]),
  ]);
  return {
    types: new Map(types.rows.map((r) => [r.id, r])),
    categories: new Map(categories.rows.map((r) => [r.id, r])),
    attributes: new Map(attributes.rows.map((r) => [r.id, r])),
  };
}

export type ReviewAuditAction =
  | "product.approved"
  | "product.sent_back"
  | "product.change_approved"
  | "product.change_sent_back"
  | "product.margin_set";

/** Who decided is stored only here; a shop sees a reason with no staff identity. */
export async function audit(
  tx: pg.PoolClient,
  actorSub: string,
  action: ReviewAuditAction,
  productId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
     VALUES ($1, $2, 'product', $3, $4::jsonb)`,
    [actorSub, action, productId, JSON.stringify(detail)],
  );
}

/**
 * One intent per active staff member of the shop, in the decision's transaction and deduped on
 * (decision, staff). The payload is a routing id only.
 */
export async function notifyShop(
  tx: pg.PoolClient,
  type: "shop_product_approved" | "shop_product_sent_back",
  shopId: string,
  productId: string,
  decisionKey: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key, channel)
     SELECT ss.cognito_sub, 'shop', $1,
            jsonb_build_object('entityId', $3::text),
            $1 || ':' || ss.cognito_sub || ':' || $4,
            'push'
       FROM public.shop_staff ss
      WHERE ss.shop_id = $2 AND ss.status = 'active'
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [type, shopId, productId, decisionKey],
  );
}

/** One margin per product; variant prices follow via `priceVariants`. */
export interface MarginWrite {
  marginKind: "percent" | "amount" | null;
  marginValue: string | null;
}

/** Zero rows: it changed or was already decided. The caller then prices the variants. */
export async function approveNewProduct(
  tx: pg.PoolClient,
  productId: string,
  version: string,
  margin: MarginWrite,
): Promise<boolean> {
  const res = await tx.query(
    `UPDATE public.product
        SET approved_at = now(), status = 'active',
            review_state = 'none', review_reason = NULL, submitted_at = NULL,
            margin_kind = $3, margin_value = $4::numeric,
            updated_at = now()
      WHERE id = $1 AND approved_at IS NULL AND review_state = 'in_review'
        AND updated_at::text = $2`,
    [productId, version, margin.marginKind, margin.marginValue],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function sendBackNewProduct(
  tx: pg.PoolClient,
  productId: string,
  version: string,
  reason: string,
): Promise<boolean> {
  const res = await tx.query(
    `UPDATE public.product
        SET review_state = 'sent_back', review_reason = $3, submitted_at = NULL, updated_at = now()
      WHERE id = $1 AND approved_at IS NULL AND review_state = 'in_review'
        AND updated_at::text = $2`,
    [productId, version, reason],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function sendBackChange(
  tx: pg.PoolClient,
  productId: string,
  version: string,
  reason: string,
): Promise<boolean> {
  const res = await tx.query(
    `UPDATE public.product_change
        SET state = 'sent_back', reason = $3, updated_at = now()
      WHERE product_id = $1 AND state = 'in_review' AND updated_at::text = $2`,
    [productId, version, reason],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface AppliedValues {
  name: string;
  brand: string | null;
  shortDescription: string;
  longDescription: string | null;
  productTypeId: string;
  primaryCategoryId: string;
  unitBasis: string | null;
}

export interface AttributeWrite {
  attributeId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueOptions: string[] | null;
}

/**
 * Inside the decision transaction with the change row locked and the version checked. The caller
 * applies the variant set afterwards (a variant may name one of these images), then prices it.
 */
export async function applyChange(
  tx: pg.PoolClient,
  productId: string,
  changeId: string,
  values: AppliedValues,
  margin: MarginWrite,
  attributes: AttributeWrite[],
  mediaChanged: boolean,
): Promise<void> {
  await tx.query(
    `UPDATE public.product
        SET name = $2, brand = $3, short_description = $4, long_description = $5,
            product_type_id = $6, primary_category_id = $7, unit_basis = $8,
            margin_kind = $9, margin_value = $10::numeric,
            updated_at = now()
      WHERE id = $1`,
    [
      productId, values.name, values.brand, values.shortDescription, values.longDescription,
      values.productTypeId, values.primaryCategoryId, values.unitBasis,
      margin.marginKind, margin.marginValue,
    ],
  );

  for (const a of attributes) {
    await tx.query(
      `INSERT INTO public.product_attribute_value
           (product_id, attribute_definition_id, value_text, value_number, value_boolean, value_options)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, attribute_definition_id)
         DO UPDATE SET value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
                       value_boolean = EXCLUDED.value_boolean, value_options = EXCLUDED.value_options,
                       updated_at = now()`,
      [productId, a.attributeId, a.valueText, a.valueNumber, a.valueBoolean, a.valueOptions],
    );
  }

  if (mediaChanged) {
    // The only place a proposed image becomes live: the whole set is replaced here.
    await tx.query(`DELETE FROM public.product_media WHERE product_id = $1`, [productId]);
    await tx.query(
      `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order, alt_text)
       SELECT $1, storage_key, is_primary, display_order, alt_text
         FROM public.product_change_media WHERE change_id = $2`,
      [productId, changeId],
    );
  }

  await tx.query(`DELETE FROM public.product_change WHERE id = $1`, [changeId]);
}

/** Zero rows: the margin was not what the reviewer saw. The caller then reprices the variants. */
export async function setMargin(
  tx: pg.PoolClient,
  productId: string,
  expected: { kind: string | null; value: string | null },
  margin: MarginWrite,
): Promise<boolean> {
  const res = await tx.query(
    `UPDATE public.product
        SET margin_kind = $4, margin_value = $5::numeric, updated_at = now()
      WHERE id = $1 AND approved_at IS NOT NULL
        AND margin_kind IS NOT DISTINCT FROM $2
        AND margin_value IS NOT DISTINCT FROM $3::numeric`,
    [productId, expected.kind, expected.value, margin.marginKind, margin.marginValue],
  );
  return (res.rowCount ?? 0) > 0;
}

export { withTransaction };
