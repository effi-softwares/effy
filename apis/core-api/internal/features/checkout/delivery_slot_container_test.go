package checkout

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// 069 — same-day slots and standard days, against the REAL migrations and the REAL dev delivery seed.
//
// ⚠ THESE CANNOT BE UNIT TESTS. The capacity guarantee is a row lock; "a booking counts" is a view;
// the all-or-none window rule is a CHECK; and whether a shop's ready-by moved is a fact about a
// statement in the finalize transaction. A fake store proves none of them — and 063 recorded six
// column names that typechecked perfectly and failed only when a query ran.
//
// ⚠ WHY THE STORE TESTS USE THE REAL CLOCK. `delivery_slot_load` compares `held_until` with the
// DATABASE's now(), so a test that froze time in Go would hold places the database already considers
// lapsed. The fixtures are therefore built to be open at any time of day: one collection run at 23:57
// with no buffer and no turnaround, and slots that start at 23:58. The quote-level tests, which hold
// nothing, pass a fixed instant instead.

// alwaysOpenDelivery loads the dev delivery seed, then bends the schedule so a slot starting at 23:58
// is collectable all day.
func alwaysOpenDelivery(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	seed, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "db", "seeds", "047_delivery_dev.sql"))
	require.NoError(t, err, "the dev delivery seed")
	_, err = pool.Exec(ctx, string(seed))
	require.NoError(t, err, "applying the dev delivery seed")

	_, err = pool.Exec(ctx, `
		UPDATE public.delivery_settings SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0;
		DELETE FROM public.delivery_collection_run;
		INSERT INTO public.delivery_collection_run (run_time, label, status, updated_by)
		VALUES ('23:57', 'Late run', 'active', 'test');`)
	require.NoError(t, err)

	if h, m, _ := time.Now().In(delivery.MelbourneTZ).Clock(); h == 23 && m >= 56 {
		t.Skip("within four minutes of Melbourne midnight: the always-open fixture is about to close")
	}
}

