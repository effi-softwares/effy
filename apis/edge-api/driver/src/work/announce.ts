import { query } from "@effy/edge-shared";
import { announce, announceMoves, type PackageMove } from "@effy/edge-shared/live";

/**
 * 071 — what a driver's action changes on OTHER people's screens.
 *
 * Called by each handler straight after its service call has returned — i.e. after that call's
 * transaction has committed — and never inside it. None of these throws: the collection, the
 * proof or the duty change has already happened (FR-006).
 *
 * The driver's own app is not told: it made the change and already shows it.
 *
 * ⚠ A replayed request (the app retrying a collect it already made) announces again. That is
 * harmless by construction — an update carries nothing, so a repeat is one extra read.
 */

const DISPATCH = { scope: "ops", kind: "dispatch" } as const;

/** The packages at a stop that are now in `state`. */
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
    return []; // the dispatch update below still goes
  }
}

/**
 * A collection stop was completed: each package the driver took left its shop (`ready_for_pickup`
 * → `collected`). The shop's queue loses it, operations sees it move, and the customer's page says
 * "on the way" — if, and only if, that was the last of their packages to leave a shop.
 */
export async function announceCollected(stopId: string): Promise<void> {
  await announceMoves(await movedAt(stopId, "picked_up", "ready_for_pickup"), { also: [DISPATCH] });
}

/** A drop was completed with proof: its packages went `collected` → `delivered`. */
export async function announceDelivered(dropId: string): Promise<void> {
  await announceMoves(await movedAt(dropId, "delivered", "collected"), { also: [DISPATCH] });
}


/**
 * A collection round was checked in at the hub: its packages are now AT HUB (073).
 *
 * ⚠ THE SHOPS ARE TOLD. Until 073 this went to back-office only (the since-removed `announceRoundProgress`),
 * and every shop console whose packages had just arrived went on showing them as it last read them.
 * A shop's view of a package now carries on past "Collected" (At hub → Out for delivery / With
 * carrier → Delivered), so the shop is told when it moves — each shop whose packages were on the
 * round, and nobody else's. The customer is NOT told: their one-word stage is the same before and
 * after a check-in (`customerViewChanged`), and an update that changes nothing is noise.
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
    // the back-office updates below still go; a shop's console catches up on its next read
  }
  await announce([
    DISPATCH,
    { scope: "ops", kind: "orders" },
    ...shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })),
  ]);
}

/**
 * Something happened at one stop that changes what a SHOP sees (073): a drop started (Out for
 * delivery), a delivery attempt failed (Problem), or a package could not be collected (Problem).
 * Tells the shops whose packages are at that stop, back-office's order and dispatch screens.
 */
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
    // back-office still hears; a shop's console catches up on its next read
  }
  await announce([
    DISPATCH,
    { scope: "ops", kind: "orders" },
    ...shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })),
  ]);
}

/** A driver went on or off duty — the dispatcher's roster. */
export async function announceDuty(): Promise<void> {
  await announce([DISPATCH]);
}
