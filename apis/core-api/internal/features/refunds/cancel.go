package refunds

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// Cancelling an order (055 US2).
//
// ⚠ CANCELLATION *IS* A FULL REFUND, AND THAT IS NOT AN IMPLEMENTATION SHORTCUT — IT IS THE FACT
// (research R3). Effy creates its PaymentIntents with `CaptureMethod: automatic`, so by the time an
// order exists the money is already captured. The provider's `cancel` operation applies only to an
// UNCAPTURED intent and therefore never applies to an Effy order. There is no free cancellation on
// this platform; there is only returning money that has already been taken.
//
// ⚠ WHICH MEANS THE PUBLISHED POLICY IS WRONG UNTIL IT IS CORRECTED (FR-016a). It says an order may be
// cancelled "before it is dispatched" — looser than what the platform can actually honour — and "to
// cancel, use the app", which was untrue until this shipped.

var (
	// ErrNotCancellable — somebody has already begun preparing this order.
	//
	// ⚠ IT IS NOT A FAILURE OF THE REQUEST, it is a fact about the order, and the difference matters to
	// the wording a shopper reads: their order cannot be cancelled BY THEM, and staff still can.
	ErrNotCancellable = errors.New("refunds: the order is already being prepared")
	// ErrAlreadyCancelled — a second cancel of the same order. Idempotent, not an error to the caller.
	ErrAlreadyCancelled = errors.New("refunds: already cancelled")
)

// CancelInput is one cancellation.
type CancelInput struct {
	OrderID string
	// ⚠ Set for a CUSTOMER cancellation, empty for staff. It is not decoration: the customer's own
	// window closes when picking begins (FR-012), and staff's does not (FR-018), because a phone call
	// arrives after the customer's control has gone.
	CustomerID string
	ActorKind  string
	ActorSub   string
}

// CancelResult is what the caller tells the customer.
type CancelResult struct {
	RefundID string `json:"refundId"`
	Amount   string `json:"amount"`
	Status   string `json:"status"`
	Stalled  bool   `json:"stalled,omitempty"`
}

// Cancel calls off an order and returns everything paid.
//
// ⚠ THE WHOLE AMOUNT, INCLUDING DELIVERY (FR-013) — and that is the opposite of a partial refund,
// which keeps the delivery fee because the delivery happened (A10). Nothing was delivered here, and
// nothing will be.
func (s *Service) Cancel(ctx context.Context, in CancelInput) (CancelResult, error) {
	paidCents, refundedCents, intentID, err := s.repo.CancelOrder(ctx, in)
	if err != nil {
		return CancelResult{}, err
	}

	// ⚠ WHAT REMAINS, NOT WHAT WAS PAID. An order with a partial refund already against it must not be
	// refunded its full total on cancellation — that would return more money than was ever taken, and
	// the ceiling would refuse it anyway, so the cancellation would fail for a reason nobody could act
	// on.
	amountCents := paidCents - refundedCents
	if amountCents <= 0 {
		// Already fully refunded. The order is cancelled; there is nothing left to return.
		return CancelResult{Amount: money.FormatCents(0), Status: StatusSucceeded}, nil
	}

	key := cancelIdempotencyKey(in.OrderID)
	refundID, err := s.repo.RecordCancellationRefund(ctx, in, amountCents, key)
	if errors.Is(err, ErrAlreadyIssued) {
		return CancelResult{Amount: money.FormatCents(amountCents), Status: StatusSubmitting, Stalled: true}, nil
	}
	if err != nil {
		return CancelResult{}, err
	}

	res, ferr := s.submit(ctx, refundID, intentID, amountCents, providerReason(ReasonOrderCancelled), key)
	if ferr != nil {
		var refused *checkout.RefusedError
		if errors.As(ferr, &refused) {
			_ = s.repo.MarkRefused(ctx, refundID, refused.Reason)
			// ⚠ THE ORDER STAYS CANCELLED. The shops have already been told to stop, and un-cancelling
			// would ask them to resume an order the customer believes is gone. The refund is a separate
			// problem, and it is now a visible one that staff must resolve.
			return CancelResult{RefundID: refundID, Amount: money.FormatCents(amountCents),
				Status: StatusRefused}, fmt.Errorf("refunds: provider refused: %s", refused.Reason)
		}
		return CancelResult{RefundID: refundID, Amount: money.FormatCents(amountCents),
			Status: StatusSubmitting, Stalled: true}, nil
	}

	_ = s.repo.MarkSubmitted(ctx, refundID, res.ID)
	return CancelResult{RefundID: refundID, Amount: money.FormatCents(amountCents),
		Status: StatusSubmitted}, nil
}

