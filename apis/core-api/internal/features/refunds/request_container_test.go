package refunds

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

// A customer asking for a refund (055 US3, T072).

func raise(msg string, items ...RequestItem) RaiseRequestInput {
	return RaiseRequestInput{OrderID: orderID, CustomerID: custID, Message: msg, Items: items}
}

// ⚠ THE PROPERTY THE WHOLE FEATURE RESTS ON: A REQUEST MOVES NO MONEY (FR-005r).
//
// A form that withdrew money on submission would let anyone refund their own order by describing a
// problem. This records an ASK; a person decides it, through the refund path with its own gate.
func TestRaiseRequest_MovesNoMoney(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)

	id, err := svc.RaiseRequest(context.Background(), raise("Two cartons were missing"))
	require.NoError(t, err)
	require.NotEmpty(t, id)

	require.Empty(t, gw.calls, "⚠ the payment provider must never be called by a request")

	var refunds int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.refund WHERE order_id = $1`, orderID).Scan(&refunds))
	require.Zero(t, refunds, "⚠ a request is not a refund — no row may be written to public.refund")
}

// ⚠ T068 / FR-005r4 — ONE OPEN REQUEST PER ORDER, enforced by the PARTIAL UNIQUE INDEX rather than a
// check-then-write. Two taps a few milliseconds apart slip straight between a SELECT and an INSERT,
// and the shopper would have raised the same complaint twice — doubling the queue staff work through.
func TestRaiseRequest_ASecondRequestIsRefusedAsAlreadyOpen(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	_, err := svc.RaiseRequest(ctx, raise("Two cartons were missing"))
	require.NoError(t, err)

	_, err = svc.RaiseRequest(ctx, raise("Actually three were missing"))
	require.ErrorIs(t, err, ErrRequestAlreadyOpen)

	var n int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM public.refund_request WHERE order_id = $1`, orderID).Scan(&n))
	require.Equal(t, 1, n)
}

// ⚠ AND THE SAME HOLDS UNDER A GENUINE RACE, which is the case a check-then-write would fail. The
// database refuses the second; nothing in application code has to be timed correctly.
func TestRaiseRequest_TwoSimultaneousTapsRaiseOneRequest(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})

	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = svc.RaiseRequest(context.Background(), raise("Two cartons were missing"))
		}(i)
	}
	wg.Wait()

	won := 0
	for i, err := range errs {
		switch {
		case err == nil:
			won++
		case err == ErrRequestAlreadyOpen:
		default:
			require.NoError(t, err, "attempt %d failed for an unexpected reason", i)
		}
	}
	require.Equal(t, 1, won, "exactly one of eight simultaneous taps may record a request")

	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM public.refund_request WHERE order_id = $1`, orderID).Scan(&n))
	require.Equal(t, 1, n)
}

// ⚠ ONCE ANSWERED, A SHOPPER MAY ASK AGAIN. The index is partial for exactly this reason: it
// constrains only OPEN requests. A unique index on the order alone would mean a customer whose first
// complaint was declined could never raise a second one, however wrong the decision was.
func TestRaiseRequest_MayBeRaisedAgainOnceTheFirstIsDecided(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)
	svc := NewService(repo, &recordingGateway{})
	ctx := context.Background()

	_, err := svc.RaiseRequest(ctx, raise("Two cartons were missing"))
	require.NoError(t, err)

	var id string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT id::text FROM public.refund_request WHERE order_id = $1`, orderID).Scan(&id))
	require.NoError(t, repo.DecideRequest(ctx, id, "declined", "the photo shows all six", "staff-1"))

	_, err = svc.RaiseRequest(ctx, raise("I've attached a clearer photo"))
	require.NoError(t, err, "a decided request must not bar a second ask")
}

// ⚠ FR-016 — "NOT YOURS" AND "NO SUCH ORDER" ARE THE SAME REFUSAL, because the ownership term lives
// inside the INSERT's own SELECT rather than being a second question.
func TestRaiseRequest_NotYoursAndNoSuchOrderAreIndistinguishable(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	notYours := raise("Give me a refund")
	notYours.CustomerID = "99999999-9999-4999-8999-999999999999"
	noSuch := raise("Give me a refund")
	noSuch.OrderID = "88888888-8888-4888-8888-888888888888"

	_, a := svc.RaiseRequest(ctx, notYours)
	_, b := svc.RaiseRequest(ctx, noSuch)
	require.ErrorIs(t, a, ErrOrderNotFound)
	require.ErrorIs(t, b, ErrOrderNotFound)
	require.Equal(t, a.Error(), b.Error(), "byte-identical, or the refusal enumerates real order ids")
}

