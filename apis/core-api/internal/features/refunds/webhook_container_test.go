package refunds

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
)

// The provider's side of a refund's life (055 US4, T039–T042).
//
// ⚠ CONTAINER-BACKED, BECAUSE THE THING UNDER TEST IS SQL. The settle is a guarded UPDATE
// (`status IN ('submitting','submitted')`) — the guard is what makes a redelivery change state at most
// once, and a fake repository cannot have that guard wrong.

func refundEvent(id string, status checkout.RefundStatus, reason string) checkout.WebhookEvent {
	return checkout.WebhookEvent{
		ID: "evt_" + id, Type: "refund.updated", RefundID: id,
		RefundStatus: status, FailureReason: reason,
		RefundAmountCents: 1000, RefundPaymentIntentID: "pi_test",
	}
}

// issueOne puts a real, submitted refund in the database and returns its ids.
func issueOne(t *testing.T, pool *pgxpool.Pool, providerID string) string {
	t.Helper()
	gw := &recordingGateway{refundID: providerID}
	svc := NewService(NewRepository(pool), gw)
	res, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)
	require.Equal(t, "submitted", res.Status,
		"⚠ `submitted`, never `refunded` — the provider has it, the bank has not moved anything")
	return res.RefundID
}

func statusOf(t *testing.T, pool *pgxpool.Pool, refundID string) (string, *string) {
	t.Helper()
	var status string
	var failure *string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status, failure_reason FROM public.refund WHERE id = $1`, refundID).
		Scan(&status, &failure))
	return status, failure
}

// ⚠ THE DEFECT US4 EXISTS FOR. The provider accepting a refund is not the bank moving money, and a
// platform that conflates them tells customers their money is on its way and never finds out it was
// wrong.
func TestSettle_ALaterSuccessIsWhatMakesTheMoneyRefunded(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	id := issueOne(t, pool, "re_ok")

	require.NoError(t, svc.HandleRefundEvent(context.Background(),
		refundEvent("re_ok", checkout.RefundSucceeded, "")))

	status, _ := statusOf(t, pool, id)
	require.Equal(t, "succeeded", status)
}

// ⚠ A LATER FAILURE MUST STOP THE ORDER CLAIMING THE MONEY WENT. Up to thirty days later.
func TestSettle_ALaterFailureClearsTheClaimAndKeepsTheReason(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	id := issueOne(t, pool, "re_bad")

	require.NoError(t, svc.HandleRefundEvent(context.Background(),
		refundEvent("re_bad", checkout.RefundFailed, "charge_for_pending_refund_disputed")))

	status, failure := statusOf(t, pool, id)
	require.Equal(t, "failed", status)
	require.NotNil(t, failure)
	require.Equal(t, "charge_for_pending_refund_disputed", *failure,
		"the provider's own words are the only clue why, and staff are the ones who act on it")
}

// ⚠ FR-010. The provider redelivers, and it sends `refund.updated` after `refund.failed` as a matter
// of course. Neither may move a terminal refund.
func TestSettle_IsIdempotentAndNeverReopensATerminalRefund(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	id := issueOne(t, pool, "re_dup")
	ctx := context.Background()

	require.NoError(t, svc.HandleRefundEvent(ctx, refundEvent("re_dup", checkout.RefundFailed, "expired_or_canceled_card")))
	// The same event again, and then a LATER-arriving success for the same refund.
	require.NoError(t, svc.HandleRefundEvent(ctx, refundEvent("re_dup", checkout.RefundFailed, "expired_or_canceled_card")))
	require.NoError(t, svc.HandleRefundEvent(ctx, refundEvent("re_dup", checkout.RefundSucceeded, "")))

	status, _ := statusOf(t, pool, id)
	require.Equal(t, "failed", status,
		"a terminal refund stays where it landed — the guard is in the WHERE clause, not in the caller")
}

// ⚠ `pending` IS NOT A SETTLEMENT. The provider still working means the platform's `submitted` is
// already the truth: on its way, not arrived.
func TestSettle_AnInProgressEventChangesNothing(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	id := issueOne(t, pool, "re_pending")

	for _, s := range []checkout.RefundStatus{checkout.RefundPending, checkout.RefundRequiresAction} {
		require.NoError(t, svc.HandleRefundEvent(context.Background(), refundEvent("re_pending", s, "")))
		status, _ := statusOf(t, pool, id)
		require.Equal(t, "submitted", status, "%s is the provider still working", s)
	}
}

// ⚠ FR-010 — RECORDED, NOT DISCARDED. Somebody in support returns money by hand in the provider's
// dashboard during an incident. Dropping the event leaves the order claiming money it no longer holds,
// the ceiling wrong, and the same money refundable a second time.
func TestSettle_ARefundIssuedOutsideThePlatformIsRecorded(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	require.NoError(t, svc.HandleRefundEvent(ctx, refundEvent("re_byhand", checkout.RefundSucceeded, "")))

	var kind, status, actorKind, note string
	var amount string
	var actorSub *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT kind, status, actor_kind, actor_sub, amount::text, note
		   FROM public.refund WHERE provider_refund_id = $1`, "re_byhand").
		Scan(&kind, &status, &actorKind, &actorSub, &amount, &note))

	require.Equal(t, "external", kind)
	require.Equal(t, "succeeded", status)
	require.Equal(t, "10.00", amount, "the amount is known ONLY from the event")
	// ⚠ `system` with NO subject. Inventing a staff actor to satisfy a NOT NULL would put a false
	// statement in the one record that exists to say who moved money.
	require.Equal(t, "system", actorKind)
	require.Nil(t, actorSub)
	require.Contains(t, note, "Issued outside Effy")

	// ⚠ AND IT REDUCES THE CEILING. That is the whole point — the money is gone either way.
	gw := &recordingGateway{}
	over := NewService(NewRepository(pool), gw)
	_, err := over.Issue(ctx, IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "the rest", Amount: "45.00", ActorSub: "staff-1",
	})
	var ceiling *ErrCeilingExceeded
	require.ErrorAs(t, err, &ceiling,
		"a hand-issued refund must count against what can still be refunded, or the same money goes twice")
	require.Empty(t, gw.calls, "and the provider is never called for money the platform does not have")
}