func addSlot(t *testing.T, pool *pgxpool.Pool, start, end, cutoff string, capacity int) string {
	t.Helper()
	var id string
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
		VALUES ($1::time, $2::time, $3::time, $4, 'test') RETURNING id::text`,
		start, end, cutoff, capacity).Scan(&id))
	return id
}

// openSlot is a slot that can be chosen right now, whatever the time of day.
func openSlot(t *testing.T, pool *pgxpool.Pool, capacity int) string {
	return addSlot(t, pool, "23:58", "23:59", "23:58", capacity)
}

// pendingOrderFor creates a fresh customer with one product in the cart and writes their pending order.
func pendingOrderFor(t *testing.T, pool *pgxpool.Pool, s Store) (orderID string, w storageWorld) {
	t.Helper()
	w = seedStorageWorld(t, pool)
	seedCartProduct(t, pool, w, "Milk", "chilled")
	return placeFromCart(t, s, w), w
}

// holdSlot is what the intent call does for a same-day order: capture the package and hold the place.
func holdSlot(s Store, orderID, shopID, slotID string) (*time.Time, error) {
	now := time.Now()
	start, end := now.Add(time.Hour), now.Add(2*time.Hour)
	return s.CaptureDelivery(context.Background(), orderID, []byte(`{}`), now.Add(30*time.Minute),
		[]PackageDelivery{{
			ShopID: shopID, Method: delivery.MethodSameDay, FeeCents: 800,
			PromisedDay: delivery.MelbourneDate(now), SlotID: slotID, WindowStart: &start, WindowEnd: &end,
		}},
		&SlotHold{SlotID: slotID, Now: now})
}

func bookedToday(t *testing.T, pool *pgxpool.Pool, slotID string) int {
	t.Helper()
	load, err := delivery.SlotLoad(context.Background(), pool, delivery.MelbourneDate(time.Now()))
	require.NoError(t, err)
	return load[slotID]
}

type bookingRow struct {
	state        string
	overCapacity bool
	slotID       string
}

func bookingOf(t *testing.T, pool *pgxpool.Pool, orderID string) (bookingRow, bool) {
	t.Helper()
	var b bookingRow
	err := pool.QueryRow(context.Background(), `
		SELECT state, over_capacity, slot_id::text FROM public.delivery_slot_booking
		WHERE order_id = $1::uuid`, orderID).Scan(&b.state, &b.overCapacity, &b.slotID)
	if err != nil {
		return bookingRow{}, false
	}
	return b, true
}

func lapseHold(t *testing.T, pool *pgxpool.Pool, orderID string) {
	t.Helper()
	tag, err := pool.Exec(context.Background(), `
		UPDATE public.delivery_slot_booking SET held_until = now() - interval '1 minute'
		WHERE order_id = $1::uuid AND state = 'held'`, orderID)
	require.NoError(t, err)
	require.EqualValues(t, 1, tag.RowsAffected(), "there must be a hold to lapse")
}

func slotWorld(t *testing.T) (*pgxpool.Pool, Store) {
	t.Helper()
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	alwaysOpenDelivery(t, pool)
	return pool, NewStore(pool)
}

// ── The hold ────────────────────────────────────────────────────────────────────────────────────────

func TestSlot_AnIntentHoldsAPlaceAndRecordsTheWindowAsSold(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 2)
	orderID, w := pendingOrderFor(t, pool, s)

	until, err := holdSlot(s, orderID, w.shopID, slotID)
	require.NoError(t, err)
	require.NotNil(t, until)
	require.WithinDuration(t, time.Now().Add(10*time.Minute), *until, 5*time.Second, "the default hold is ten minutes")

	b, ok := bookingOf(t, pool, orderID)
	require.True(t, ok)
	require.Equal(t, "held", b.state)
	require.Equal(t, 1, bookedToday(t, pool, slotID))

	var slot, day *string
	var hasWindow bool
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT slot_id::text, promised_from::text, window_start IS NOT NULL AND window_end IS NOT NULL
		FROM public.order_package_delivery WHERE order_id = $1::uuid`, orderID).Scan(&slot, &day, &hasWindow))
	require.Equal(t, slotID, *slot)
	require.Equal(t, delivery.MelbourneDate(time.Now()), *day, "the delivery day is written (research R1)")
	require.True(t, hasWindow)
}

// ⚠ SC-002 — THE REASON THE ROW LOCK EXISTS. Twenty customers reach the payment step at once for a slot
// that takes three. Exactly three hold a place. Remove `FOR UPDATE` from delivery.LockSlot and every
// one of them reads "room left" before any has written, and far more than three get in (NP1).
func TestSlot_TwentyCustomersAtOnceNeverExceedCapacity(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 3)

	type cust struct{ orderID, shopID string }
	custs := make([]cust, 20)
	for i := range custs {
		orderID, w := pendingOrderFor(t, pool, s)
		custs[i] = cust{orderID, w.shopID}
	}

	var wg sync.WaitGroup
	errs := make([]error, len(custs))
	start := make(chan struct{})
	for i, c := range custs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, errs[i] = holdSlot(s, c.orderID, c.shopID, slotID)
		}()
	}
	close(start)
	wg.Wait()

	held, refused := 0, 0
	for _, err := range errs {
		var gone *SlotUnavailableError
		switch {
		case err == nil:
			held++
		case errors.As(err, &gone):
			require.Equal(t, delivery.SlotFull, gone.Verdict)
			refused++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	require.Equal(t, 3, held, "exactly the slot's capacity may hold a place")
	require.Equal(t, 17, refused)
	require.Equal(t, 3, bookedToday(t, pool, slotID))
}

func TestSlot_ARefusedHoldWritesNothingAndKeepsThePreviousCapture(t *testing.T) {
	pool, s := slotWorld(t)
	roomy, full := openSlot(t, pool, 5), addSlot(t, pool, "23:58", "23:59:30", "23:58", 1)

	other, ow := pendingOrderFor(t, pool, s)
	_, err := holdSlot(s, other, ow.shopID, full)
	require.NoError(t, err)

	orderID, w := pendingOrderFor(t, pool, s)
	_, err = holdSlot(s, orderID, w.shopID, roomy)
	require.NoError(t, err)

	// The customer changes their mind to the full slot: refused, and the place they HAD is still theirs.
	_, err = holdSlot(s, orderID, w.shopID, full)
	var gone *SlotUnavailableError
	require.ErrorAs(t, err, &gone)

	b, ok := bookingOf(t, pool, orderID)
	require.True(t, ok, "the earlier hold survives a refused change")
	require.Equal(t, roomy, b.slotID)
	require.Equal(t, 1, bookedToday(t, pool, full))
}

// ⚠ NP2. A hold that lapses unpaid frees its place — with no sweeper: it simply stops counting.
func TestSlot_ALapsedHoldStopsCounting(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 1)

	first, fw := pendingOrderFor(t, pool, s)
	_, err := holdSlot(s, first, fw.shopID, slotID)
	require.NoError(t, err)

	second, sw := pendingOrderFor(t, pool, s)
	_, err = holdSlot(s, second, sw.shopID, slotID)
	require.Error(t, err, "the slot is full while the first hold is live")

	lapseHold(t, pool, first)
	require.Equal(t, 0, bookedToday(t, pool, slotID))

	_, err = holdSlot(s, second, sw.shopID, slotID)
	require.NoError(t, err, "an abandoned hold frees its place")
}

