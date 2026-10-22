/**
 * The shared product-card projection and its mapping to the wire.
 *
 * The LATERAL join picks one image: primary first, then lowest display_order. Money is cast to
 * text so it crosses the wire exactly.
 *
 * ⚠ A LISTING filter is `status` only, deliberately. A listing filter is not a purchasability
 * decision: 054 FR-013/A10 keep an out-of-stock product listed and mark it unavailable through the
 * `available` column projected here. Cart and checkout use the same rule to REFUSE, which is the
 * decision that moves money. Same rule, two jobs.
 */
import { imageWidthsField, productAvailableSql, publicImageUrl, renditionWidthsSql } from "@effy/edge-shared";
import { PRODUCT_OFFER_SQL, productOffer, type ProductOfferRow } from "@effy/edge-shared/promotions";
import { unitPrice, type PackUnit, type ProductBadge, type StorefrontProductCardDTO, type UnitBasis } from "@effy/shared-types";

export const CARD_COLUMNS = `p.id::text                 AS id,
       p.name                     AS name,
       p.brand                    AS brand,
       -- 098 — the LISTING price: the cheapest active variant's (refreshListing keeps it).
       p.list_price_amount::text  AS price_amount,
       p.currency                 AS currency,
       p.list_compare_at_amount::text AS compare_at_amount,
       p.price_varies             AS price_varies,
       p.unit_basis               AS unit_basis,
       dv.id::text                AS variant_id,
       dv.pack_quantity::text     AS pack_quantity,
       dv.pack_unit               AS pack_unit,
       dv.variant_count           AS variant_count,
       m.storage_key              AS storage_key,
       m.alt_text                 AS alt_text,
       m.image_widths             AS image_widths,
       p.created_at               AS created_at,
       -- ⚠ The keyset position for the "newest" sort, as TEXT at full microsecond precision. The
       -- driver hands created_at back as a millisecond Date; a cursor built from that would sit
       -- BELOW the row it was taken from, and every product sharing its millisecond but an earlier
       -- microsecond would be silently skipped at the page boundary.
       to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_key,
       -- ⚠ 054: availability is PROJECTED here, never used to filter this read. 098: some variant.
       (${productAvailableSql("p")}) AS available,
       -- 094 — an item or buy-X-get-Y offer open to everyone that covers this product (R11).
       ${PRODUCT_OFFER_SQL("p", "now()")} AS offer`;

export const CARD_FROM = `
FROM public.product p
LEFT JOIN LATERAL (
    SELECT pm.storage_key, pm.alt_text, ${renditionWidthsSql("pm.storage_key")} AS image_widths
    FROM public.product_media pm
    WHERE pm.product_id = p.id
    ORDER BY pm.is_primary DESC, pm.display_order ASC, pm.created_at ASC
    LIMIT 1
) m ON true
-- 098 — the variant the tile stands for: the one whose price it shows (the cheapest active one), with
-- the count that decides between quick-add and "Choose".
LEFT JOIN LATERAL (
    SELECT v.id, v.pack_quantity, v.pack_unit,
           (SELECT count(*)::int FROM public.product_variant c
             -- availability-exempt: product_variant — counting what a tile offers, not deciding a sale.
             WHERE c.product_id = p.id AND c.state = 'active') AS variant_count
    FROM public.product_variant v
    -- availability-exempt: product_variant — a VISIBILITY filter (inactive variants are never shown).
    WHERE v.product_id = p.id AND v.state = 'active'
    ORDER BY v.price_amount ASC NULLS LAST, v.position ASC
    LIMIT 1
) dv ON true
`;

/** The full projection used by every non-search read. */
export const CARD_SELECT = `\nSELECT ${CARD_COLUMNS}${CARD_FROM}`;

/** The wire shape of CARD_SELECT. It never leaves the repositories and this file. */
export interface CardRow {
  id: string;
  name: string;
  brand: string | null;
  price_amount: string;
  currency: string;
  compare_at_amount: string | null;
  storage_key: string | null;
  alt_text: string | null;
  /** The picture's smaller copies (086); NULL when none are ready. */
  image_widths: number[] | null;
  created_at: Date;
  created_at_key: string;
  available: boolean;
  /** 094 — the offer covering it, or null. */
  offer?: ProductOfferRow | null;
  price_varies: boolean;
  unit_basis: UnitBasis | null;
  /** The shown variant; null only for a product with no active variant (never listed in practice). */
  variant_id: string | null;
  pack_quantity: string | null;
  pack_unit: PackUnit | null;
  variant_count: number | null;
  /** 098 — set by a search that matched a variant's stock code or barcode; the tile opens on it. */
  matched_variant_id?: string | null;
}

const NEW_WITHIN_MS = 14 * 24 * 3600_000;

/**
 * Badges derivable from the product row alone (no sales/ratings data). "on_sale" when a compare-at
 * price is present; "new" when created within 14 days.
 */
export function deriveBadges(row: Pick<CardRow, "compare_at_amount" | "created_at">, now = Date.now()): ProductBadge[] {
  const badges: ProductBadge[] = [];
  if (row.compare_at_amount !== null) badges.push("on_sale");
  if (now - row.created_at.getTime() <= NEW_WITHIN_MS) badges.push("new");
  return badges;
}

/**
 * A picture's permanent public address (086), or null. Built, not signed: the same on every request,
 * so the browser keeps it. A key outside the public set has no address — never a failed read.
 */
export async function imageUrl(storageKey: string | null | undefined): Promise<string | null> {
  return publicImageUrl(storageKey);
}

export type ImageAddress = (storageKey: string | null | undefined) => Promise<string | null>;

/** Rows → wire cards, with each picture's public address and its ready copies. */
export async function toCards(rows: readonly CardRow[], imageAddress: ImageAddress = imageUrl): Promise<StorefrontProductCardDTO[]> {
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      imageUrl: await imageAddress(row.storage_key),
      ...imageWidthsField(row.image_widths),
      priceAmount: row.price_amount,
      currency: row.currency,
      compareAtAmount: row.compare_at_amount,
      badges: deriveBadges(row),
      available: row.available,
      ...(row.offer ? { offer: productOffer(row.offer) } : {}),
      priceVaries: row.price_varies,
      variantId: row.matched_variant_id ?? row.variant_id ?? "",
      variantCount: row.variant_count ?? 0,
      unitPrice: unitPrice(row.price_amount, row.pack_quantity, row.pack_unit, row.unit_basis),
    })),
  );
}
