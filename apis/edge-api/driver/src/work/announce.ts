import { query } from "@effy/edge-shared";
import { announce, announceMoves, type PackageMove } from "@effy/edge-shared/live";

/**
 * What a driver's action changes on other people's screens. Called after the transaction commits;
 * never throws. The driver's own app is not told. A replay announces again, harmlessly.
 */

const DISPATCH = { scope: "ops", kind: "dispatch" } as const;

async function packagesAt(stopId: string, state: "picked_up" | "delivered"): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT shop_fulfillment_id::text AS id FROM public.round_package WHERE stop_id = $1 AND state = $2`,
    [stopId, state],
  );
  return rows.map((r) => r.id);
}

async function movedAt(stopId: string, state: "picked_up" | "delivered", from: string): Promise<PackageMove[]> {
  try {
    return (await packagesAt(stopId, state)).map((fulfillmentId) => ({ fulfillmentId, from }));
  } catch {
    return [];
  }
}

/** Packages left their shop; the customer hears only if that was their last. */
export async function announceCollected(stopId: string): Promise<void> {
  await announceMoves(await movedAt(stopId, "picked_up", "ready_for_pickup"), { also: [DISPATCH] });
}

export async function announceDelivered(dropId: string): Promise<void> {
  await announceMoves(await movedAt(dropId, "delivered", "collected"), { also: [DISPATCH] });
}

/**
 * A collection round was checked in: its packages are at the hub. Each shop on the round is told; the
 * customer is not, since their stage does not change.
 */
export async function announceCheckedIn(roundId: string): Promise<void> {
  let shopIds: string[] = [];
  try {
    const { rows } = await query<{ shop_id: string }>(
      `SELECT DISTINCT sf.shop_id::text AS shop_id
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE rs.round_id = $1`,
      [roundId],
    );
    shopIds = rows.map((r) => r.shop_id);
  } catch {
    // Back-office still hears; a shop catches up on its next read.
  }
  await announce([
    DISPATCH,
    { scope: "ops", kind: "orders" },
    ...shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })),
  ]);
}

/** A drop started, an attempt failed, or a package could not be collected. */
export async function announceStop(stopId: string): Promise<void> {
  let shopIds: string[] = [];
  try {
    const { rows } = await query<{ shop_id: string }>(
      `SELECT DISTINCT sf.shop_id::text AS shop_id
         FROM public.round_package rp
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE rp.stop_id = $1`,
      [stopId],
    );
    shopIds = rows.map((r) => r.shop_id);
  } catch {
    // Back-office still hears; a shop catches up on its next read.
  }
  await announce([
    DISPATCH,
    { scope: "ops", kind: "orders" },
    ...shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })),
  ]);
}

/** Failed parcels returned to the hub: "Problem" becomes "At hub". */
export async function announceReturned(roundId: string): Promise<void> {
  let shopIds: string[] = [];
  try {
    const { rows } = await query<{ shop_id: string }>(
      `SELECT DISTINCT sf.shop_id::text AS shop_id
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE rs.round_id = $1 AND rp.state = 'returned'`,
      [roundId],
    );
    shopIds = rows.map((r) => r.shop_id);
  } catch {
    // Back-office still hears; a shop catches up on its next read.
  }
  await announce([
    DISPATCH,
    { scope: "ops", kind: "orders" },
    ...shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })),
  ]);
}

export async function announceDuty(): Promise<void> {
  await announce([DISPATCH]);
}

/** Packages declared missing at loading or check-in. */
export async function announceHeld(): Promise<void> {
  await announce([DISPATCH, { scope: "ops", kind: "orders" }]);
}
