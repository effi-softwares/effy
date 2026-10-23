import type { SearchPhraseDTO, SuggestionsDTO } from "@effy/shared-types";

import { toCards, type ImageAddress } from "../lib/cards";
import type { SuggestRepository } from "./repository";

export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_MAX_CHARS = 64;
const MAX_PHRASES = 5;
const MAX_PRODUCTS = 4;

const EMPTY: SuggestionsDTO = { phrases: [], products: [] };

export function createSuggestService(repo: SuggestRepository, imageAddress?: ImageAddress) {
  return {
    /** `q` is trimmed and within the limit. Phrases: the completion, it inside its main aisle, then a matching aisle. */
    async suggest(q: string): Promise<SuggestionsDTO> {
      if (q.length < SUGGEST_MIN_CHARS) return EMPTY;

      const [products, completions, holding, named] = await Promise.all([
        repo.products(q, MAX_PRODUCTS),
        repo.completions(q, 3),
        repo.aislesHolding(q, 1),
        repo.aislesNamed(q, 2),
      ]);

      const phrases: SearchPhraseDTO[] = [
        ...completions.map((c) => ({ text: c.phrase })),
        ...holding.map((a) => ({ text: q, categorySlug: a.key, categoryName: a.name })),
        // `text` is the aisle's name: the client opens the aisle.
        ...named.map((a) => ({ text: a.name, categorySlug: a.key, categoryName: a.name })),
      ];

      return {
        phrases: phrases.slice(0, MAX_PHRASES),
        products: await toCards(products, imageAddress),
      };
    },
  };
}
