package checkout

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// 066 — delivery instructions on the order, against the REAL migrations.
//
// ⚠ THESE CANNOT BE UNIT TESTS. Three of the four guarantees here are the database's: the CHECK that
// refuses a 251-character note whatever the service did, the `status = 'pending_payment'` predicate
// that makes a paid order immutable, and the plain fact that an order row does not reference the
// address it was copied from. A fake store proves none of them.

func placePendingOrder(t *testing.T, pool *pgxpool.Pool, s Store, w storageWorld) string {
	t.Helper()
	seedCartProduct(t, pool, w, "Bread", "ambient")
	return placeFromCart(t, s, w)
}

func orderInstructions(t *testing.T, pool *pgxpool.Pool, orderID string) (handover, note *string) {
	t.Helper()
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT delivery_handover, delivery_note FROM public."order" WHERE id = $1::uuid`, orderID).
		Scan(&handover, &note))
	return handover, note
}

func strPtr(s string) *string { return &s }

func TestDeliveryInstructions_AreWrittenOnThePendingOrder(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	s := NewStore(pool)
	orderID := placePendingOrder(t, pool, s, w)

	require.NoError(t, s.SetOrderDeliveryInstructions(context.Background(), orderID,
		strPtr("leave_at_door"), strPtr("Side gate, code 4411")))

	h, n := orderInstructions(t, pool, orderID)
	require.Equal(t, "leave_at_door", *h)
	require.Equal(t, "Side gate, code 4411", *n)
}

// A shopper who clears the note and pays must not have the earlier draft delivered with the order.
func TestDeliveryInstructions_ALaterIntentReplacesAnEarlierOne_IncludingWithNothing(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	s := NewStore(pool)
	orderID := placePendingOrder(t, pool, s, w)
	ctx := context.Background()

	require.NoError(t, s.SetOrderDeliveryInstructions(ctx, orderID, strPtr("meet_at_door"), strPtr("Ring twice")))
	require.NoError(t, s.SetOrderDeliveryInstructions(ctx, orderID, nil, nil))

	h, n := orderInstructions(t, pool, orderID)
	require.Nil(t, h)
	require.Nil(t, n)
}

// ⚠ FR-010. Once the order is paid nothing may change what the customer said — and that is the
// UPDATE's own predicate, so it holds for a caller that tries.
func TestDeliveryInstructions_APaidOrderIsNeverRewritten(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	s := NewStore(pool)
	orderID := placePendingOrder(t, pool, s, w)
	ctx := context.Background()

	require.NoError(t, s.SetOrderDeliveryInstructions(ctx, orderID, strPtr("leave_at_door"), strPtr("Original")))
	_, err := pool.Exec(ctx, `UPDATE public."order" SET status = 'paid' WHERE id = $1::uuid`, orderID)
	require.NoError(t, err)

	require.NoError(t, s.SetOrderDeliveryInstructions(ctx, orderID, strPtr("meet_at_door"), strPtr("Changed")))

	h, n := orderInstructions(t, pool, orderID)
	require.Equal(t, "leave_at_door", *h)
	require.Equal(t, "Original", *n)
}

// ⚠ SC-009 — THE DATABASE IS THE BACKSTOP. This calls the store directly, as a caller that skipped
// the validation rule would, and the write must still be refused.
func TestDeliveryInstructions_TheDatabaseRefusesWhatTheRuleWouldHave(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	s := NewStore(pool)
	orderID := placePendingOrder(t, pool, s, w)
	ctx := context.Background()

	require.Error(t, s.SetOrderDeliveryInstructions(ctx, orderID, nil, strPtr(strings.Repeat("x", 251))),
		"a 251-character note")
	require.Error(t, s.SetOrderDeliveryInstructions(ctx, orderID, nil, strPtr("   ")), "a blank note")
	require.Error(t, s.SetOrderDeliveryInstructions(ctx, orderID, strPtr("throw_over_fence"), nil),
		"an unknown handover")

	// 250 code points that are 1,000 BYTES: the limit is characters as a person counts them.
	require.NoError(t, s.SetOrderDeliveryInstructions(ctx, orderID, nil, strPtr(strings.Repeat("🚪", 250))))

	h, _ := orderInstructions(t, pool, orderID)
	require.Nil(t, h, "a refused write leaves nothing behind")
}

// ⚠ SPEC US4 / SC-005. The address the order was delivered to is edited and then deleted. The order
// does not move, because it never referenced the address's default in the first place.
func TestDeliveryInstructions_EditingOrDeletingTheAddressMovesNoPlacedOrder(t *testing.T) {
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	w := seedStorageWorld(t, pool)
	s := NewStore(pool)
	ctx := context.Background()

	var addressID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.customer_address
		   (customer_id, recipient_name, line1, city, postal_code, default_delivery_handover, default_delivery_note)
		 VALUES ($1::uuid, 'Pat', '1 Test St', 'Carlton', '3053', 'leave_at_door', 'Saved default')
		 RETURNING id::text`, w.customerID).Scan(&addressID))

	orderID := placePendingOrder(t, pool, s, w)
	require.NoError(t, s.SetOrderDeliveryInstructions(ctx, orderID, strPtr("meet_at_door"), strPtr("For this order")))
	_, err := pool.Exec(ctx, `UPDATE public."order" SET status = 'paid' WHERE id = $1::uuid`, orderID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx,
		`UPDATE public.customer_address SET default_delivery_note = 'Edited later', default_delivery_handover = NULL
		  WHERE id = $1::uuid`, addressID)
	require.NoError(t, err)
	h, n := orderInstructions(t, pool, orderID)
	require.Equal(t, "meet_at_door", *h)
	require.Equal(t, "For this order", *n)

	_, err = pool.Exec(ctx, `DELETE FROM public.customer_address WHERE id = $1::uuid`, addressID)
	require.NoError(t, err)
	h, n = orderInstructions(t, pool, orderID)
	require.Equal(t, "meet_at_door", *h)
	require.Equal(t, "For this order", *n)
}
