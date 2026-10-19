// Promotions on the storefront (094): display groups by key, one promotion in full, and the deprecated
// `home.banners` for installed apps. No SQL here — everything is read through the ONE promotion reader
// (`@effy/edge-shared/promotions`), so what a shopper is shown and what the cart applies cannot disagree.
import { pooled, type Queryable } from "@effy/edge-shared";
import { endsInOf, groupPromotions, hiddenBecause, loadPromotions, termsOf } from "@effy/edge-shared/promotions";
import { PROMOTION_GROUP_KEYS, type BannerDTO, type PromotionDTO, type PromotionGroupDTO, type ShopperPromotionDTO } from "@effy/shared-types";

/** A group's promotion as a 028 banner, for installed apps that still read `home.banners`. */
export function toBanner(p: ShopperPromotionDTO, placement: "carousel" | "inline", position: number): BannerDTO {
  return {
    key: p.id,
    title: p.headline,
    subtitle: p.supportingLine,
    // ⚠ No artwork: banners are drawn by the clients (094 removed the artwork editor).
    imageUrl: null,
    href: `/promotions/${p.id}`,
    code: p.code,
    terms: p.terms,
    position,
    target: p.target,
    placement,
  };
}

export function createPromotionService(db: Queryable = pooled) {
  return {
    /** Display groups for a signed-out shopper: everyone-audience promotions only, in group order. */
    groups(keys: readonly string[], now = new Date()): Promise<PromotionGroupDTO[]> {
      return groupPromotions(db, keys, { customerId: null, now });
    },

    /**
     * @deprecated — compatibility (094). The Home banners installed apps read: the hero group as the
     * carousel, the between-sections group as inline banners.
     */
    async banners(now = new Date()): Promise<BannerDTO[]> {
      const [hero, between] = await groupPromotions(db, [PROMOTION_GROUP_KEYS.homeHero, PROMOTION_GROUP_KEYS.homeBetween], { customerId: null, now });
      return [
        ...hero!.promotions.map((p, i) => toBanner(p, "carousel", i)),
        ...between!.promotions.map((p, i) => toBanner(p, "inline", i)),
      ];
    },

    /** One promotion open to everyone and live now; null → 404 (a personal or ended one is not public). */
    async promotion(id: string, now = new Date()): Promise<PromotionDTO | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [rec] = await loadPromotions(db, { ids: [id] }, now);
      if (!rec || hiddenBecause(rec, null, false) !== null) return null;
      return {
        id: rec.id,
        title: rec.headline ?? rec.name,
        subtitle: rec.supportingLine,
        imageUrl: null,
        // ⚠ The 028 field is non-null; an automatic promotion has no code to hand over, so it is empty.
        code: rec.trigger === "code" ? (rec.sharedCode ?? "") : "",
        terms: termsOf(rec.words),
        validity: endsInOf(rec.endsAt, now),
      };
    },
  };
}

export type PromotionService = ReturnType<typeof createPromotionService>;
