// Promotion wording and the banner / detail projections. No HTTP, no SQL.
import { CURRENCY, formatCents, parseCents } from "@effy/edge-shared";
import type { BannerDTO, PromotionDTO } from "@effy/shared-types";

import { imageUrl, type Presign } from "../lib/cards";
import type { AdvertisedPromoRow, PromotionRepository } from "./repository";

/**
 * The shopper-facing condition sentence, or null when the promotion has no minimum.
 *
 * ⚠ Composed HERE, once, so web and mobile cannot phrase one promotion two ways — and so the banner
 * and the detail screen carry the same sentence. Integer cents, never a float: this is a money
 * amount printed to a shopper.
 */
export function promoTerms(minimumSubtotal: string, currency: string): string | null {
  let cents: number;
  try {
    cents = parseCents(minimumSubtotal);
  } catch {
    return null;
  }
  if (cents <= 0) return null;
  const amount = formatCents(cents);
  return currency === CURRENCY ? `On orders over $${amount}` : `On orders over ${amount} ${currency}`;
}

const plural = (n: number, unit: string): string => (n === 1 ? `1 ${unit}` : `${n} ${unit}s`);

const HOUR = 3600_000;

/**
 * How long a promotion has left, as a shopper would say it. Null when it has no end date.
 * Server-composed, like `promoTerms`, so both clients agree.
 */
export function promoValidity(endsAt: Date | null, now: Date): string | null {
  if (!endsAt) return null;
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0) return "Ended";
  if (left < HOUR) return "Ends within the hour";
  if (left < 24 * HOUR) return `Ends in ${plural(Math.floor(left / HOUR), "hour")}`;
  if (left < 48 * HOUR) return "Ends tomorrow";
  return `Ends in ${plural(Math.floor(left / (24 * HOUR)), "day")}`;
}

/**
 * An advertised promotion as a Home banner (028).
 *
 * The banner carries what the DATA knows — the code and the minimum spend. Fine print the model
 * does not hold ("per customer", "selected items") is baked into the artwork by design.
 *
 * ⚠ Every banner targets its OWN promotion. A promotion is a whole-cart discount with no product
 * or category scoping, so there is no set of qualifying products to filter to: the right
 * destination for a message is the message itself, with the store one tap further on.
 */
export async function toBanner(p: AdvertisedPromoRow, presign: Presign = imageUrl): Promise<BannerDTO> {
  return {
    key: p.id,
    title: p.banner_title,
    subtitle: p.banner_subtitle,
    imageUrl: await presign(p.banner_image_key),
    // Web's entry point for the same destination; mobile reads `target`, never this.
    href: `/promotions/${p.id}`,
    code: p.code,
    terms: promoTerms(p.minimum_subtotal_amount, p.currency),
    position: p.banner_position, // an integer on the wire (the mobile contract test pins it)
    target: { kind: "promotion", promotionId: p.id },
    placement: p.banner_placement as BannerDTO["placement"],
  };
}

export function createPromotionService(repo: PromotionRepository, presign: Presign = imageUrl) {
  return {
    async banners(): Promise<BannerDTO[]> {
      return Promise.all((await repo.advertised()).map((p) => toBanner(p, presign)));
    },

    /** One advertised promotion in full; null → the handler answers 404. */
    async promotion(id: string, now = new Date()): Promise<PromotionDTO | null> {
      const row = await repo.advertisedById(id);
      if (!row) return null;
      return {
        id: row.id,
        title: row.banner_title,
        subtitle: row.banner_subtitle,
        imageUrl: await presign(row.banner_image_key),
        code: row.code,
        terms: promoTerms(row.minimum_subtotal_amount, row.currency),
        validity: promoValidity(row.ends_at, now),
      };
    },
  };
}

export type PromotionService = ReturnType<typeof createPromotionService>;
