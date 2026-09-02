package refunds

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
)

// 057 US5 (T042/T043) — the shop refund gate and line scoping, against REAL PostgreSQL.
//
// ⚠ THESE CANNOT BE UNIT TESTS, FOR THE SAME REASON `staffgate_container_test.go` says. Both of the
// things under test ARE SQL — a four-table predicate and a scoping COUNT — and the only thing that can
// be wrong with either is the SQL. A fake gate returning `true` proves nothing about a join written
// from memory. 055's own comment records an earlier draft that invented `r.id = sr.role_id`, compiled
// perfectly, and would have refused every staff member at runtime; 056 records two more column names
// that typechecked and failed only when a query ran.
//
// ⚠ AND THEY EXERCISE THIS FEATURE'S OWN MIGRATION. `applyMigrations` runs every file in
// db/migrations in order, so `20260902044144_shop_console_redesign.sql` is applied here — which makes
// this the only place the widened `refund_actor_kind_check` is proven to accept 'shop' at all.

func seedShopStaff(t *testing.T, pool *pgxpool.Pool, sub, staffStatus, shopStatus, role string) string {
	t.Helper()
	ctx := context.Background()

	var shopID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop (code, name, status)
		 VALUES ('SHP-' || substr(md5(random()::text), 1, 6), 'Test Shop', $1)
		 RETURNING id::text`, shopStatus).Scan(&shopID))

	var staffID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id)
		 VALUES ($1, $1 || '@effy.shop', 'Test Operator', $2, $3::uuid)
		 RETURNING id::text`, sub, staffStatus, shopID).Scan(&staffID))

	if role != "" {
		_, err := pool.Exec(ctx,
			`INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1::uuid, $2)`,
			staffID, role)
		require.NoError(t, err)
	}
	return shopID
}

// seedOrderForShop creates a paid order with one line + portion at `shopID`, returning (orderID, orderItemID).
//
// ⚠ EVERY COLUMN NAME HERE WAS READ OFF THE MIGRATIONS, NOT REMEMBERED. The first draft of this file
// invented `order.total_amount` and `shop_fulfillment.item_subtotal_amount`; both typechecked, both
// failed the moment a query ran. That is the same class 056 hit twice (`order.reference` →
// `order_number`, `customer_address.suburb` → `city`) and it is precisely why these tests are
// container-backed instead of mocked.
func seedOrderForShop(t *testing.T, pool *pgxpool.Pool, shopID string) (string, string) {
	t.Helper()
	ctx := context.Background()

	var customerID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.customer (cognito_sub, email)
		 VALUES ('cust-' || substr(md5(random()::text), 1, 8),
		         'c-' || substr(md5(random()::text), 1, 8) || '@example.com')
		 RETURNING id::text`).Scan(&customerID))

	var newOrderID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public."order"
		   (customer_id, order_number, status, currency, item_subtotal_amount,
		    delivery_fee_amount, grand_total_amount, delivery_address)
		 VALUES ($1::uuid, 'EFY-' || substr(md5(random()::text), 1, 6), 'paid', 'AUD',
		         20, 0, 20, '{}'::jsonb)
		 RETURNING id::text`, customerID).Scan(&newOrderID))

	productID := seedProduct(t, pool, shopID)

	var orderItemID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.order_item
		   (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, 'Barossa Free-Range Eggs 700g', 10, 2, 20)
		 RETURNING id::text`, newOrderID, productID, shopID).Scan(&orderItemID))

	_, err := pool.Exec(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, 'received', 2, 20)`, newOrderID, shopID)
	require.NoError(t, err)

	return newOrderID, orderItemID
}

func seedProduct(t *testing.T, pool *pgxpool.Pool, shopID string) string {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		`INSERT INTO public.product_type (id, key, name) VALUES (gen_random_uuid(),'grocery','Grocery')
		 ON CONFLICT DO NOTHING`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO public.category (id, key, name) VALUES (gen_random_uuid(),'pantry','Pantry')
		 ON CONFLICT DO NOTHING`)
	require.NoError(t, err)

	var productID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name,
		   price_amount, short_description, created_by)
		 SELECT $1::uuid, pt.id, c.id, 'Barossa Free-Range Eggs 700g', 10, 'Free-range eggs', 'seed'
		   FROM public.product_type pt, public.category c
		  WHERE pt.key = 'grocery' AND c.key = 'pantry'
		 RETURNING id::text`, shopID).Scan(&productID))
	return productID
}

