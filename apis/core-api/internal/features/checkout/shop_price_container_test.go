package checkout

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// 067 — THE TWO PRICES ON AN ORDER, against the real migrations.
//
// Once Effy adds a margin, "the price" of a sold line is two numbers: what the customer paid and what
// the shop is owed. Both are fixed at placement. The customer's is the one charged, refunded and
// printed on the receipt; the shop's is the one the shop's order view and sales figures read.
//
// ⚠ A fake store would prove nothing here: the values are read from `public.product` by one SQL
// statement and written by another, and the only thing that can be wrong is which column each used.

func setProductPrices(t *testing.T, pool *pgxpool.Pool, productID, shopPrice, customerPrice string) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`UPDATE public.product
		    SET shop_price_amount = $2::numeric, price_amount = $3::numeric,
		        margin_kind = 'amount', margin_value = $3::numeric - $2::numeric
		  WHERE id = $1::uuid`, productID, shopPrice, customerPrice)
	require.NoError(t, err)
}

type linePrices struct{ unit, line, shopUnit, shopLine string }

func linePricesOf(t *testing.T, pool *pgxpool.Pool, orderID, productID string) linePrices {
	t.Helper()
	var p linePrices
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT unit_price_amount::text, line_subtotal_amount::text,
		        shop_unit_price_amount::text, shop_line_subtotal_amount::text
		   FROM public.order_item WHERE order_id = $1::uuid AND product_id = $2::uuid`,
		orderID, productID).Scan(&p.unit, &p.line, &p.shopUnit, &p.shopLine))
	return p
}

func TestShopPrice_TheOrderLineKeepsWhatTheCustomerPaysAndWhatTheShopIsOwed(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	bread := seedCartProduct(t, pool, w, "Bread", "ambient")
	setProductPrices(t, pool, bread, "10.00", "12.00")
	_, err := pool.Exec(context.Background(), `UPDATE public.cart_item SET quantity = 3`)
	require.NoError(t, err)

	orderID := placeFromCart(t, NewStore(pool), w)

	got := linePricesOf(t, pool, orderID, bread)
	require.Equal(t, linePrices{unit: "12.00", line: "36.00", shopUnit: "10.00", shopLine: "30.00"}, got)
}

// A product Effy has set no margin on: the shop is owed exactly what the customer pays.
func TestShopPrice_WithNoMarginTheTwoAreEqual(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	bread := seedCartProduct(t, pool, w, "Bread", "ambient")

	orderID := placeFromCart(t, NewStore(pool), w)

	got := linePricesOf(t, pool, orderID, bread)
	require.Equal(t, got.unit, got.shopUnit)
	require.Equal(t, got.line, got.shopLine)
}

// A product row written before 067 has no shop price at all (NULL). It reads as the customer price.
func TestShopPrice_AProductWithNoShopPriceReadsAsItsCustomerPrice(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	bread := seedCartProduct(t, pool, w, "Bread", "ambient")
	_, err := pool.Exec(context.Background(),
		`UPDATE public.product SET shop_price_amount = NULL WHERE id = $1::uuid`, bread)
	require.NoError(t, err)

	orderID := placeFromCart(t, NewStore(pool), w)

	got := linePricesOf(t, pool, orderID, bread)
	require.Equal(t, "5.00", got.unit)
	require.Equal(t, "5.00", got.shopUnit)
}

// ⚠ FR-045 / SC-008. The margin and the shop's price both change AFTER the order exists. Neither
// stored figure moves — the order records what was agreed, not what the catalogue says today.
func TestShopPrice_ALaterPriceOrMarginChangeMovesNoPlacedOrder(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	bread := seedCartProduct(t, pool, w, "Bread", "ambient")
	setProductPrices(t, pool, bread, "10.00", "12.00")

	orderID := placeFromCart(t, NewStore(pool), w)
	_, err := pool.Exec(context.Background(), `UPDATE public."order" SET status = 'paid' WHERE id = $1::uuid`, orderID)
	require.NoError(t, err)
	before := linePricesOf(t, pool, orderID, bread)

	setProductPrices(t, pool, bread, "40.00", "99.00")

	require.Equal(t, before, linePricesOf(t, pool, orderID, bread))
}

// The per-shop portion: the customer's subtotal still sums to the order (019), and the shop's own
// figure sits beside it.
func TestShopPrice_ThePortionCarriesBothSubtotals(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	bread := seedCartProduct(t, pool, w, "Bread", "ambient")
	milk := seedCartProduct(t, pool, w, "Milk", "chilled")
	setProductPrices(t, pool, bread, "10.00", "12.00")
	setProductPrices(t, pool, milk, "3.00", "3.50")

	s := NewStore(pool)
	orderID := placeFromCart(t, s, w)
	_, err := s.FinalizeSucceeded(context.Background(), orderID)
	require.NoError(t, err)

	var customer, shop string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT subtotal_amount::text, shop_subtotal_amount::text
		   FROM public.shop_fulfillment WHERE order_id = $1::uuid`, orderID).Scan(&customer, &shop))
	require.Equal(t, "15.50", customer)
	require.Equal(t, "13.00", shop)
}