// ⚠ A SECOND EVENT FOR THE SAME EXTERNAL REFUND MUST NOT DOUBLE IT. The event dedup normally prevents
// this; the unique index on `provider_refund_id` is what makes it true even if a different event id
// carries the same refund.
func TestSettle_AnExternalRefundIsRecordedOnlyOnce(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	require.NoError(t, svc.HandleRefundEvent(ctx, refundEvent("re_twice", checkout.RefundSucceeded, "")))
	require.NoError(t, svc.HandleRefundEvent(ctx, refundEvent("re_twice", checkout.RefundSucceeded, "")))

	var n int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM public.refund WHERE provider_refund_id = $1`, "re_twice").Scan(&n))
	require.Equal(t, 1, n)
}

// ⚠ A refund on an intent this platform never created is NOT this platform's money, and must not be
// attached to a guess. It is also NOT an error — failing the webhook over somebody else's refund would
// make the provider retry it forever.
func TestSettle_ARefundForAnUnknownPaymentIsIgnoredWithoutError(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})
	ctx := context.Background()

	evt := refundEvent("re_alien", checkout.RefundSucceeded, "")
	evt.RefundPaymentIntentID = "pi_not_ours"
	require.NoError(t, svc.HandleRefundEvent(ctx, evt))

	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM public.refund`).Scan(&n))
	require.Zero(t, n)
}

// ── T037/T040/T042 — classifying a submission failure ───────────────────────────────────────────

