/**
 * 113 - the one definition of "an order that was placed": paid at some point. `placed_at` is set only by
 * `finalizeSucceeded` and never cleared, so a cancelled paid order still counts and an unpaid, failed or abandoned one
 * never does. A reader that lists statuses to leave out would count a new ending as an order;
 * `placed-order.guard.test.ts` refuses that shape.
 */
export const PLACED_ORDER_SQL = (alias = "o"): string => `${alias}.placed_at IS NOT NULL`;
