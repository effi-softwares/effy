package checkout

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// 065 — the order line's temperature class is a SNAPSHOT taken at placement, against the REAL
// migrations.
//
// ⚠ THIS CANNOT BE A UNIT TEST. The storage requirement is not a column on `public.product`: it is
// the `value_text` of a `product_attribute_value` row whose definition has `key = 'storage'`. 063
// recorded that exact shape as a name that typechecks perfectly and fails only when a query runs. A
// fake store would return whatever the author believed the join returns.
//
// ⚠ AND IT RUNS EVERY MIGRATION, including this slice's own — so the CHECK on
// `order_item.storage_class` is proven to accept what checkout writes.

func applyAllMigrationsForStorageClass(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	dir := filepath.Join("..", "..", "..", "..", "..", "db", "migrations")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err, "migrations directory")

	var files []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	require.NotEmpty(t, files, "no migrations found — this test would otherwise pass vacuously")

	for _, name := range files {
		body, err := os.ReadFile(filepath.Join(dir, name))
		require.NoError(t, err)
		up := string(body)
		if start := strings.Index(up, "-- +goose Up"); start >= 0 {
			up = up[start:]
		}
		if end := strings.Index(up, "-- +goose Down"); end >= 0 {
			up = up[:end]
		}
		_, err = pool.Exec(context.Background(), up)
		require.NoError(t, err, "applying %s", name)
	}
}

type storageWorld struct {
	customerID string
	shopID     string
}

func seedStorageWorld(t *testing.T, pool *pgxpool.Pool) storageWorld {
	t.Helper()
	ctx := context.Background()
	var w storageWorld
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.customer (cognito_sub, email)
		 VALUES ('cust-' || substr(md5(random()::text), 1, 8),
		         'c-' || substr(md5(random()::text), 1, 8) || '@example.com')
		 RETURNING id::text`).Scan(&w.customerID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop (code, name)
		 VALUES ('S' || substr(md5(random()::text), 1, 6), 'Storage Shop') RETURNING id::text`).Scan(&w.shopID))
	_, err := pool.Exec(ctx, `INSERT INTO public.cart (customer_id) VALUES ($1::uuid)`, w.customerID)
	require.NoError(t, err)
	return w
}

// seedCartProduct creates an active product at the shop and puts one in the customer's cart.
// storage "" leaves the product with NO storage attribute at all.
func seedCartProduct(t *testing.T, pool *pgxpool.Pool, w storageWorld, name, storage string) string {
	t.Helper()
	ctx := context.Background()
	var productID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name,
		                             price_amount, short_description, created_by, status)
		 SELECT $1::uuid, (SELECT id FROM public.product_type LIMIT 1),
		        (SELECT id FROM public.category LIMIT 1), $2, 5, 'A thing', 'seed', 'active'
		 RETURNING id::text`, w.shopID, name).Scan(&productID))
	if storage != "" {
		setProductStorage(t, pool, productID, storage)
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO public.cart_item (cart_id, product_id, quantity)
		 SELECT c.id, $2::uuid, 1 FROM public.cart c WHERE c.customer_id = $1::uuid`,
		w.customerID, productID)
	require.NoError(t, err)
	return productID
}

func setProductStorage(t *testing.T, pool *pgxpool.Pool, productID, storage string) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		`DELETE FROM public.product_attribute_value
		  WHERE product_id = $1::uuid
		    AND attribute_definition_id = (SELECT id FROM public.attribute_definition WHERE key = 'storage')`,
		productID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text)
		 VALUES ($1::uuid, (SELECT id FROM public.attribute_definition WHERE key = 'storage'), $2)`,
		productID, storage)
	require.NoError(t, err)
}

// placeFromCart runs the two store calls a payment intent makes: read the cart's lines, then write
// the pending order from them.
func placeFromCart(t *testing.T, s Store, w storageWorld) string {
	t.Helper()
	ctx := context.Background()
	lines, err := s.CartLines(ctx, w.customerID)
	require.NoError(t, err)
	require.NotEmpty(t, lines)
	orderID, _, err := s.UpsertPendingOrder(ctx, w.customerID,
		OrderAmounts{ItemSubtotalCents: 500, GrandTotalCents: 500, Currency: "AUD"},
		[]byte(`{}`), lines, true)
	require.NoError(t, err)
	return orderID
}

func storageClassOf(t *testing.T, pool *pgxpool.Pool, orderID, productID string) *string {
	t.Helper()
	var c *string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT storage_class FROM public.order_item WHERE order_id = $1::uuid AND product_id = $2::uuid`,
		orderID, productID).Scan(&c))
	return c
}

func TestStorageClass_TheOrderLineSnapshotsTheProductsStorageRequirement(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	frozen := seedCartProduct(t, pool, w, "Peas", "frozen")
	chilled := seedCartProduct(t, pool, w, "Milk", "chilled")
	ambient := seedCartProduct(t, pool, w, "Rice", "ambient")
	none := seedCartProduct(t, pool, w, "Batteries", "")

	orderID := placeFromCart(t, NewStore(pool), w)

	require.Equal(t, "frozen", *storageClassOf(t, pool, orderID, frozen))
	require.Equal(t, "chilled", *storageClassOf(t, pool, orderID, chilled))
	require.Equal(t, "ambient", *storageClassOf(t, pool, orderID, ambient))
	// FR-008 — no storage attribute is ambient, and it is WRITTEN, not left NULL: NULL is reserved
	// for lines sold before 065, which a driver is shown as "not recorded".
	got := storageClassOf(t, pool, orderID, none)
	require.NotNil(t, got, "a 065 line must never be NULL")
	require.Equal(t, "ambient", *got)
}

// ⚠ FR-009 / SC-006. The shop changes the product AFTER the order line was written. The line must
// not move — it describes goods already sold.
func TestStorageClass_ALaterProductEditDoesNotMoveTheOrderLine(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	yoghurt := seedCartProduct(t, pool, w, "Yoghurt", "chilled")

	orderID := placeFromCart(t, NewStore(pool), w)
	_, err := pool.Exec(context.Background(),
		`UPDATE public."order" SET status = 'paid' WHERE id = $1::uuid`, orderID)
	require.NoError(t, err)

	setProductStorage(t, pool, yoghurt, "ambient")

	require.Equal(t, "chilled", *storageClassOf(t, pool, orderID, yoghurt))
}

// The line is rewritten at each payment intent until the order is paid, so "at purchase" means the
// product as it stood at the LAST intent — not the first time the shopper opened checkout.
func TestStorageClass_AnUnpaidOrderTakesTheClassAtTheLatestIntent(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	yoghurt := seedCartProduct(t, pool, w, "Yoghurt", "chilled")
	s := NewStore(pool)

	first := placeFromCart(t, s, w)
	setProductStorage(t, pool, yoghurt, "frozen")
	second := placeFromCart(t, s, w)

	require.Equal(t, first, second, "the pending order is reused")
	require.Equal(t, "frozen", *storageClassOf(t, pool, second, yoghurt))
}

// ⚠ The `storage` attribute's allowed values are back-office DATA — an admin can add a fourth
// without a deployment (016 SC-001). The order line's CHECK admits three. An unrecognised value must
// become ambient rather than fail the INSERT, or one catalogue edit would stop a shopper paying.
func TestStorageClass_AnUnrecognisedStorageValueCannotFailCheckout(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	odd := seedCartProduct(t, pool, w, "Wine", "cellar")

	orderID := placeFromCart(t, NewStore(pool), w)

	require.Equal(t, "ambient", *storageClassOf(t, pool, orderID, odd))
}
