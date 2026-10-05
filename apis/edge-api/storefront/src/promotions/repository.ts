// Advertised promotions: the Home banner read and the single-promotion read behind a banner tap.
import { pooled, type Queryable } from "@effy/edge-shared";

/** One promotion cleared for public display (028). */
export interface AdvertisedPromoRow {
  id: string;
  code: string;
  banner_title: string;
  banner_subtitle: string | null;
  banner_image_key: string | null;
  banner_position: number;
  minimum_subtotal_amount: string;
  currency: string;
  banner_placement: string;
  ends_at: Date | null;
}

/**
 * The select and the predicate are shared by both reads because the predicate IS the visibility
 * rule — two copies would eventually disagree about whether a promotion is live, and a shopper
 * would meet a detail screen for a promotion Home had already stopped showing.
 */
const ADVERTISED_PROMO_SELECT = `
SELECT p.id::text AS id,
       p.code,
       p.banner_title,
       p.banner_subtitle,
       p.banner_image_key,
       p.banner_position,
       p.minimum_subtotal_amount::text AS minimum_subtotal_amount,
       p.currency,
       p.banner_placement,
       p.ends_at
FROM public.promo_code p`;

// availability-exempt: public.promo_code — a promotion's own lifecycle, nothing to do with stock.
//
// ⚠ Exhaustion is COUNTED from promo_redemption, never read from a stored counter (027's rule): a
// counter and the rows can disagree, and then nobody knows which is true. It is also what makes
// "an exhausted promotion stops being advertised" automatic.
const ADVERTISED_PROMO_PREDICATE = `p.is_advertised
  AND p.status = 'active'
  AND (p.starts_at IS NULL OR p.starts_at <= now())
  AND (p.ends_at   IS NULL OR p.ends_at   >  now())
  AND (p.max_redemptions IS NULL
       OR (SELECT count(*) FROM public.promo_redemption r WHERE r.promo_code_id = p.id) < p.max_redemptions)`;

export interface PromotionRepository {
  advertised(): Promise<AdvertisedPromoRow[]>;
  advertisedById(id: string): Promise<AdvertisedPromoRow | null>;
}

export function createPromotionRepository(db: Queryable = pooled): PromotionRepository {
  return {
    /** The promotions cleared to appear as banners on Home (028 FR-036/037c). */
    async advertised() {
      return (
        await db.query<AdvertisedPromoRow>(`${ADVERTISED_PROMO_SELECT}
WHERE ${ADVERTISED_PROMO_PREDICATE}
ORDER BY p.banner_placement, p.banner_position, p.created_at`)
      ).rows;
    },

    /**
     * ONE promotion cleared for public display — what a banner tap opens.
     *
     * ⚠ It re-applies the predicate rather than reading the row by id alone. A shopper's Home
     * payload is a snapshot: between composing it and tapping, the promotion can expire, be
     * exhausted, be disabled or be un-advertised. A promotion that is not advertised is NOT FOUND,
     * never "forbidden": a distinguishable refusal would let anyone enumerate unadvertised codes.
     *
     * ⚠ `p.id::text = $1`, NOT `p.id = $1`: a malformed id sent at a uuid column raises, which
     * would report the platform as broken when the truth is that no such promotion exists.
     */
    async advertisedById(id) {
      return (
        (
          await db.query<AdvertisedPromoRow>(
            `${ADVERTISED_PROMO_SELECT}
WHERE p.id::text = $1
  AND ${ADVERTISED_PROMO_PREDICATE}`,
            [id],
          )
        ).rows[0] ?? null
      );
    },
  };
}
