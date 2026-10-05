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
 * Something operations' dispatch and order consoles show changed, and no package changed status:
 * a package reported unavailable, a hub check-in, a drop marked en route or failed.
 */
export async function announceRoundProgress(): Promise<void> {
  await announce([DISPATCH, { scope: "ops", kind: "orders" }]);
}

/** A driver went on or off duty — the dispatcher's roster. */
export async function announceDuty(): Promise<void> {
  await announce([DISPATCH]);
}