// ⚠ SC-006a. The provider is unreachable and the operator's request retries. No number of retries may
// produce more than one refund — and the mechanism is the idempotency key, not luck.
func TestSubmit_AnUnreachableProviderNeverProducesASecondRefund(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{err: errors.New("connection reset by peer")}
	svc := NewService(NewRepository(pool), gw)
	ctx := context.Background()

	in := IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	}
	// The operator gives up and clicks again. And again.
	for i := 0; i < 3; i++ {
		res, err := svc.Issue(ctx, in)
		require.NoError(t, err, "an ambiguous failure is not an error the operator can act on")
		require.Equal(t, "submitting", res.Status)
		require.True(t, res.Stalled, "the operator must be told the outcome is unknown")
	}

	var rows int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM public.refund`).Scan(&rows))
	require.Equal(t, 1, rows, "⚠ ONE refund row, however many attempts — the idempotency key is the whole safety")

	// Every attempt carried the SAME key, which is what makes the provider deduplicate them too.
	require.NotEmpty(t, gw.calls)
	first := gw.calls[0].IdempotencyKey
	require.NotEmpty(t, first)
	for _, c := range gw.calls {
		require.Equal(t, first, c.IdempotencyKey,
			"a retry under a NEW key is a second refund — this is the assertion that stops it")
	}
}

// ⚠ AN AMBIGUOUS FAILURE IS RETRIED, BOUNDED. A single dropped connection is exactly what this covers.
func TestSubmit_RetriesAnAmbiguousFailureAndThenStops(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{err: errors.New("i/o timeout")}
	svc := NewService(NewRepository(pool), gw)

	_, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)
	require.Len(t, gw.calls, maxSubmitAttempts,
		"bounded: this runs inside an operator's request, and a longer loop is a longer spinner")
}

// ⚠ T042. A DEFINITE REFUSAL IS NEVER RETRIED — retrying a decision cannot change it, and it only
// delays telling the operator something they must act on while their screen says "refunding…".
func TestSubmit_ADefiniteRefusalIsNotRetriedAndItsReasonReachesStaff(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{err: &checkout.RefusedError{Reason: "charge_already_refunded"}}
	svc := NewService(NewRepository(pool), gw)

	_, err := svc.Issue(context.Background(), IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	})
	require.Error(t, err)
	require.Len(t, gw.calls, 1, "a decision is asked for once")

	var status string
	var failure *string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status, failure_reason FROM public.refund WHERE order_id = $1`, orderID).
		Scan(&status, &failure))
	require.Equal(t, "refused", status)
	require.NotNil(t, failure)
	require.Equal(t, "charge_already_refunded", *failure)
}

// ⚠ T041 / FR-005e — A REFUND THE PROVIDER NEVER ACCEPTED MUST NOT HOLD THE CEILING DOWN.
//
// `submitting` means the platform wrote a row and then could not get an answer. No money is on its
// way. If that counted toward the total refunded, the platform would REFUSE TO RETURN MONEY IT STILL
// HOLDS because of an attempt that failed — a customer denied their own refund over an outage on our
// side, with the refusal citing a ceiling that is not real.
//
// Proven by breaking it: adding `submitting` to `refundedCents` makes this fail.
func TestCeiling_AStalledRefundDoesNotReduceWhatCanStillBeRefunded(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	ctx := context.Background()

	// A refund that never got an answer: the row exists, in `submitting`.
	stalled := NewService(NewRepository(pool), &recordingGateway{err: errors.New("i/o timeout")})
	res, err := stalled.Issue(ctx, IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "first attempt", Amount: "20.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)
	require.True(t, res.Stalled)

	var status string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status FROM public.refund WHERE order_id = $1`, orderID).Scan(&status))
	require.Equal(t, "submitting", status, "the fixture must really be stalled, or this proves nothing")

	// The whole $50 is still the platform's to return — nothing has left.
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)
	full, err := svc.Issue(ctx, IssueInput{
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "the customer's actual refund", Amount: "50.00", ActorSub: "staff-2",
	})
	require.NoError(t, err,
		"⚠ an unaccepted attempt must never make the platform refuse money it still holds")
	require.Equal(t, "submitted", full.Status)
	require.Equal(t, int64(5000), gw.calls[0].AmountCents)
}
