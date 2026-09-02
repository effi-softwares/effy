package refunds

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// Cancelling an order (055 US2, T051–T053).

// seedFulfillment gives the order ANOTHER shop's portion, in the given state.
//
// ⚠ A NEW SHOP EACH TIME, because `shop_fulfillment` is UNIQUE on (order, shop) — one portion per shop
// per order is the 019 fan-out's own invariant, and applying the real migrations is what made the
// fixture admit it. A two-portion order is genuinely a two-SHOP order.
func seedFulfillment(t *testing.T, pool *pgxpool.Pool, status string) string {
	t.Helper()
	ctx := context.Background()
	var shop string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop (id, code, name)
		 VALUES (gen_random_uuid(), 'S' || substr(gen_random_uuid()::text, 1, 8), 'Test Shop')
		 RETURNING id::text`).Scan(&shop))
	var id string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status)
		 VALUES ($1,$2,1,10,$3) RETURNING id::text`, orderID, shop, status).Scan(&id))
	return id
}

func orderStatus(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	var s string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status FROM public."order" WHERE id = $1`, orderID).Scan(&s))
	return s
}

func customerCancel() CancelInput {
	return CancelInput{OrderID: orderID, CustomerID: custID, ActorKind: "customer", ActorSub: custID}
}

func staffCancel() CancelInput {
	return CancelInput{OrderID: orderID, ActorKind: "back_office", ActorSub: "staff-1"}
}

// ⚠ CANCELLATION *IS* A FULL REFUND (research R3). `CaptureMethod: automatic` means the money was
// captured the moment the order was paid, so the provider's cancel operation never applies to an Effy
// order. There is no free cancellation on this platform — there is only returning money already taken.
func TestCancel_ReturnsTheWholeAmountIncludingDelivery(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)

	res, err := svc.Cancel(context.Background(), customerCancel())
	require.NoError(t, err)
	require.Equal(t, "50.00", res.Amount,
		"⚠ the WHOLE amount — unlike a partial refund, which keeps the delivery fee because the delivery happened")
	require.Equal(t, StatusSubmitted, res.Status)
	require.Equal(t, int64(5000), gw.calls[0].AmountCents)

	// ⚠ FIRST WRITER OF `canceled`. The CHECK has permitted it since 019 and nothing ever wrote it.
	require.Equal(t, "canceled", orderStatus(t, pool))

	// The refund names the cancellation for what it is, not "goodwill".
	var kind, reason string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT kind, reason FROM public.refund WHERE order_id = $1`, orderID).Scan(&kind, &reason))
	require.Equal(t, "cancellation", kind)
	require.Equal(t, "order_cancelled", reason)
}

// ⚠ FR-014. Nobody may be left picking an order that is no longer wanted.
func TestCancel_WithdrawsEveryShopPortionAndRecordsIt(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	a := seedFulfillment(t, pool, "pending")
	b := seedFulfillment(t, pool, "pending")
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	_, err := svc.Cancel(ctx, customerCancel())
	require.NoError(t, err)

	for _, id := range []string{a, b} {
		var status string
		require.NoError(t, pool.QueryRow(ctx,
			`SELECT status FROM public.shop_fulfillment WHERE id = $1`, id).Scan(&status))
		// ⚠ `withdrawn`, NOT `unfulfillable`. The shop did not fail to supply anything — the order was
		// called off. Conflating them tells a shop it failed at something nobody ever wanted, and makes
		// shop-reliability reporting count cancellations as shop failures.
		require.Equal(t, "withdrawn", status)

		var events int
		var from, to string
		require.NoError(t, pool.QueryRow(ctx,
			`SELECT count(*), coalesce(max(from_status),''), coalesce(max(to_status),'')
			   FROM public.fulfillment_event
			  WHERE shop_fulfillment_id = $1 AND event_type = 'state_changed'`, id).
			Scan(&events, &from, &to))
		require.Equal(t, 1, events, "a portion that changes state with no event is a change nobody can account for")
		require.Equal(t, "pending", from, "the event must say where the portion came FROM")
		require.Equal(t, "withdrawn", to)
	}
}

