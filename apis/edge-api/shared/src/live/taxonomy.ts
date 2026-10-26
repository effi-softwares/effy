import { query } from "../lib/db";
import { logger } from "../lib/logger";

import { announce, type LiveChange } from "./announce";

/**
 * The category tree, the attribute library or an attachment changed (101): back-office re-reads its taxonomy
 * screens and every active shop its category picker and open product forms. Read and sent after the commit;
 * never throws.
 */
export async function announceTaxonomy(): Promise<void> {
  const changes: LiveChange[] = [{ scope: "ops", kind: "taxonomy" }];
  try {
    const { rows } = await query<{ id: string }>(`SELECT id::text FROM public.shop WHERE status = 'active'`);
    for (const r of rows) changes.push({ scope: "shop", shopId: r.id, kind: "taxonomy" });
  } catch (err) {
    // Shops catch up on their next read; back-office still hears it.
    logger.warn({ err }, "live: could not read the active shops for a taxonomy change");
  }
  await announce(changes);
}
