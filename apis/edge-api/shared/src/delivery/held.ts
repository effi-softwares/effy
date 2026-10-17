// Held packages (093): declared missing by a driver at loading or at hub check-in.
//
// ⚠ ONE DEFINITION OF "HELD OUT OF PLANNING", READ BY BOTH GATHERS. A held package must not be put on
// a run again until a dispatcher says it was found — a package declared "not at the hub" and re-planned
// every five minutes would land on every van and in nobody's hands. Resolved `lost`, it never returns.

/** True when the package named by `sfId` (a SQL expression) is held: an open hold, or one resolved lost. */
export function heldSql(sfId: string): string {
  return `EXISTS (SELECT 1 FROM public.package_hold ph
                   WHERE ph.shop_fulfillment_id = ${sfId}
                     AND (ph.resolution IS NULL OR ph.resolution = 'lost'))`;
}
