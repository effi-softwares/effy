/**
 * The shared product-card projection. The lateral join picks the primary image, else the lowest
 * display_order. A listing filters on `status` only: out-of-stock products stay listed with
 * `available` false.
 */
import { imageWidthsField, productAvailableSql, publicImageUrl, renditionWidthsSql } from "@effy/edge-shared";
import { PRODUCT_OFFER_SQL, productOffer, type ProductOfferRow } from "@effy/edge-shared/promotions";
import { unitPrice, type PackUnit, type ProductBadge, type StorefrontProductCardDTO, type UnitBasis } from "@effy/shared-types";

export const CARD_COLUMNS = `p.id::text                 AS id,
       p.name                     AS name,
       p.brand                    AS brand,
       -- The LISTING price: the cheapest active variant's (refreshListing keeps it).
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
       p.age_restricted           AS age_restricted,
       -- ⚠ availability (of any variant) is PROJECTED here, never used to filter this read.
       (${productAvailableSql("p")}) AS available,
       -- An item or buy-X-get-Y offer open to everyone that covers this product.
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
-- The variant the tile stands for: the one whose price it shows (the cheapest active one), with
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

export const CARD_SELECT = `\nSELECT ${CARD_COLUMNS}${CARD_FROM}`;

/** It never leaves the repositories and this file. */
export interface CardRow {
  id: string;
  name: string;
  brand: string | null;
  price_amount: string;
  currency: string;
  compare_at_amount: string | null;
  storage_key: string | null;
  alt_text: string | null;
  image_widths: number[] | null;
  created_at: Date;
  created_at_key: string;
  available: boolean;
  age_restricted: boolean;
  /** The offer covering it, or null. */
  offer?: ProductOfferRow | null;
  price_varies: boolean;
  unit_basis: UnitBasis | null;
  /** Null only for a product with no active variant. */
  variant_id: string | null;
  pack_quantity: string | null;
  pack_unit: PackUnit | null;
  variant_count: number | null;
  /** Set when a search matched a variant's stock code or barcode; the tile opens on it. */
  matched_variant_id?: string | null;
}

const NEW_WITHIN_MS = 14 * 24 * 3600_000;

/** "on_sale" when a compare-at price exists; "new" within 14 days. */
export function deriveBadges(row: Pick<CardRow, "compare_at_amount" | "created_at">, now = Date.now()): ProductBadge[] {
  const badges: ProductBadge[] = [];
  if (row.compare_at_amount !== null) badges.push("on_sale");
  if (now - row.created_at.getTime() <= NEW_WITHIN_MS) badges.push("new");
  return badges;
}

/** Built, not signed, so the browser keeps it. A key outside the public set has no address. */
export async function imageUrl(storageKey: string | null | undefined): Promise<string | null> {
  return publicImageUrl(storageKey);
}

export type ImageAddress = (storageKey: string | null | undefined) => Promise<string | null>;

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
      ageRestricted: row.age_restricted,
      ...(row.offer ? { offer: productOffer(row.offer) } : {}),
      priceVaries: row.price_varies,
      variantId: row.matched_variant_id ?? row.variant_id ?? "",
      variantCount: row.variant_count ?? 0,
      unitPrice: unitPrice(row.price_amount, row.pack_quantity, row.pack_unit, row.unit_basis),
    })),
  );
}
