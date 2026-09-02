package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ShopGate answers "may this shop subject refund THIS order?" from the PLATFORM'S OWN RECORD (057).
//
// ⚠ IT ASKS THREE QUESTIONS AT ONCE, IN ONE STATEMENT, AND ALL THREE MUST HOLD:
//
//  1. is this subject an ACTIVE shop operator            (`shop_staff.status`)
//  2. carrying the shop_manager ROLE                     (`shop_staff_role`)
//  3. at a shop that is FULFILLING SOME OF THIS ORDER    (`shop_fulfillment`)
//
// The third is what makes this different from every other gate on the platform, and it is the whole
// reason this type exists rather than a copy of StaffGate. A back-office operator's authority is
// global: if they may refund, they may refund anything. A shop manager's authority is bounded by
// which orders their shop actually touched — so the gate cannot be answered from the subject alone,
// and any signature that omits the order id would be answering a different, weaker question.
//
// ⚠ FROM THE RECORD, NEVER FROM `cognito:groups`. Principle IV: the claim is the ORIGIN of a role
// assignment; where the platform keeps its own record, the record is authoritative. A manager who was
// stood down this morning still holds a valid token for an hour, and only the record knows.
//
// ⚠ AND THE SHOP MUST BE ACTIVE TOO. 007's manager gate established that a valid operator at a
// suspended shop is refused, and 009 made `shop.status` the term that decides it. A refund issued
// from a shop Effy has suspended is exactly the write that must not slip through.
type ShopGate struct {
	pool *pgxpool.Pool
}

func NewShopGate(pool *pgxpool.Pool) *ShopGate { return &ShopGate{pool: pool} }

// ShopManagerRole is the single role permitted to move money from the shop console.
//
// ⚠ `shop_staff` IS DELIBERATELY ABSENT, and this is the one authority split that differs from the
// rest of the shop console. 020's FR-019a gave both roles full fulfilment access on purpose — the
// people at the shelves are the ones doing the work. A refund is not that: it is irreversible, it
// spends the business's money, and there is no un-refund. That places it with 046's outward reply and
// 053's arrival assertion, not with picking.
const ShopManagerRole = "shop_manager"

// ⚠ WRITTEN FROM THE MIGRATIONS, NOT FROM MEMORY. `shop_staff_role` joins `shop_role` on `role_key`
// (a text primary key), exactly as `admin.staff_role` does — StaffGate's own comment records an
// earlier draft that invented `role_id`, compiled fine, and would have refused every operator at
// runtime. The join here was read off 20260710050004_shop_staff_rbac.sql.
//
// The `shop_fulfillment` term is an EXISTS rather than a join so the row count cannot multiply the
// result: an order with three portions from the same shop must answer "yes" once, not three times.
const shopCanRefundOrder = `
SELECT EXISTS (
    SELECT 1
      FROM public.shop_staff s
      JOIN public.shop_staff_role sr ON sr.staff_id = s.id
      JOIN public.shop sh ON sh.id = s.shop_id
     WHERE s.cognito_sub = $1
       -- availability-exempt: public.shop_staff — WHO may act, not what may be sold.
       AND s.status = 'active'
       AND sr.role_key = $2
       -- availability-exempt: public.shop — the fulfilment node's own lifecycle (009).
       AND sh.status = 'active'
       AND EXISTS (
             SELECT 1
               FROM public.shop_fulfillment f
              WHERE f.order_id = $3
                AND f.shop_id = s.shop_id
           )
)`

// CanRefundOrder reports whether this shop subject may refund part of this order.
//
// ⚠ FAIL-CLOSED, and the error is returned rather than folded into `false`. "We could not check" and
// "you may not" are different facts: one should make an operator try again, the other should make
// them stop. Collapsing them tells the wrong story on the screen where money moves.
func (g *ShopGate) CanRefundOrder(ctx context.Context, sub, orderID string) (bool, error) {
	var ok bool
	if err := g.pool.QueryRow(ctx, shopCanRefundOrder, sub, ShopManagerRole, orderID).Scan(&ok); err != nil {
		return false, fmt.Errorf("auth: shop refund gate: %w", err)
	}
	return ok, nil
}

// ShopIDFor resolves the caller's own shop, for scoping the lines a refund may name.
//
// ⚠ Returns ("", nil) for an operator with no shop assigned — an EXPECTED state, not an error (007:
// the JIT upsert meets an operator before their shop is known). The caller treats an empty shop as
// "refuse", never as "all shops", which is the difference between a no-op and a catastrophe.
func (g *ShopGate) ShopIDFor(ctx context.Context, sub string) (string, error) {
	var shopID *string
	err := g.pool.QueryRow(ctx,
		`SELECT s.shop_id::text FROM public.shop_staff s WHERE s.cognito_sub = $1`, sub).Scan(&shopID)
	if err != nil {
		return "", fmt.Errorf("auth: shop id lookup: %w", err)
	}
	if shopID == nil {
		return "", nil
	}
	return *shopID, nil
}
