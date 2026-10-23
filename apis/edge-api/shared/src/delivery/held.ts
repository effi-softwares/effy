// Held packages, declared missing at loading or hub check-in: one definition read by both gathers. Held
// until a dispatcher says found; resolved `lost`, it never returns.

/**
 * Whether package `sfId` (a SQL expression) is held: whole-package holds only (`parcel_id IS NULL`). A
 * missing bag holds just that bag (`parcelHeldSql` in @effy/edge-shared/labels).
 */
export function heldSql(sfId: string): string {
  return `EXISTS (SELECT 1 FROM public.package_hold ph
                   WHERE ph.shop_fulfillment_id = ${sfId}
                     AND ph.parcel_id IS NULL
                     AND (ph.resolution IS NULL OR ph.resolution = 'lost'))`;
}
