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
import { availabilityPredicate, presignRead } from "@effy/edge-shared";
import type { ProductBadge, StorefrontProductCardDTO } from "@effy/shared-types";

export const CARD_COLUMNS = `p.id::text                 AS id,
       p.name                     AS name,
       p.brand                    AS brand,
       p.price_amount::text       AS price_amount,
       p.currency                 AS currency,
       p.compare_at_amount::text  AS compare_at_amount,
       m.storage_key              AS storage_key,
       m.alt_text                 AS alt_text,
       p.created_at               AS created_at,
       -- ⚠ The keyset position for the "newest" sort, as TEXT at full microsecond precision. The
       -- driver hands created_at back as a millisecond Date; a cursor built from that would sit
       -- BELOW the row it was taken from, and every product sharing its millisecond but an earlier
       -- microsecond would be silently skipped at the page boundary.
       to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_key,
       -- ⚠ 054: availability is PROJECTED here, never used to filter this read.
       (${availabilityPredicate("p")}) AS available`;

export const CARD_FROM = `
FROM public.product p
LEFT JOIN LATERAL (
    SELECT storage_key, alt_text
    FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true
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
  created_at: Date;
  created_at_key: string;
  available: boolean;
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

/** A presigned image URL, or null. A missing or unsignable image never blanks a read. */
export async function imageUrl(storageKey: string | null | undefined): Promise<string | null> {
  if (!storageKey) return null;
  try {
    return await presignRead(storageKey);
  } catch {
    return null;
  }
}

export type Presign = (storageKey: string | null | undefined) => Promise<string | null>;

/** Rows → wire cards, images presigned (signing is local — no network call). */
export async function toCards(rows: readonly CardRow[], presign: Presign = imageUrl): Promise<StorefrontProductCardDTO[]> {
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      imageUrl: await presign(row.storage_key),
      priceAmount: row.price_amount,
      currency: row.currency,
      compareAtAmount: row.compare_at_amount,
      badges: deriveBadges(row),
      available: row.available,
    })),
  );
}