func TestSlot_OneOrderNeverHoldsTwoPlaces(t *testing.T) {
	pool, s := slotWorld(t)
	a, b := openSlot(t, pool, 1), addSlot(t, pool, "23:58", "23:59:30", "23:58", 1)
	orderID, w := pendingOrderFor(t, pool, s)

	// Refreshing the payment step in a capacity-1 slot must not be refused by the order's own hold.
	for i := 0; i < 3; i++ {
		_, err := holdSlot(s, orderID, w.shopID, a)
		require.NoError(t, err, "refresh %d", i)
	}
	require.Equal(t, 1, bookedToday(t, pool, a))

	// Changing slot MOVES the place.
	_, err := holdSlot(s, orderID, w.shopID, b)
	require.NoError(t, err)
	require.Equal(t, 0, bookedToday(t, pool, a))
	require.Equal(t, 1, bookedToday(t, pool, b))

	// Switching to standard gives it up altogether.
	_, err = s.CaptureDelivery(context.Background(), orderID, []byte(`{}`), time.Now().Add(time.Hour),
		[]PackageDelivery{{ShopID: w.shopID, Method: delivery.MethodStandard, FeeCents: 500, PromisedDay: "2030-01-02"}}, nil)
	require.NoError(t, err)
	_, has := bookingOf(t, pool, orderID)
	require.False(t, has)
	require.Equal(t, 0, bookedToday(t, pool, b))
}

func TestSlot_ADisabledOrClosedSlotCannotBeHeld(t *testing.T) {
	pool, s := slotWorld(t)
	orderID, w := pendingOrderFor(t, pool, s)

	disabled := openSlot(t, pool, 5)
	_, err := pool.Exec(context.Background(), `UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1::uuid`, disabled)
	require.NoError(t, err)
	_, err = holdSlot(s, orderID, w.shopID, disabled)
	var gone *SlotUnavailableError
	require.ErrorAs(t, err, &gone)

	// 00:00–00:01 with a midnight cutoff has been closed since the first minute of the day.
	closed := addSlot(t, pool, "00:00", "00:01", "00:00", 5)
	if h, m, _ := time.Now().In(delivery.MelbourneTZ).Clock(); h == 0 && m == 0 {
		t.Skip("the first minute of the Melbourne day: the 'closed' fixture is open")
	}
	_, err = holdSlot(s, orderID, w.shopID, closed)
	require.ErrorAs(t, err, &gone)
	require.Equal(t, delivery.SlotPastCutoff, gone.Verdict)

	_, has := bookingOf(t, pool, orderID)
	require.False(t, has, "a refusal holds nothing")
}

