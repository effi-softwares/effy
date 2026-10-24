import { query } from "../lib/db";
import { logger } from "../lib/logger";

import { announce, type LiveChange } from "./announce";

/**
 * The dispatch console changed, and these drivers' work with it. A reassignment names both drivers.
 * Pass the drivers read before the change: one it was taken from no longer holds it. Nulls and
 * repeats are dropped. After the commit; never throws.
 */
export async function announceDispatch(driverIds: ReadonlyArray<string | null | undefined> = []): Promise<void> {
  const changes: LiveChange[] = [{ scope: "ops", kind: "dispatch" }];
  for (const driverId of new Set(driverIds)) {
    if (driverId) changes.push({ scope: "driver", driverId, kind: "work" });
  }
  await announce(changes);
}

/** Slot load or the delivery calendar changed. */
export const announceSlots = (): Promise<void> => announce([{ scope: "ops", kind: "slots" }]);

/**
 * The shops on these drivers' open collection rounds — their "Next collection" changed: a driver was
 * given or relieved of the run, or went on or off duty (099). Told `orders`, which re-reads Today and
 * the order screens. Read and sent after the commit; never throws.
 */
export async function announceCollectionShops(driverIds: ReadonlyArray<string | null | undefined>): Promise<void> {
  const ids = [...new Set(driverIds.filter((d): d is string => !!d))];
  if (ids.length === 0) return;
  let shopIds: string[] = [];
  try {
    const { rows } = await query<{ shop_id: string }>(
      `SELECT DISTINCT rs.shop_id::text AS shop_id
         FROM public.round_stop rs
         JOIN public.driver_round dr ON dr.id = rs.round_id
        WHERE dr.driver_id = ANY($1::uuid[])
          AND dr.kind = 'collection'
          -- A round just cancelled (work released) still names the shops that lost their driver.
          AND (dr.status IN ('planned', 'in_progress')
               OR (dr.status = 'cancelled' AND dr.updated_at > now() - interval '15 minutes'))
          AND rs.kind = 'shop_pickup'`,
      [ids],
    );
    shopIds = rows.map((r) => r.shop_id);
  } catch (err) {
    // A shop catches up on its next read.
    logger.warn({ err }, "live: could not read the shops on a driver's collection rounds");
    return;
  }
  if (shopIds.length === 0) return;
  await announce(shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })));
}
