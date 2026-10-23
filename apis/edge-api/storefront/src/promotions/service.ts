// Read through the one promotion reader, so what a shopper is shown and what the cart applies agree.
import { pooled, type Queryable } from "@effy/edge-shared";
import { endsInOf, groupPromotions, hiddenBecause, loadPromotions, termsOf } from "@effy/edge-shared/promotions";
import { type PromotionDTO, type PromotionGroupDTO } from "@effy/shared-types";

export function createPromotionService(db: Queryable = pooled) {
  return {
    /** Everyone-audience promotions only, in group order. */
    groups(keys: readonly string[], now = new Date()): Promise<PromotionGroupDTO[]> {
      return groupPromotions(db, keys, { customerId: null, now });
    },

    /** null → 404: a personal or ended promotion is not public. */
    async promotion(id: string, now = new Date()): Promise<PromotionDTO | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [rec] = await loadPromotions(db, { ids: [id] }, now);
      if (!rec || hiddenBecause(rec, null, false) !== null) return null;
      return {
        id: rec.id,
        title: rec.headline ?? rec.name,
        subtitle: rec.supportingLine,
        imageUrl: null,
        // Non-null on the wire; an automatic promotion has no code.
        code: rec.trigger === "code" ? (rec.sharedCode ?? "") : "",
        terms: termsOf(rec.words),
        validity: endsInOf(rec.endsAt, now),
      };
    },
  };
}

export type PromotionService = ReturnType<typeof createPromotionService>;
