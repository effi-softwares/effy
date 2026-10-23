// Promotions on the storefront (094): display groups by key and one promotion in full. No SQL here — everything is read through the ONE promotion reader
// (`@effy/edge-shared/promotions`), so what a shopper is shown and what the cart applies cannot disagree.
import { pooled, type Queryable } from "@effy/edge-shared";
import { endsInOf, groupPromotions, hiddenBecause, loadPromotions, termsOf } from "@effy/edge-shared/promotions";
import { type PromotionDTO, type PromotionGroupDTO } from "@effy/shared-types";

export function createPromotionService(db: Queryable = pooled) {
  return {
    /** Display groups for a signed-out shopper: everyone-audience promotions only, in group order. */
    groups(keys: readonly string[], now = new Date()): Promise<PromotionGroupDTO[]> {
      return groupPromotions(db, keys, { customerId: null, now });
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
