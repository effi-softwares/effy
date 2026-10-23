import type { StorefrontHomeDTO, StorefrontRailDTO } from "@effy/shared-types";

import { toCards, type CardRow, type ImageAddress } from "../lib/cards";
import type { HomeRepository, RailRow } from "./repository";

export const RAIL_PRODUCT_LIMIT = 12;
export const CATEGORY_RAIL_MAX = 4;

const TITLES: Record<string, string> = { featured: "Featured", on_sale: "On sale" };

export function createHomeService(repo: HomeRepository, imageAddress?: ImageAddress) {
  /** The queries already filter on the shared rule; this catches a future rail with the wrong query. */
  const rail = async (key: string, title: string, rows: readonly CardRow[]): Promise<StorefrontRailDTO | null> => {
    const products = (await toCards(rows, imageAddress)).filter((c) => c.available);
    return products.length > 0 ? { key, title, products } : null;
  };

  return {
    /** Featured, On sale, then up to CATEGORY_RAIL_MAX category rails, in the server's fixed order. */
    async home(): Promise<StorefrontHomeDTO> {
      const rows = await repo.rails(RAIL_PRODUCT_LIMIT, CATEGORY_RAIL_MAX);

      const byRail = new Map<string, { title: string; rows: RailRow[] }>();
      for (const row of rows) {
        const entry = byRail.get(row.rail) ?? { title: TITLES[row.rail] ?? row.rail_title ?? row.rail, rows: [] };
        entry.rows.push(row);
        byRail.set(row.rail, entry);
      }
      const rails = await Promise.all([...byRail].map(([key, { title, rows }]) => rail(key, title, rows)));

      return { rails: rails.filter((r): r is StorefrontRailDTO => r !== null) };
    },
  };
}

export type HomeService = ReturnType<typeof createHomeService>;
