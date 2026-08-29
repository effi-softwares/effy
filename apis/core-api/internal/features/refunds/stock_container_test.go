package refunds

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// Returning stock on a refund (055 T078/T079, FR-030).
//
// ⚠ THE THREE CASES THAT MUST **NOT** RETURN ANYTHING ARE THE POINT. Inventing stock is worse than
// not returning it: a count that is too high costs a customer their order at the shelf hours later,
// which is gap G2 all over again.

const stockProduct = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

// seedTrackedLine gives the order one line of a stock-tracked product at a shop.
func seedTrackedLine(t *testing.T, pool *pgxpool.Pool, tracked bool, onHand int, fulStatus string) string {
	t.Helper()
	ctx := context.Background()
	var shop string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop (id, code, name)
		 VALUES (gen_random_uuid(), 'S' || substr(gen_random_uuid()::text,1,8), 'Stock Shop')
		 RETURNING id::text`).Scan(&shop))
	_, err := pool.Exec(ctx,
		`INSERT INTO public.product_type (id, key, name) VALUES (gen_random_uuid(),'grocery','Grocery')
		 ON CONFLICT DO NOTHING`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO public.category (id, key, name) VALUES (gen_random_uuid(),'dairy','Dairy')
		 ON CONFLICT DO NOTHING`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO public.product (id, shop_id, product_type_id, primary_category_id, name,
		   price_amount, short_description, created_by, stock_tracked, stock_on_hand)
		 SELECT $1, $2, pt.id, c.id, 'Milk', 10, 'Fresh milk', 'seed', $3, $4
		   FROM public.product_type pt, public.category c
		  WHERE pt.key = 'grocery' AND c.key = 'dairy'`, stockProduct, shop, tracked, onHand)
	require.NoError(t, err)

	var itemID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.order_item (order_id, product_id, shop_id, product_name,
		   unit_price_amount, quantity, line_subtotal_amount)
		 VALUES ($1,$2,$3,'Milk',10,3,30) RETURNING id::text`, orderID, stockProduct, shop).Scan(&itemID))
	_, err = pool.Exec(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status)
		 VALUES ($1,$2,3,30,$3)`, orderID, shop, fulStatus)
	require.NoError(t, err)
	return itemID
}

func onHand(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT stock_on_hand FROM public.product WHERE id = $1`, stockProduct).Scan(&n))
	return n
}

func refundMovements(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.stock_movement WHERE reason = 'refund'`).Scan(&n))
	return n
}

// ⚠ THE ONE CASE THAT DOES RETURN STOCK: item-derived, tracked, and still at the shop.
func TestReturnStock_PutsUncollectedTrackedUnitsBack(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	item := seedTrackedLine(t, pool, true, 5, "picking")
	svc := NewService(NewRepository(pool), &recordingGateway{})

	_, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "item", Reason: ReasonItemNotSupplied, ActorSub: "staff-1",
		Lines: []LineInput{{OrderItemID: item, Quantity: 2}},
	})
	require.NoError(t, err)

	require.Equal(t, 7, onHand(t, pool), "two refunded units go back on the shelf")

	// ⚠ THE MOVEMENT CITES THE ORDER. A count that changed with no explanation is one nobody can
	// reconcile, and 054's whole design is that the history accounts for the difference.
	var delta, before, after int
	var reason, actorKind, cited string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT quantity_delta, quantity_before, quantity_after, reason, actor_kind, order_id::text
		   FROM public.stock_movement WHERE reason = 'refund'`).
		Scan(&delta, &before, &after, &reason, &actorKind, &cited))
	require.Equal(t, 2, delta)
	require.Equal(t, 5, before)
	require.Equal(t, 7, after)
	require.Equal(t, "system", actorKind, "no person moved this — the refund did")
	require.Equal(t, orderID, cited)
}

// ⚠ A GOODWILL REFUND NAMES NO ITEMS, so there is nothing to return. Inventing a product to credit
// would put stock on a shelf that never lost any.
func TestReturnStock_AGoodwillRefundReturnsNothing(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedTrackedLine(t, pool, true, 5, "picking")
	svc := NewService(NewRepository(pool), &recordingGateway{})

	_, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)

	require.Equal(t, 5, onHand(t, pool))
	require.Zero(t, refundMovements(t, pool))
}

// ⚠ ONCE COLLECTED THE GOODS ARE PHYSICALLY GONE — a driver has them, or a customer does. Adding them
// back would tell a picker there is something on a shelf that is not there, and the next shopper's
// order would short. That is gap G2 all over again.
func TestReturnStock_ACollectedPortionReturnsNothing(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	item := seedTrackedLine(t, pool, true, 5, "collected")
	svc := NewService(NewRepository(pool), &recordingGateway{})

	_, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "item", Reason: ReasonItemUnusable, ActorSub: "staff-1",
		Lines: []LineInput{{OrderItemID: item, Quantity: 2}},
	})
	require.NoError(t, err)

	require.Equal(t, 5, onHand(t, pool), "the goods have left the shop")
	require.Zero(t, refundMovements(t, pool))
}

// ⚠ AN UNTRACKED PRODUCT HAS NO COUNT TO MOVE. 054 made tracking opt-in per product precisely so the
// entire pre-054 catalogue keeps behaving as it did.
func TestReturnStock_AnUntrackedProductReturnsNothing(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	item := seedTrackedLine(t, pool, false, 0, "picking")
	svc := NewService(NewRepository(pool), &recordingGateway{})

	_, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "item", Reason: ReasonItemNotSupplied, ActorSub: "staff-1",
		Lines: []LineInput{{OrderItemID: item, Quantity: 2}},
	})
	require.NoError(t, err)

	require.Equal(t, 0, onHand(t, pool))
	require.Zero(t, refundMovements(t, pool))
}