// ⚠ A NAMED LINE MUST BELONG TO THE ORDER. Without the join a caller could name ANY order item id —
// somebody else's — and have it recorded against their own request.
func TestRaiseRequest_IgnoresLinesThatBelongToAnotherOrder(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	id, err := svc.RaiseRequest(ctx, raise("The milk was warm",
		RequestItem{OrderItemID: "77777777-7777-4777-8777-777777777777", Quantity: 1}))
	require.NoError(t, err, "an unknown line must not fail the whole request")

	var items int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM public.refund_request_item WHERE request_id = $1`, id).Scan(&items))
	require.Zero(t, items, "a line from another order must not be recorded")
}

// ⚠ A request with nothing in it cannot be acted on. There is no MINIMUM LENGTH though — "Two
// cartons were missing" is a complete complaint, and a minimum would make a shopper pad an accurate
// sentence to satisfy a form.
func TestRaiseRequest_RefusesAnEmptyMessageButNotAShortOne(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	_, err := svc.RaiseRequest(ctx, raise("   \n\t  "))
	require.ErrorIs(t, err, ErrMessageRequired)

	_, err = svc.RaiseRequest(ctx, raise("Milk warm"))
	require.NoError(t, err, "a short but complete complaint is a valid one")
}

// ⚠ A very long message is TRUNCATED, not refused. Losing a shopper's complaint because they wrote
// too much would be the worst possible way to handle it.
func TestRaiseRequest_TruncatesRatherThanRefusingALongMessage(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})

	id, err := svc.RaiseRequest(context.Background(), raise(strings.Repeat("a", maxRequestMessage+500)))
	require.NoError(t, err)

	var stored string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT message FROM public.refund_request WHERE id = $1`, id).Scan(&stored))
	require.Len(t, stored, maxRequestMessage)
}

// ⚠ FR-005r2 — ISSUING A REFUND ANSWERS THE ASK. Without this the request stays open forever: a queue
// item nobody can close, and a shopper who is never told the outcome of what they raised.
func TestIssue_ClosesTheOrdersOpenRequest(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	_, err := svc.RaiseRequest(ctx, raise("Two cartons were missing"))
	require.NoError(t, err)

	_, err = svc.Issue(ctx, IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "two cartons short", Amount: "20.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)

	var status string
	var decidedBy *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, decided_by FROM public.refund_request WHERE order_id = $1`, orderID).
		Scan(&status, &decidedBy))
	require.Equal(t, "refunded", status)
	require.NotNil(t, decidedBy)
	require.Equal(t, "staff-1", *decidedBy, "the record must say who answered it")
}

// ⚠ MOST REFUNDS HAVE NO REQUEST AT ALL — the platform proposes them from shortfalls (FR-004a).
// Failing a refund because nobody asked for it would be absurd.
func TestIssue_SucceedsWhenThereIsNoOpenRequest(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})

	_, err := svc.Issue(context.Background(), IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)
}

// ⚠ A SECOND DECISION MUST NOT OVERWRITE THE FIRST. Two staff clearing the same queue must not be
// able to turn a decline into a refund by clicking later.
func TestDecideRequest_IsRefusedOnceAlreadyDecided(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)
	svc := NewService(repo, &recordingGateway{})
	ctx := context.Background()

	_, err := svc.RaiseRequest(ctx, raise("Two cartons were missing"))
	require.NoError(t, err)
	var id string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT id::text FROM public.refund_request WHERE order_id = $1`, orderID).Scan(&id))

	require.NoError(t, repo.DecideRequest(ctx, id, "declined", "the photo shows all six", "staff-1"))
	require.ErrorIs(t,
		repo.DecideRequest(ctx, id, "refunded", "changed my mind", "staff-2"),
		ErrRequestNotFound)

	var status, decidedBy string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, decided_by FROM public.refund_request WHERE id = $1`, id).Scan(&status, &decidedBy))
	require.Equal(t, "declined", status)
	require.Equal(t, "staff-1", decidedBy, "the first decision and its author stand")
}
