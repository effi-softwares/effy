import type { DeliveredBy } from "@effy/shared-types";

export type { DeliveredBy };

/**
 * Who takes a package away (`'effy_driver'` or `'courier'`), over order alias `o`: the only thing a
 * shop is told about delivery. Never the customer's words "same-day" / "standard".
 */
export const DELIVERED_BY_SQL = `CASE o.delivery_type WHEN 'effy' THEN 'effy_driver' ELSE 'courier' END`;
