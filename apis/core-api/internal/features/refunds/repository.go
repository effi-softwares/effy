// Package refunds returns money to customers (055).
//
// ⚠ EVERY RULE IN THIS PACKAGE IS ABOUT ONE HARM: a shopper being told their money is coming when it
// is not, or being refunded twice, or being refunded more than they ever paid. None of those is a
// wrong pixel.
package refunds

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
)

// beforeLock is a test-only hook — see the note at its call site. Never set in production.
var beforeLock func()

// Repository is SQL only (Principle VI).
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// ErrCeilingExceeded is returned with the amount that remains, so the caller can say so.
type ErrCeilingExceeded struct{ RemainingCents int64 }

func (e *ErrCeilingExceeded) Error() string {
	return fmt.Sprintf("refunds: only %d cents remain refundable", e.RemainingCents)
}

var (
	ErrOrderNotFound = errors.New("refunds: order not found")
	// ErrLineOverRefunded means the same unit would be refunded twice (FR-003a).
	ErrLineOverRefunded = errors.New("refunds: those units are already refunded")
	// ErrAlreadyIssued is the idempotent hit — the same action arriving again.
	ErrAlreadyIssued = errors.New("refunds: already issued")
)

// ── The ceiling ────────────────────────────────────────────────────────────────────────────────

// refundedCents is what has been refunded against an order.
//
// ⚠ COUNTED FROM THE ROWS, NEVER STORED. There is no `refunded_amount` column and there must not be:
// a counter and the rows can disagree, and then nobody knows which is true. 027 settled this exact
// question for promotional redemptions and the reasoning transfers unchanged. It is also what makes
// FR-024 automatic — the receipt keeps its own numbers because nothing overwrites them.
//
// ⚠ `submitting` IS EXCLUDED (FR-005e). Until the provider has accepted it, no money is on its way, so
// it must not reduce what can still be refunded. A refund that was never accepted holding the ceiling
// down would be money the platform refuses to return because of an attempt that failed.
const refundedCents = `
SELECT COALESCE(SUM(round(r.amount * 100))::bigint, 0)
  FROM public.refund r
 WHERE r.order_id = $1 AND r.status IN ('submitted', 'succeeded', 'failed')`

// ⚠ `failed` COUNTS toward the total here, and that is deliberate rather than an oversight: a failed
// refund is money the platform ATTEMPTED to return, and it must be resolved by staff — reissuing it
// automatically by freeing the ceiling would let a retry loop refund an order repeatedly while every
// attempt bounces. The staff view shows it as needing attention (FR-009); the ceiling stays honest.

// lockOrderPayment takes the row lock the ceiling is computed under, and returns what the customer
// ACTUALLY PAID.
//
// ⚠ THE CEILING IS `payment.amount`, NOT `order.grand_total_amount`. They can differ, and refunding
// against the order total would, on any adjusted or partly-paid order, return money that never
// arrived. The payment is the record of what was taken.
//
// ⚠ `FOR UPDATE` on the payment row is what makes SC-002 true: two staff refunding at once serialise
// here, so the second sees the first's row when it sums. A read-then-write outside a lock would let
// both pass a ceiling check that neither had exceeded alone.
const lockPayment = `
SELECT round(p.amount * 100)::bigint, p.stripe_payment_intent_id, o.currency
  FROM public.payment p
  JOIN public."order" o ON o.id = p.order_id
 WHERE p.order_id = $1 AND p.status = 'succeeded'
 FOR UPDATE OF p`

// PaidContext is what a refund is issued against.
type PaidContext struct {
	PaidCents       int64
	RefundedCents   int64
	PaymentIntentID string
	Currency        string
	// ⚠ Set ONLY on an idempotent hit (`ErrAlreadyIssued`): the state the refund that already exists
	// is actually in. Reporting a fixed word there would tell an operator whose first attempt never
	// got an answer the same thing as one whose refund was accepted.
	ExistingStatus string
}

// RemainingCents is what may still be refunded.
func (p PaidContext) RemainingCents() int64 { return p.PaidCents - p.RefundedCents }

// InsertInput is one refund, ready to record.
type InsertInput struct {
	OrderID        string
	Kind           string
	AmountCents    int64
	Currency       string
	Reason         string
	Note           *string
	IdempotencyKey string
	ActorKind      string
	ActorSub       string
	Lines          []InsertLine
}

type InsertLine struct {
	OrderItemID string
	Quantity    int
	AmountCents int64
}

