// Home composition: rails, their order, and the advertised promotions. No HTTP, no SQL.
import type { StorefrontHomeDTO, StorefrontRailDTO } from "@effy/shared-types";

import { toCards, type CardRow, type Presign } from "../lib/cards";
import type { PromotionService } from "../promotions/service";
import type { HomeRepository } from "./repository";

export const RAIL_PRODUCT_LIMIT = 12;
export const CATEGORY_RAIL_MAX = 4;

export function createHomeService(repo: HomeRepository, promotions: Pick<PromotionService, "banners">, presign?: Presign) {
  /**
   * ⚠ 025 FR-023: a RAIL never offers a product that cannot be bought. The rail queries already
   * filter on the shared rule, so this drops nothing in production — it is here because the rule
   * is worth stating once at the seam that assembles merchandising, and because a future rail
   * added with the wrong query would otherwise put an unbuyable product in front of every shopper.
   */
  const rail = async (key: string, title: string, rows: readonly CardRow[]): Promise<StorefrontRailDTO | null> => {
    const products = (await toCards(rows, presign)).filter((c) => c.available);
    return products.length > 0 ? { key, title, products } : null;
  };

  return {
    /**
     * A Featured rail (newest), an On-sale rail, and up to CATEGORY_RAIL_MAX category rails that
     * actually have products, plus the advertised promotions.
     *
     * Two waves is the true dependency depth: everything that can be asked at once is, and the
     * category rails form a second wave only because the first is what names them.
     *
     * ⚠ Ordering is NOT left to arrival order. Results land in fixed slots and the rails are
     * assembled in sequence, because the server owns section order: a Home whose sections shuffled
     * between loads would read as a bug even though nothing was wrong.
     */
    async home(): Promise<StorefrontHomeDTO> {
      const [featured, onSale, candidates, banners] = await Promise.all([
        repo.newestCards(RAIL_PRODUCT_LIMIT),
        repo.onSaleCards(RAIL_PRODUCT_LIMIT),
        repo.railCandidates(CATEGORY_RAIL_MAX),
        promotions.banners(),
      ]);

      const categoryRows = await Promise.all(candidates.map((c) => repo.categoryCards(c.key, RAIL_PRODUCT_LIMIT)));

      const rails = await Promise.all([
        rail("featured", "Featured", featured),
        rail("on_sale", "On sale", onSale),
        ...candidates.map((c, i) => rail(`category:${c.key}`, c.name, categoryRows[i] ?? [])),
      ]);

      // Empty rails are omitted — Home must never render a blank section. `banners` is an empty
      // list, never absent, when nothing is advertised.
      return { banners, rails: rails.filter((r): r is StorefrontRailDTO => r !== null) };
    },
  };
}

export type HomeService = ReturnType<typeof createHomeService>;
