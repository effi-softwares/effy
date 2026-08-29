package refunds

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Returning stock when a refund is issued (055 FR-030, research R8).
//
// ⚠ ONLY WHERE THE PLATFORM CAN KNOW IT SHOULD. Three conditions, and every one of them is a case
// where returning stock would otherwise be a guess:
//
//   - the refund must be ITEM-DERIVED. A goodwill refund names no items, so there is nothing to
//     return; inventing a product to credit would put stock on a shelf that never lost any.
//   - the product must be STOCK-TRACKED. 054 made tracking opt-in per product, and an untracked
//     product has no count to move.
//   - the portion must NOT have been COLLECTED. Once the goods leave the shop they are physically
//     gone — a driver has them, or a customer does. Adding them back would tell a picker there is
//     something on a shelf that is not there, and the next shopper's order would short.
//
// ⚠ INVENTING STOCK IS WORSE THAN NOT RETURNING IT. A count that is too low costs a sale; a count
// that is too high costs a customer their order at the shelf, hours later, which is gap G2 all over
// again. Every case this skips is recorded as a deliberate omission, not an oversight.
//
// ⚠ IT NEVER FAILS THE REFUND. The money is already on its way; a stock write that could abort that
// would be trading a customer's refund for a shelf count.

const returnStock = `
WITH refunded AS (
    SELECT rl.order_item_id, rl.quantity, oi.product_id, oi.shop_id
      FROM public.refund_line rl
      JOIN public.order_item oi ON oi.id = rl.order_item_id
      JOIN public.shop_fulfillment sf
             ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
     WHERE rl.refund_id = $1
       -- ⚠ The goods must still be at the shop: collected and delivered have physically left.
       AND sf.status NOT IN ('collected', 'delivered')
), moved AS (
    UPDATE public.product p
       SET stock_on_hand = p.stock_on_hand + r.quantity
      FROM refunded r
     WHERE p.id = r.product_id
       -- ⚠ An untracked product has no count to move (054 made tracking opt-in per product).
       AND p.stock_tracked
 RETURNING p.id AS product_id, r.shop_id, r.quantity,
           p.stock_on_hand - r.quantity AS before, p.stock_on_hand AS after
)
INSERT INTO public.stock_movement
    (product_id, shop_id, quantity_delta, quantity_before, quantity_after, reason,
     actor_kind, actor_sub, order_id)
SELECT m.product_id, m.shop_id, m.quantity, m.before, m.after, 'refund', 'system', NULL, $2
  FROM moved m`

// ReturnStock puts refunded units back on the shelf where the platform can know it should.
//
// ⚠ THE MOVEMENT CITES THE ORDER. A count that changed with no explanation is one nobody can
// reconcile, and 054's whole design is that the history accounts for the difference.
func (r *Repository) ReturnStock(ctx context.Context, refundID, orderID string) error {
	if _, err := r.pool.Exec(ctx, returnStock, refundID, orderID); err != nil {
		return fmt.Errorf("refunds: return stock: %w", err)
	}
	return nil
}

// ⚠ `pgx` is imported for the shared error sentinel used elsewhere in this package; referenced here
// so the import stays honest if this file is read alone.
var _ = pgx.ErrNoRows