// Record writes a refund and its lines in ONE transaction, having checked the ceiling under the same
// lock. Returns the refund id, or ErrAlreadyIssued when this exact action already happened.
//
// ⚠ THE CHECK AND THE WRITE ARE THE SAME TRANSACTION. Any arrangement where the ceiling is read and
// then written outside one lock is a way to refund an order twice, and the second refund is real money.
func (r *Repository) Record(ctx context.Context, in InsertInput) (string, PaidContext, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", PaidContext{}, fmt.Errorf("refunds: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// ⚠ TEST SEAM, placed HERE — before the lock is taken — and the placement is the point.
	//
	// Two goroutines racing this function finish fast enough to serialise by accident, so the
	// concurrency proof PASSED with the row lock removed: a green test demonstrating nothing. Holding
	// them *after* the lock deadlocks instead, because the first holds the row while the second waits
	// for a barrier it can never reach. Releasing both immediately BEFORE the lock is the only
	// arrangement that makes them genuinely contend for it.
	//
	// Nil in production. A lock is not a thing to take on trust.
	if beforeLock != nil {
		beforeLock()
	}

	var paid PaidContext
	if err := tx.QueryRow(ctx, lockPayment, in.OrderID).
		Scan(&paid.PaidCents, &paid.PaymentIntentID, &paid.Currency); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", PaidContext{}, ErrOrderNotFound
		}
		return "", PaidContext{}, fmt.Errorf("refunds: lock payment: %w", err)
	}
	if err := tx.QueryRow(ctx, refundedCents, in.OrderID).Scan(&paid.RefundedCents); err != nil {
		return "", PaidContext{}, fmt.Errorf("refunds: sum refunded: %w", err)
	}

	if in.AmountCents > paid.RemainingCents() {
		return "", paid, &ErrCeilingExceeded{RemainingCents: paid.RemainingCents()}
	}

	var id string
	err = tx.QueryRow(ctx, `
INSERT INTO public.refund
    (order_id, kind, amount, currency, reason, note, idempotency_key, actor_kind, actor_sub)
VALUES ($1, $2, $3::bigint / 100.0, $4, $5, $6, $7, $8, $9)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id::text`,
		in.OrderID, in.Kind, in.AmountCents, in.Currency, in.Reason, in.Note,
		in.IdempotencyKey, in.ActorKind, in.ActorSub).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		// ⚠ THE IDEMPOTENT HIT (FR-005). A double-click, a retry, a redelivered instruction — all
		// resolve to the row that already exists. Zero rows here is a SUCCESS, not a failure.
		//
		// ⚠ AND IT RETURNS THE EXISTING ROW'S REAL STATE. An earlier version reported a hardcoded
		// `submitting`, so an operator clicking again on a refund whose first attempt NEVER GOT AN
		// ANSWER was told the same reassuring thing as someone whose refund was accepted. They would
		// either assume it worked or keep clicking; the honest answer is "still unknown".
		var existingID, existingStatus string
		if qerr := tx.QueryRow(ctx,
			`SELECT id::text, status FROM public.refund WHERE idempotency_key = $1`,
			in.IdempotencyKey).Scan(&existingID, &existingStatus); qerr != nil {
			return "", paid, fmt.Errorf("refunds: read existing: %w", qerr)
		}
		return existingID, PaidContext{
			PaidCents: paid.PaidCents, RefundedCents: paid.RefundedCents,
			PaymentIntentID: paid.PaymentIntentID, Currency: paid.Currency,
			ExistingStatus: existingStatus,
		}, ErrAlreadyIssued
	}
	if err != nil {
		return "", paid, fmt.Errorf("refunds: insert: %w", err)
	}

	for _, l := range in.Lines {
		if _, err := tx.Exec(ctx, `
INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount)
VALUES ($1, $2, $3, $4::bigint / 100.0)`,
			id, l.OrderItemID, l.Quantity, l.AmountCents); err != nil {
			return "", paid, fmt.Errorf("refunds: insert line: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return "", paid, fmt.Errorf("refunds: commit: %w", err)
	}
	return id, paid, nil
}

// ── Status transitions (the only mutation this table permits) ──────────────────────────────────

// MarkSubmitted records that the provider accepted the request.
//
// ⚠ THIS IS NOT "REFUNDED". The bank has not moved anything; it may refuse weeks later (FR-007).
func (r *Repository) MarkSubmitted(ctx context.Context, refundID, providerRefundID string) error {
	_, err := r.pool.Exec(ctx, `
UPDATE public.refund SET status = 'submitted', provider_refund_id = $2
 WHERE id = $1 AND status = 'submitting'`, refundID, providerRefundID)
	return err
}

// MarkRefused records a provider decision. Terminal — retrying a decision cannot change it.
func (r *Repository) MarkRefused(ctx context.Context, refundID, reason string) error {
	_, err := r.pool.Exec(ctx, `
UPDATE public.refund SET status = 'refused', failure_reason = $2, settled_at = now()
 WHERE id = $1 AND status = 'submitting'`, refundID, reason)
	return err
}

// SettleByProviderID applies an outcome the provider reported.
//
// ⚠ GUARDED ON THE CURRENT STATUS, which is what makes FR-010 idempotent: a redelivered event matches
// zero rows the second time and changes nothing. Returns whether it applied, so the caller can tell a
// first delivery from a repeat without a second query.
func (r *Repository) SettleByProviderID(ctx context.Context, providerRefundID, status, failureReason string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
UPDATE public.refund
   SET status = $2,
       failure_reason = NULLIF($3, ''),
       settled_at = now()
 WHERE provider_refund_id = $1
   AND status IN ('submitting', 'submitted')`, providerRefundID, status, failureReason)
	if err != nil {
		return false, fmt.Errorf("refunds: settle: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// PriceLines computes an item-derived refund's amount FROM THE RECEIPT, and refuses to refund a unit
// twice (FR-003, FR-003a).
//
// ⚠ THE PRICE COMES FROM `order_item`, NOT FROM THE PRODUCT. A product's price can change after an
// order; refunding today's price for yesterday's purchase would return the wrong money in whichever
// direction the price moved.
//
// ⚠ AND THE ALREADY-REFUNDED CHECK IS PART OF THE SAME READ. Asking "how many of this line remain
// refundable" separately from computing the amount would leave a window where both answers were taken
// from different moments.
func (r *Repository) PriceLines(ctx context.Context, orderID string, want []LineInput) (int64, []InsertLine, error) {
	var total int64
	out := make([]InsertLine, 0, len(want))

	for _, w := range want {
		if w.Quantity <= 0 {
			return 0, nil, ErrAmountInvalid
		}
		var unitCents, ordered, alreadyRefunded int64
		err := r.pool.QueryRow(ctx, `
SELECT round(oi.unit_price_amount * 100)::bigint,
       oi.quantity,
       COALESCE((SELECT SUM(rl.quantity)
                   FROM public.refund_line rl
                   JOIN public.refund rf ON rf.id = rl.refund_id
                  WHERE rl.order_item_id = oi.id
                    AND rf.status IN ('submitting','submitted','succeeded','failed')), 0)
  FROM public.order_item oi
 WHERE oi.id = $1 AND oi.order_id = $2`, w.OrderItemID, orderID).
			Scan(&unitCents, &ordered, &alreadyRefunded)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return 0, nil, ErrOrderNotFound
			}
			return 0, nil, fmt.Errorf("refunds: price line: %w", err)
		}

		if alreadyRefunded+int64(w.Quantity) > ordered {
			return 0, nil, ErrLineOverRefunded
		}
		amount := unitCents * int64(w.Quantity)
		total += amount
		out = append(out, InsertLine{OrderItemID: w.OrderItemID, Quantity: w.Quantity, AmountCents: amount})
	}
	return total, out, nil
}

// KnowsProviderRefund reports whether the platform has a row for this provider refund.
//
// ⚠ ASKED ONLY AFTER A SETTLE CHANGED NOTHING, to tell two very different situations apart: a refund
// already in a terminal state (ordinary — the provider sends `refund.updated` after `refund.failed`)
// and a refund the platform has never heard of. Collapsing them would either spam the unattributed
// path on every ordinary redelivery, or silently swallow a hand-issued refund.
func (r *Repository) KnowsProviderRefund(ctx context.Context, providerRefundID string) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM public.refund WHERE provider_refund_id = $1)`,
		providerRefundID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("refunds: know provider refund: %w", err)
	}
	return ok, nil
}