// ⚠ T051 / FR-017 — CANCELLING AND BEING PICKED ARE MUTUALLY EXCLUSIVE, and the mechanism is a guarded
// transition under a row lock, not a check followed by a write. Two simultaneous cancels must refund
// once and cancel once.
func TestCancel_TwoSimultaneousCancelsRefundOnceAndCancelOnce(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)

	// ⚠ The barrier goes BEFORE the lock. Two goroutines racing this finish fast enough to serialise by
	// accident, so without it the proof passes with the lock removed — a green test demonstrating
	// nothing. Holding them AFTER the lock deadlocks instead. (Same reasoning as the ceiling proof.)
	var arrived sync.WaitGroup
	arrived.Add(2)
	release := make(chan struct{})
	beforeLock = func() {
		arrived.Done()
		<-release
	}
	t.Cleanup(func() { beforeLock = nil })

	var wg sync.WaitGroup
	results := make([]CancelResult, 2)
	errs := make([]error, 2)
	// ⚠ One customer, one staff member, at the same moment — the realistic race: a shopper taps cancel
	// while somebody at Effy cancels the same order on the phone.
	inputs := []CancelInput{customerCancel(), staffCancel()}
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = svc.Cancel(context.Background(), inputs[i])
		}(i)
	}
	arrived.Wait()
	close(release)
	wg.Wait()

	// ⚠ EXACTLY ONE WINS AND THE OTHER IS TOLD IT WAS ALREADY DONE — which the handler turns into a 200,
	// so neither person sees a failure. What must never happen is BOTH succeeding (two refunds) or
	// either seeing some other error (a lock contention leaking to a shopper as "something went wrong").
	won := 0
	for i, err := range errs {
		switch {
		case err == nil:
			won++
		case errors.Is(err, ErrAlreadyCancelled):
			// The honest answer to "cancel this" when it is already cancelled.
		default:
			require.NoError(t, err, "attempt %d failed for an unexpected reason", i)
		}
	}
	require.Equal(t, 1, won, "exactly one cancellation may take effect")
	require.Equal(t, "canceled", orderStatus(t, pool))

	var refunds int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.refund WHERE order_id = $1`, orderID).Scan(&refunds))
	require.Equal(t, 1, refunds, "⚠ ONE refund — the cancellation key is stable per ORDER, not per actor")
	require.LessOrEqual(t, len(gw.calls), 1, "and the provider is asked at most once")
}

// ⚠ FR-012 / A2 — THE CUSTOMER'S WINDOW CLOSES WHEN *ANY* SHOP BEGINS, not when all have.
func TestCancel_ACustomerCannotCancelOnceAnyShopHasBegun(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	seedFulfillment(t, pool, "picking")
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)

	_, err := svc.Cancel(context.Background(), customerCancel())
	require.ErrorIs(t, err, ErrNotCancellable)
	require.Equal(t, "paid", orderStatus(t, pool), "a refused cancel changes nothing")
	require.Empty(t, gw.calls, "and no money is touched")
}

// ⚠ T052 / FR-018 — STAFF CAN, BECAUSE A PHONE CALL ARRIVES AFTER THE CUSTOMER'S CONTROL HAS CLOSED.
func TestCancel_StaffMayCancelAnOrderTheCustomerNoLongerCan(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "picking")
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	require.ErrorIs(t, mustErr(svc.Cancel(ctx, customerCancel())), ErrNotCancellable)

	res, err := svc.Cancel(ctx, staffCancel())
	require.NoError(t, err, "staff have no before-picking limit")
	require.Equal(t, "50.00", res.Amount)
	require.Equal(t, "canceled", orderStatus(t, pool))
}

// ⚠ NOT AFTER COLLECTION, EVEN FOR STAFF. The goods have left the shop and somebody is carrying them;
// cancelling would refund an order that is about to arrive.
func TestCancel_NobodyMayCancelOnceThePackageHasLeftTheShop(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "collected")
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	require.ErrorIs(t, mustErr(svc.Cancel(ctx, customerCancel())), ErrNotCancellable)
	require.ErrorIs(t, mustErr(svc.Cancel(ctx, staffCancel())), ErrNotCancellable,
		"staff's wider window still stops at the shop door")
	require.Equal(t, "paid", orderStatus(t, pool))
}

// ⚠ T053 / FR-016 — "NOT YOURS" AND "NO SUCH ORDER" MUST BE THE SAME REFUSAL, or the route is an
// oracle for which order ids are real. It holds because the ownership term is inside the same
// predicate as the lookup, not a second question.
func TestCancel_NotYoursAndNoSuchOrderAreTheSameRefusal(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	// Somebody else's order.
	notYours := CancelInput{
		OrderID: orderID, CustomerID: "99999999-9999-4999-8999-999999999999",
		ActorKind: "customer", ActorSub: "someone-else",
	}
	// An order that does not exist.
	noSuch := CancelInput{
		OrderID: "88888888-8888-4888-8888-888888888888", CustomerID: custID,
		ActorKind: "customer", ActorSub: custID,
	}

	a := mustErr(svc.Cancel(ctx, notYours))
	b := mustErr(svc.Cancel(ctx, noSuch))
	require.ErrorIs(t, a, ErrOrderNotFound)
	require.ErrorIs(t, b, ErrOrderNotFound)
	require.Equal(t, a.Error(), b.Error(),
		"byte-identical, or the refusal tells an attacker which ids exist")
	require.Equal(t, "paid", orderStatus(t, pool), "and neither touched the order")
}

// ⚠ A second cancel is a SUCCESS that changed nothing. A double-tap must not look like a failure, or
// the shopper taps again — and the order genuinely is cancelled, which is what they asked for.
func TestCancel_ASecondCancelIsIdempotent(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)
	ctx := context.Background()

	_, err := svc.Cancel(ctx, customerCancel())
	require.NoError(t, err)
	require.ErrorIs(t, mustErr(svc.Cancel(ctx, customerCancel())), ErrAlreadyCancelled)
	require.Len(t, gw.calls, 1, "the provider is asked once")
}

// ⚠ An order with a partial refund already against it must return only what REMAINS. Returning the
// full total would try to hand back more than was ever taken.
func TestCancel_ReturnsOnlyWhatRemainsAfterAnEarlierRefund(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	seedFulfillment(t, pool, "pending")
	repo := NewRepository(pool)
	gw := &recordingGateway{}
	svc := NewService(repo, gw)
	ctx := context.Background()

	_, err := svc.Issue(ctx, IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late", Amount: "20.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)

	res, err := svc.Cancel(ctx, staffCancel())
	require.NoError(t, err)
	require.Equal(t, "30.00", res.Amount, "$50 paid, $20 already returned")
}

func mustErr(_ CancelResult, err error) error { return err }