// The CHECK on order_package_delivery: a window belongs to a same-day package or to nothing.
func TestSlot_TheDatabaseRefusesAWindowOnAStandardPackage(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 5)
	orderID, w := pendingOrderFor(t, pool, s)
	now := time.Now()
	end := now.Add(time.Hour)

	_, err := s.CaptureDelivery(context.Background(), orderID, []byte(`{}`), now.Add(time.Hour),
		[]PackageDelivery{{ShopID: w.shopID, Method: delivery.MethodStandard, FeeCents: 500,
			PromisedDay: "2030-01-02", SlotID: slotID, WindowStart: &now, WindowEnd: &end}}, nil)
	require.Error(t, err)
	require.Contains(t, err.Error(), "order_package_delivery_window_ck")
}

// ── Payment ─────────────────────────────────────────────────────────────────────────────────────────

func TestSlot_PaymentWithinTheHoldConfirmsThePlace(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 1)
	orderID, w := pendingOrderFor(t, pool, s)
	_, err := holdSlot(s, orderID, w.shopID, slotID)
	require.NoError(t, err)

	out, err := s.FinalizeSucceeded(context.Background(), orderID)
	require.NoError(t, err)
	require.True(t, out.SlotConfirmed)
	require.False(t, out.SlotOverCapacity)

	b, _ := bookingOf(t, pool, orderID)
	require.Equal(t, "confirmed", b.state)
	require.False(t, b.overCapacity)
	require.Equal(t, 1, bookedToday(t, pool, slotID), "a confirmed booking counts with no hold behind it")

	// A redelivered webhook changes nothing.
	out, err = s.FinalizeSucceeded(context.Background(), orderID)
	require.NoError(t, err)
	require.False(t, out.SlotConfirmed, "the second delivery of the event confirmed nothing")
	require.Equal(t, 1, bookedToday(t, pool, slotID))
}

func TestSlot_ALatePayerWithRoomLeftIsConfirmedAndNotFlagged(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 2)
	orderID, w := pendingOrderFor(t, pool, s)
	_, err := holdSlot(s, orderID, w.shopID, slotID)
	require.NoError(t, err)
	lapseHold(t, pool, orderID)

	out, err := s.FinalizeSucceeded(context.Background(), orderID)
	require.NoError(t, err)
	require.True(t, out.SlotConfirmed)
	require.False(t, out.SlotOverCapacity)
}

// ⚠ FR-009b. The hold lapsed, someone else took the last place, and then the first customer's payment
// landed. They PAID for this window: the order keeps it, and staff are told. It is never moved and
// never refunded by the platform.
func TestSlot_ALatePayerIntoAFullSlotIsHonouredAndFlagged(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 1)

	late, lw := pendingOrderFor(t, pool, s)
	_, err := holdSlot(s, late, lw.shopID, slotID)
	require.NoError(t, err)
	lapseHold(t, pool, late)

	other, ow := pendingOrderFor(t, pool, s)
	_, err = holdSlot(s, other, ow.shopID, slotID)
	require.NoError(t, err, "the lapsed place was offered again")

	out, err := s.FinalizeSucceeded(context.Background(), late)
	require.NoError(t, err)
	require.True(t, out.SlotConfirmed)
	require.True(t, out.SlotOverCapacity)

	b, _ := bookingOf(t, pool, late)
	require.Equal(t, "confirmed", b.state)
	require.True(t, b.overCapacity)
	require.Equal(t, slotID, b.slotID, "the order keeps the slot the customer chose")

	var status string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status FROM public."order" WHERE id = $1::uuid`, late).Scan(&status))
	require.Equal(t, "paid", status)

	var over int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT over_capacity FROM public.delivery_slot_load WHERE slot_id = $1::uuid`, slotID).Scan(&over))
	require.Equal(t, 1, over, "the console's count of late payers")
}

func TestSlot_AStandardOrderFinalizesWithNoBooking(t *testing.T) {
	pool, s := slotWorld(t)
	orderID, w := pendingOrderFor(t, pool, s)
	_, err := s.CaptureDelivery(context.Background(), orderID, []byte(`{}`), time.Now().Add(time.Hour),
		[]PackageDelivery{{ShopID: w.shopID, Method: delivery.MethodStandard, FeeCents: 500, PromisedDay: "2030-01-02"}}, nil)
	require.NoError(t, err)

	out, err := s.FinalizeSucceeded(context.Background(), orderID)
	require.NoError(t, err)
	require.False(t, out.SlotConfirmed)
}