// cancelIdempotencyKey is stable per order, so two simultaneous cancels refund once (FR-017).
//
// ⚠ IT DOES NOT INCLUDE THE ACTOR OR THE AMOUNT, unlike `idempotencyKey`. A customer tapping cancel
// while a staff member cancels the same order on the phone must produce ONE refund, and a key that
// varied by who asked would produce two.
func cancelIdempotencyKey(orderID string) string { return "cancel:" + orderID }

// ── Repository ──────────────────────────────────────────────────────────────────────────────────

// CancelOrder performs the guarded transition and withdraws every shop portion (FR-014, FR-017).
//
// ⚠ ONE TRANSACTION, AND THE ORDER OF THE STATEMENTS IS THE DESIGN. The order row is locked first, the
// cancellability is decided from rows read UNDER that lock, and the shops are withdrawn in the same
// transaction. Any arrangement that checks and then writes is a way for a shop to start picking
// between the two — and then the customer has been refunded for an order somebody is packing.
func (r *Repository) CancelOrder(ctx context.Context, in CancelInput) (int64, int64, string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, 0, "", fmt.Errorf("refunds: cancel begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if beforeLock != nil {
		beforeLock()
	}

	var status, intentID string
	var paidCents, refundedCents int64
	err = tx.QueryRow(ctx, `
SELECT o.status,
       COALESCE(p.stripe_payment_intent_id, ''),
       COALESCE(round(p.amount * 100)::bigint, 0),
       COALESCE((SELECT SUM(round(r.amount * 100))::bigint
                   FROM public.refund r
                  WHERE r.order_id = o.id
                    AND r.status IN ('submitted', 'succeeded', 'failed')), 0)
  FROM public."order" o
  LEFT JOIN public.payment p ON p.order_id = o.id AND p.status = 'succeeded'
 WHERE o.id = $1
   -- ⚠ THE OWNERSHIP TERM IS IN THE SAME PREDICATE AS THE LOOKUP, not a separate check. An empty
   -- second parameter is the staff case. Asking "does this order exist?" and then "is it yours?" as
   -- two questions is how a refusal becomes an oracle for which order ids are real (FR-016).
   AND ($2 = '' OR o.customer_id::text = $2)
   FOR UPDATE OF o`, in.OrderID, in.CustomerID).
		Scan(&status, &intentID, &paidCents, &refundedCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, "", ErrOrderNotFound
	}
	if err != nil {
		return 0, 0, "", fmt.Errorf("refunds: cancel lock: %w", err)
	}
	if status == "canceled" {
		return 0, 0, "", ErrAlreadyCancelled
	}
	if status != "paid" {
		// An unpaid order has no money to return and nothing to call off.
		return 0, 0, "", ErrNotCancellable
	}

	// ⚠ A CUSTOMER'S WINDOW CLOSES WHEN ANY SHOP BEGINS PREPARING (FR-012, A2). Staff have no such
	// limit (FR-018) — a phone call arrives after the customer's own control has gone.
	if in.CustomerID != "" {
		var started bool
		if err := tx.QueryRow(ctx, `
SELECT EXISTS (SELECT 1 FROM public.shop_fulfillment sf
                WHERE sf.order_id = $1 AND sf.status <> 'pending')`, in.OrderID).Scan(&started); err != nil {
			return 0, 0, "", fmt.Errorf("refunds: cancel window: %w", err)
		}
		if started {
			return 0, 0, "", ErrNotCancellable
		}
	}

	// ⚠ NOT AFTER COLLECTION, EVEN FOR STAFF. Once the goods have left the shop the platform cannot
	// call the work off — somebody is carrying it — and cancelling would refund an order that is
	// about to arrive.
	var departed bool
	if err := tx.QueryRow(ctx, `
SELECT EXISTS (SELECT 1 FROM public.shop_fulfillment sf
                WHERE sf.order_id = $1 AND sf.status IN ('collected', 'delivered'))`, in.OrderID).
		Scan(&departed); err != nil {
		return 0, 0, "", fmt.Errorf("refunds: cancel departure: %w", err)
	}
	if departed {
		return 0, 0, "", ErrNotCancellable
	}

	// ⚠ FIRST WRITER OF `canceled`. The CHECK has permitted it since 019 and nothing ever wrote it,
	// which is why the gap register could say "nothing in the codebase ever writes it".
	if _, err := tx.Exec(ctx,
		`UPDATE public."order" SET status = 'canceled' WHERE id = $1`, in.OrderID); err != nil {
		return 0, 0, "", fmt.Errorf("refunds: cancel order: %w", err)
	}

	// ⚠ WITHDRAWN, NOT `unfulfillable` (FR-014). The shop did not fail to supply anything — the order
	// was called off. Telling a shop it could not supply something nobody wanted would also make
	// shop-reliability reporting count cancellations as shop failures.
	//
	// ⚠ RECORDED IN THE SAME STATEMENT, per FR-014. `fulfillment_event` is the shop side's audit trail
	// (020), and a portion that changes state with no event is a change nobody can account for. The
	// UPDATE returns the previous status so the event can carry it — reading it separately would leave
	// a window where the two disagreed.
	//
	// ⚠ `actor_staff_id` IS NULL, AND THAT IS THE HONEST VALUE. That column references `shop_staff`,
	// and no shop staff member withdrew this — a customer or someone at Effy did. There is no column
	// on this table for either, because until now nothing outside a shop ever moved a portion. Naming
	// a shop staff member to fill the field would be a false statement in an audit trail; the WHO for
	// a cancellation lives on the `refund` row, which records the actor kind and subject.
	if _, err := tx.Exec(ctx, `
WITH withdrawn AS (
    UPDATE public.shop_fulfillment
       SET status = 'withdrawn', state_changed_at = now()
     WHERE order_id = $1 AND status NOT IN ('collected', 'delivered', 'withdrawn')
 RETURNING id, status AS to_status,
           (SELECT prev.status FROM public.shop_fulfillment prev WHERE prev.id = shop_fulfillment.id) AS from_status
)
INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, from_status, to_status)
SELECT w.id, 'state_changed', w.from_status, 'withdrawn' FROM withdrawn w`, in.OrderID); err != nil {
		return 0, 0, "", fmt.Errorf("refunds: withdraw portions: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, "", fmt.Errorf("refunds: cancel commit: %w", err)
	}
	return paidCents, refundedCents, intentID, nil
}

// RecordCancellationRefund writes the refund row for a cancellation.
//
// ⚠ NO CEILING LOCK HERE, and that is not an omission: `CancelOrder` has just moved the order to
// `canceled` under its own lock, and nothing else can refund a cancelled order. The amount was
// computed from rows read under that lock.
func (r *Repository) RecordCancellationRefund(
	ctx context.Context, in CancelInput, amountCents int64, key string,
) (string, error) {
	var id string
	// ⚠ `cancellation` IS ITS OWN KIND, not `goodwill`. It names no lines (the amount includes
	// delivery, which is not a line), so structurally it looks like a goodwill refund — but a console
	// rendering "Goodwill — the order was cancelled" describes a gesture the business did not make.
	// The kind is what staff read; it has to say what actually happened.
	err := r.pool.QueryRow(ctx, `
INSERT INTO public.refund
    (order_id, kind, amount, currency, reason, note, idempotency_key, actor_kind, actor_sub)
VALUES ($1, 'cancellation', $2::bigint / 100.0, 'AUD', $3, $4, $5, $6, $7)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id::text`,
		in.OrderID, amountCents, ReasonOrderCancelled,
		"The order was cancelled before anyone began preparing it.",
		key, in.ActorKind, in.ActorSub).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrAlreadyIssued
	}
	if err != nil {
		return "", fmt.Errorf("refunds: record cancellation: %w", err)
	}
	return id, nil
}
