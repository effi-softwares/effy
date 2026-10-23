// Home composition: rails and their order. No HTTP, no SQL.
import type { StorefrontHomeDTO, StorefrontRailDTO } from "@effy/shared-types";

import { toCards, type CardRow, type ImageAddress } from "../lib/cards";
import type { HomeRepository, RailRow } from "./repository";

export const RAIL_PRODUCT_LIMIT = 12;
export const CATEGORY_RAIL_MAX = 4;

/** The two rails whose titles are the storefront's words; a category rail is titled by its name. */
const TITLES: Record<string, string> = { featured: "Featured", on_sale: "On sale" };

export function createHomeService(repo: HomeRepository, imageAddress?: ImageAddress) {
  /**
   * ⚠ 025 FR-023: a RAIL never offers a product that cannot be bought. The rail queries already
   * filter on the shared rule, so this drops nothing in production — it is here because the rule
   * is worth stating once at the seam that assembles merchandising, and because a future rail
   * added with the wrong query would otherwise put an unbuyable product in front of every shopper.
   */
  const rail = async (key: string, title: string, rows: readonly CardRow[]): Promise<StorefrontRailDTO | null> => {
    const products = (await toCards(rows, imageAddress)).filter((c) => c.available);
    return products.length > 0 ? { key, title, products } : null;
  };

  return {
    /**
     * A Featured rail (newest), an On-sale rail, and up to CATEGORY_RAIL_MAX category rails that
     * actually have products. Promotions are read separately, as display groups.
     *
     * ⚠ Ordering is NOT left to arrival order. The rails come back in the order the statement fixes
     * — Featured, On sale, then the categories as ranked — because the server owns section order: a
     * Home whose sections shuffled between loads would read as a bug even though nothing was wrong.
     */
    async home(): Promise<StorefrontHomeDTO> {
      const rows = await repo.rails(RAIL_PRODUCT_LIMIT, CATEGORY_RAIL_MAX);

      const byRail = new Map<string, { title: string; rows: RailRow[] }>();
      for (const row of rows) {
        const entry = byRail.get(row.rail) ?? { title: TITLES[row.rail] ?? row.rail_title ?? row.rail, rows: [] };
        entry.rows.push(row);
        byRail.set(row.rail, entry);
      }
      const rails = await Promise.all([...byRail].map(([key, { title, rows }]) => rail(key, title, rows)));

      // Empty rails are omitted — Home must never render a blank section.
      return { rails: rails.filter((r): r is StorefrontRailDTO => r !== null) };
    },
  };
}

export type HomeService = ReturnType<typeof createHomeService>;
