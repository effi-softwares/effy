import { fulfilmentDeliveredBySql } from "@effy/edge-shared/delivery";
import type { DeliveredBy } from "@effy/shared-types";

export type { DeliveredBy };

/**
 * Who takes a package away from the shop — `'effy_driver'` or `'courier'` — as a SQL expression over
 * a fulfilment aliased `sf` and its order aliased `o` (079).
 *
 * ⚠ THE ONLY THING A SHOP IS TOLD ABOUT DELIVERY. Not the customer's window, not their day, not the
 * estimate, not a fee. It is true of every package there has ever been: the database decides
 * (`public.package_delivered_by`), from the order's delivery type or — for an order placed before
 * there was one — from what the package effectively was.
 *
 * ⚠ "same-day" and "standard" are the CUSTOMER'S words. Until 079 they were sent to shops as the
 * method; the day the new delivery model goes on, a "standard" package is one an Effy driver
 * delivers, and the word would be wrong on the screen of the one person handing it over.
 */
export const DELIVERED_BY_SQL = `CASE ${fulfilmentDeliveredBySql("o", "sf")} WHEN 'effy' THEN 'effy_driver' ELSE 'courier' END`;