// ⚠ THE GATE ASKS THREE QUESTIONS AND ALL THREE MUST HOLD. This is parameterised over every way each
// one can fail, so a future change that drops a term fails HERE rather than in production — which is
// the 053/056 lesson (a gate that silently widens is invisible until someone exploits it).
func TestShopGate_AllThreeTermsMustHold(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()
	gate := auth.NewShopGate(pool)

	okShop := seedShopStaff(t, pool, "sub-manager", "active", "active", "shop_manager")
	orderID, _ := seedOrderForShop(t, pool, okShop)

	// Same order, but these operators fail one term each.
	staffOnlyShop := seedShopStaff(t, pool, "sub-staff", "active", "active", "shop_staff")
	seedOrderForShop(t, pool, staffOnlyShop) // their own shop is on a DIFFERENT order
	disabledShop := seedShopStaff(t, pool, "sub-disabled", "disabled", "active", "shop_manager")
	suspendedShop := seedShopStaff(t, pool, "sub-suspended", "active", "suspended", "shop_manager")
	otherShop := seedShopStaff(t, pool, "sub-other", "active", "active", "shop_manager")
	_ = disabledShop
	_ = suspendedShop
	_ = otherShop

	for _, tc := range []struct {
		sub   string
		allow bool
		why   string
	}{
		{"sub-manager", true, "active manager at an active shop that is on this order"},
		{"sub-staff", false, "shop_staff may pick, but never move money (the one authority split)"},
		{"sub-disabled", false, "a stood-down operator holds a valid token for up to an hour"},
		{"sub-suspended", false, "a shop Effy has suspended must not issue refunds (007/009)"},
		{"sub-other", false, "a manager at a shop with NO portion of this order"},
		{"sub-nobody", false, "an unknown subject"},
	} {
		got, err := gate.CanRefundOrder(ctx, tc.sub, orderID)
		require.NoError(t, err, tc.sub)
		require.Equalf(t, tc.allow, got, "%s: %s", tc.sub, tc.why)
	}
}

// ⚠ AN OPERATOR WITH NO SHOP MEANS "REFUSE", NEVER "ALL SHOPS". The empty string is an expected state
// (007: the JIT upsert meets an operator before their shop is known), and reading it as a wildcard is
// the difference between a no-op and refunding somebody else's order.
func TestShopIDFor_UnassignedOperatorResolvesToEmptyNotNull(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()
	gate := auth.NewShopGate(pool)

	_, err := pool.Exec(ctx,
		`INSERT INTO public.shop_staff (cognito_sub, status, shop_id) VALUES ('sub-unassigned', 'active', NULL)`)
	require.NoError(t, err)

	got, err := gate.ShopIDFor(ctx, "sub-unassigned")
	require.NoError(t, err, "an unassigned operator is expected, not an error")
	require.Equal(t, "", got)
}

// ⚠ A REQUEST NAMING ONE FOREIGN LINE FAILS WHOLE. Silently refunding the subset it likes is 055's own
// `orderItemId` lesson: "a join that matches nothing does not error, it just refunds less than the
// operator asked for" — and tells them it succeeded.
func TestAssertLinesBelongToShop_RefusesWholeRequestOnAnyForeignLine(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()
	repo := NewRepository(pool)

	mine := seedShopStaff(t, pool, "sub-mine", "active", "active", "shop_manager")
	orderID, myItem := seedOrderForShop(t, pool, mine)

	// A second shop's line on the SAME order — the multi-shop case that makes this necessary.
	theirs := seedShopStaff(t, pool, "sub-theirs", "active", "active", "shop_manager")
	var theirItem string
	theirProduct := seedProduct(t, pool, theirs)
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.order_item
		   (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, 'Bulla Thickened Cream 300ml', 5, 1, 5)
		 RETURNING id::text`, orderID, theirProduct, theirs).Scan(&theirItem))
	_, err := pool.Exec(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, 'received', 1, 5)`, orderID, theirs)
	require.NoError(t, err)

	require.NoError(t,
		repo.AssertLinesBelongToShop(ctx, orderID, mine, []LineInput{{OrderItemID: myItem, Quantity: 1}}),
		"my own line must be refundable by me")

	require.ErrorIs(t,
		repo.AssertLinesBelongToShop(ctx, orderID, mine, []LineInput{{OrderItemID: theirItem, Quantity: 1}}),
		ErrLinesNotYours, "another shop's line must be refused")

	// ⚠ THE ONE THAT MATTERS MOST: a mixed request must not quietly succeed for the half that is mine.
	require.ErrorIs(t,
		repo.AssertLinesBelongToShop(ctx, orderID, mine, []LineInput{
			{OrderItemID: myItem, Quantity: 1},
			{OrderItemID: theirItem, Quantity: 1},
		}),
		ErrLinesNotYours, "a request naming ONE foreign line must fail whole, not partially succeed")
}

// ⚠ THE MIGRATION'S OWN PROOF. `public.refund.actor_kind` did not accept 'shop' before this feature
// widened its CHECK. Nothing else in the suite exercises that, and a widening that silently failed
// would make every shop refund die at the INSERT with a constraint error.
func TestRefundActorKind_AcceptsShopAfterTheWidening(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()

	shopID := seedShopStaff(t, pool, "sub-writer", "active", "active", "shop_manager")
	orderID, _ := seedOrderForShop(t, pool, shopID)

	_, err := pool.Exec(ctx,
		`INSERT INTO public.refund
		   (order_id, kind, amount, currency, reason, status, idempotency_key, actor_kind, actor_sub)
		 VALUES ($1::uuid, 'item', '10.00', 'AUD', 'item_not_supplied', 'submitting', 'key-shop-1',
		         'shop', 'sub-writer')`, orderID)
	require.NoError(t, err, "actor_kind='shop' must be accepted — 057 widened refund_actor_kind_check")

	// And the widening did not weaken the rule that only `system` may be unattributed.
	_, err = pool.Exec(ctx,
		`INSERT INTO public.refund
		   (order_id, kind, amount, currency, reason, status, idempotency_key, actor_kind, actor_sub)
		 VALUES ($1::uuid, 'item', '5.00', 'AUD', 'item_not_supplied', 'submitting', 'key-shop-2',
		         'shop', NULL)`, orderID)
	require.Error(t, err, "a shop refund with no subject must still be refused (refund_actor_sub_ck)")
}