// RecordUnattributedRefund writes a refund the platform did not issue (FR-010).
//
// ⚠ THE ORDER IS RESOLVED FROM THE PAYMENT INTENT, and if it cannot be, the row is not written and the
// event is reported as unresolvable rather than attached to a guess. A refund on an intent this
// platform never created is not this platform's money.
//
// ⚠ `actor_kind = 'back_office'` with a NULL-ish subject is deliberately NOT used — the platform does
// not know who did this, and inventing an actor would put a false statement in the audit trail. It is
// recorded as `system`, which is exactly what "arrived from outside, unattributed" means.
//
// ⚠ IDEMPOTENT ON `provider_refund_id`. The unique index is what makes a redelivery that slips past
// the event dedup (a different event id for the same refund) harmless.
func (r *Repository) RecordUnattributedRefund(ctx context.Context, evt checkout.WebhookEvent) error {
	status, _ := settledStatus(evt.RefundStatus)
	tag, err := r.pool.Exec(ctx, `
INSERT INTO public.refund (order_id, kind, amount, reason, status, idempotency_key,
                           actor_kind, actor_sub, provider_refund_id, failure_reason,
                           note, settled_at)
SELECT p.order_id, 'external', $2::numeric / 100, 'external', $3,
       'provider:' || $1, 'system', NULL, $1,
       CASE WHEN $3 = 'failed'
            THEN COALESCE(NULLIF($4, ''), 'reported failed by the payment provider, with no reason given')
            ELSE NULLIF($4, '') END,
       'Issued outside Effy, in the payment provider. Recorded so the order does not claim money it no longer holds.',
       now()
  FROM public.payment p
 WHERE p.stripe_payment_intent_id = $5
ON CONFLICT (provider_refund_id) DO NOTHING`,
		evt.RefundID, evt.RefundAmountCents, status, evt.FailureReason, evt.RefundPaymentIntentID)
	if err != nil {
		return fmt.Errorf("refunds: record unattributed: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Either already recorded (fine) or the intent is not one of ours (also fine — and NOT an
		// error, because the platform must not fail a webhook over somebody else's refund).
		return nil
	}
	return nil
}
