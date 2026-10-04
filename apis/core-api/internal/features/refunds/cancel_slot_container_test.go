package refunds

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// 069 FR-012 — cancelling a booked same-day order gives its place back.
//
// ⚠ Read through `delivery_slot_load`, the view checkout itself counts with. Asserting on the booking
// row's state alone would prove a column changed; this proves the place is OFFERED again.

func seedSlotBooking(t *testing.T, pool *pgxpool.Pool, state string) string {
	t.Helper()
	ctx := context.Background()
	var slotID string
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
		VALUES ('17:00', '19:00', '15:00', 1, 'test') RETURNING id::text`).Scan(&slotID))
	_, err := pool.Exec(ctx, `
		INSERT INTO public.delivery_slot_booking
		    (slot_id, delivery_date, order_id, state, held_until, window_start, window_end)
		VALUES ($1::uuid, (now() AT TIME ZONE 'Australia/Melbourne')::date, $2::uuid, $3,
		        CASE WHEN $3 = 'held' THEN now() + interval '10 minutes' END,
		        now() + interval '1 hour', now() + interval '3 hours')`, slotID, orderID, state)
	require.NoError(t, err)
	return slotID
}

func slotBooked(t *testing.T, pool *pgxpool.Pool, slotID string) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT COALESCE((SELECT booked FROM public.delivery_slot_load WHERE slot_id = $1::uuid), 0)`, slotID).Scan(&n))
	return n
}

func TestCancel_FreesTheOrdersSameDayPlace(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	slotID := seedSlotBooking(t, pool, "confirmed")
	require.Equal(t, 1, slotBooked(t, pool, slotID))

	svc := NewService(NewRepository(pool), &recordingGateway{})
	_, err := svc.Cancel(context.Background(), customerCancel())
	require.NoError(t, err)

	require.Equal(t, 0, slotBooked(t, pool, slotID), "the place is offered to the next customer")
	var state string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT state FROM public.delivery_slot_booking WHERE order_id = $1`, orderID).Scan(&state))
	require.Equal(t, "released", state, "kept as a record, not deleted")
}

func TestCancel_ARefusedCancelKeepsThePlace(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "collected") // already left the shop: nobody may cancel
	slotID := seedSlotBooking(t, pool, "confirmed")

	svc := NewService(NewRepository(pool), &recordingGateway{})
	_, err := svc.Cancel(context.Background(), staffCancel())
	require.ErrorIs(t, err, ErrNotCancellable)
	require.Equal(t, 1, slotBooked(t, pool, slotID))
}

func TestCancel_AnOrderWithNoBookingCancelsAsBefore(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")

	svc := NewService(NewRepository(pool), &recordingGateway{})
	_, err := svc.Cancel(context.Background(), customerCancel())
	require.NoError(t, err)
	require.Equal(t, "canceled", orderStatus(t, pool))
}