// ── The shop's ready-by (research R2) ───────────────────────────────────────────────────────────────

// ⚠ NP3. Before 069 finalize copied `promised_to` into the shop's `promised_ready_at`, harmlessly,
// because nothing wrote `promised_to`. It is now the customer's DELIVERY DAY. If the copy came back a
// shop would be told an order for a day five days out is not due for five days — but a standard
// package waits at the hub, not at the shop.
func TestShopReadyBy_IsNotMovedToTheCustomersDeliveryDay(t *testing.T) {
	pool, s := slotWorld(t)
	orderID, w := pendingOrderFor(t, pool, s)
	day := time.Now().In(delivery.MelbourneTZ).AddDate(0, 0, 5).Format("2006-01-02")

	_, err := s.CaptureDelivery(context.Background(), orderID, []byte(`{}`), time.Now().Add(time.Hour),
		[]PackageDelivery{{ShopID: w.shopID, Method: delivery.MethodStandard, FeeCents: 500, PromisedDay: day}}, nil)
	require.NoError(t, err)
	_, err = s.FinalizeSucceeded(context.Background(), orderID)
	require.NoError(t, err)

	var promised *string
	var method *string
	var readyAt *time.Time
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT opd.promised_to::text, sf.delivery_method, sf.promised_ready_at
		FROM public.shop_fulfillment sf
		JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
		WHERE sf.order_id = $1::uuid`, orderID).Scan(&promised, &method, &readyAt))
	require.Equal(t, day, *promised, "the customer's day is recorded")
	require.Equal(t, "standard", *method, "the method is still copied to the portion")
	require.Nil(t, readyAt, "the shop's ready-by keeps its own rule — it is NOT the customer's delivery day")
}

// ── The quote, through the real quoter ──────────────────────────────────────────────────────────────

// quoteAt asks the real quoter at a fixed Melbourne wall-clock time on Monday 2026-08-24.
func quoteAt(t *testing.T, pool *pgxpool.Pool, customerID, postcode, shopID string, hour, min int) delivery.QuoteResult {
	t.Helper()
	now := time.Date(2026, 8, 24, hour, min, 0, 0, delivery.MelbourneTZ)
	q, err := delivery.NewQuoter(pool).Quote(context.Background(), customerID, postcode,
		[]delivery.PackageInput{{ShopID: shopID, Grams: 1500}}, now)
	require.NoError(t, err)
	return q
}

// realisticDelivery loads the dev seed as it ships: runs at 12:00, 16:00 and 21:00 with a two-hour prep
// buffer, and (from the 069 migration's defaults) a sixty-minute hub turnaround.
func realisticDelivery(t *testing.T) (*pgxpool.Pool, storageWorld) {
	t.Helper()
	pool := startPostgresForReceipts(t)
	applyAllMigrationsForStorageClass(t, pool)
	seed, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "db", "seeds", "047_delivery_dev.sql"))
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(), string(seed))
	require.NoError(t, err)
	return pool, seedStorageWorld(t, pool)
}

func TestQuote_OffersOpenSlotsAndOmitsClosedOnes(t *testing.T) {
	pool, w := realisticDelivery(t)
	evening := addSlot(t, pool, "17:00", "19:00", "15:00", 2) // served by the 16:00 run: order by 14:00
	late := addSlot(t, pool, "19:00", "21:00", "17:00", 2)    // also the 16:00 run
	addSlot(t, pool, "10:00", "12:00", "08:00", 2)            // closed by 09:00

	q := quoteAt(t, pool, w.customerID, "3121", w.shopID, 9, 0)

	require.Len(t, q.SameDaySlots, 2)
	require.Equal(t, evening, q.SameDaySlots[0].ID, "earliest first")
	require.Equal(t, late, q.SameDaySlots[1].ID)
	require.Empty(t, q.SameDayUnavailable)
	require.True(t, q.Packages[0].OffersSameDay())
	// ⚠ The slot says 15:00; the only run that serves it must be ordered by 14:00.
	require.Equal(t, 14, q.SameDaySlots[0].Cutoff.Hour())
	require.Equal(t, "2026-08-24", q.SameDaySlots[0].Date)
	require.NotNil(t, q.SameDayUntil)
}

func TestQuote_WithNoOpenSlotSameDayIsNotOfferedAndSaysWhy(t *testing.T) {
	pool, w := realisticDelivery(t)

	// No slot configured at all.
	q := quoteAt(t, pool, w.customerID, "3121", w.shopID, 9, 0)
	require.Empty(t, q.SameDaySlots)
	require.Equal(t, delivery.SameDaySlotsClosed, q.SameDayUnavailable)
	require.False(t, q.Packages[0].OffersSameDay(), "same-day without a window is not something the platform sells")
	require.Nil(t, q.SameDayUntil)

	// A slot exists but its cutoff has passed.
	addSlot(t, pool, "17:00", "19:00", "15:00", 2)
	q = quoteAt(t, pool, w.customerID, "3121", w.shopID, 15, 30)
	require.Empty(t, q.SameDaySlots)
	require.Equal(t, delivery.SameDaySlotsClosed, q.SameDayUnavailable)

	// A zone that does not do same-day says something different (FR-004).
	q = quoteAt(t, pool, w.customerID, "3030", w.shopID, 9, 0)
	require.Empty(t, q.SameDaySlots)
	require.Equal(t, delivery.SameDayNotEligible, q.SameDayUnavailable)
	require.NotEmpty(t, q.StandardDays, "standard is always offered to a served address (FR-020)")
}

func TestQuote_StandardDaysSkipNonDeliveryDaysWithoutCountingThem(t *testing.T) {
	pool, w := realisticDelivery(t)
	_, err := pool.Exec(context.Background(), `
		UPDATE public.delivery_settings SET standard_lookahead_days = 5, standard_no_delivery_weekdays = '{7}';
		INSERT INTO public.delivery_non_delivery_date (day, label, created_by) VALUES ('2026-08-26', 'Test closure', 'test');`)
	require.NoError(t, err)

	// Monday 09:00: collected today, delivered from Tuesday. Wednesday is closed, Sunday is excluded.
	q := quoteAt(t, pool, w.customerID, "3121", w.shopID, 9, 0)
	require.Equal(t, []string{"2026-08-25", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-31"}, q.StandardDays)
	require.True(t, q.HasStandardDay("2026-08-27"))
	require.False(t, q.HasStandardDay("2026-08-26"))
	require.False(t, q.HasStandardDay("2026-08-30"))

	// After the last run's order time (19:00) the order is collected tomorrow.
	q = quoteAt(t, pool, w.customerID, "3121", w.shopID, 19, 30)
	require.Equal(t, "2026-08-27", q.StandardDays[0], "Tuesday's collection, Wednesday closed → Thursday")
}

// A customer who reached the payment step in a capacity-1 slot and went back must still be offered
// the slot they are holding — their own hold is not counted against them.
func TestQuote_ACustomersOwnHoldIsNotCountedAgainstThem(t *testing.T) {
	pool, s := slotWorld(t)
	slotID := openSlot(t, pool, 1)
	orderID, w := pendingOrderFor(t, pool, s)
	_, err := holdSlot(s, orderID, w.shopID, slotID)
	require.NoError(t, err)

	pkgs := []delivery.PackageInput{{ShopID: w.shopID, Grams: 1500}}
	mine, err := delivery.NewQuoter(pool).Quote(context.Background(), w.customerID, "3121", pkgs, time.Now())
	require.NoError(t, err)
	require.Len(t, mine.SameDaySlots, 1, "the holder still sees their slot")

	stranger := seedStorageWorld(t, pool)
	theirs, err := delivery.NewQuoter(pool).Quote(context.Background(), stranger.customerID, "3121", pkgs, time.Now())
	require.NoError(t, err)
	require.Empty(t, theirs.SameDaySlots, "everyone else sees it as full")
	require.Equal(t, delivery.SameDaySlotsClosed, theirs.SameDayUnavailable)
}
