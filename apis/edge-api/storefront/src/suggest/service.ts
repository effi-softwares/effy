// Search suggestions (084): a handful of things to search for and a few products, for a few typed
// characters. No HTTP, no SQL.
import type { SearchPhraseDTO, SuggestionsDTO } from "@effy/shared-types";

import { toCards, type Presign } from "../lib/cards";
import type { SuggestRepository } from "./repository";

export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_MAX_CHARS = 64;
const MAX_PHRASES = 5;
const MAX_PRODUCTS = 4;

const EMPTY: SuggestionsDTO = { phrases: [], products: [] };

export function createSuggestService(repo: SuggestRepository, presign?: Presign) {
  return {
    /**
     * `q` is already trimmed and within the length limit (the handler refuses longer).
     *
     * The phrases, in the order a shopper reads them: the text completed from the catalogue, the
     * same text inside the aisle that holds most of it, then an aisle whose own name matches.
     */
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
        // "oat milk in Dairy & eggs" — the typed text, searched inside one aisle.
        ...holding.map((a) => ({ text: q, categorySlug: a.key, categoryName: a.name })),
        // An aisle by name. `text` IS its name: the client opens the aisle rather than searching.
        ...named.map((a) => ({ text: a.name, categorySlug: a.key, categoryName: a.name })),
      ];

      return {
        phrases: phrases.slice(0, MAX_PHRASES),
        products: await toCards(products, presign),
      };
    },
  };
}
