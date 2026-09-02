package refunds

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// Service owns what a valid refund is. No HTTP, no SQL (Principle VI).
//
// ⚠ ONE SERVICE, TWO AUDIENCES. The back-office path and the customer cancellation path differ only
// in how the actor is resolved and what they are permitted to ask for; once an intent exists the rules
// are identical. Two copies of "what a valid refund is" would drift, and the drift would show up as
// money.
type Service struct {
	// 055 — refund telemetry. Nil-able; a no-op when unwired.
	metrics Metrics
	repo    *Repository
	gateway checkout.PaymentGateway
}

// Metrics is the refund telemetry this service emits (055 R9). Nil-able like every other optional
// collaborator on this platform: unwired, nothing is metered and nothing crashes.
//
// ⚠ NO ORDER ID, CUSTOMER ID OR AMOUNT CROSSES THIS INTERFACE. A label is a time-series dimension —
// an order id would mint one series per order, and an amount would put a customer's money in a
// metrics endpoint.
type Metrics interface {
	RefundIssued(kind string)
	RefundSettled(outcome string)
	RefundSubmitFailed(failure string)
	OrderCancelled(actor string)
	// ⚠ 057 — authorization refusals on the shop refund route, which no other counter can see: they
	// happen BEFORE the provider is called, so effy_refund_submit_failures_total never learns of them.
	ShopRefundDenied(reason string)
}

// WithMetrics wires refund telemetry.
func (s *Service) WithMetrics(m Metrics) *Service {
	s.metrics = m
	return s
}

func (s *Service) meter(f func(Metrics)) {
	if s.metrics != nil {
		f(s.metrics)
	}
}

func NewService(repo *Repository, gw checkout.PaymentGateway) *Service {
	return &Service{repo: repo, gateway: gw}
}

// Reasons an operator may choose. ⚠ EFFY'S vocabulary, mapped to the provider's on the way out.
const (
	ReasonItemNotSupplied = "item_not_supplied"
	ReasonItemUnusable    = "item_unusable"
	ReasonOrderCancelled  = "order_cancelled"
	ReasonGoodwill        = "goodwill"
)

var operatorReasons = map[string]bool{
	ReasonItemNotSupplied: true,
	ReasonItemUnusable:    true,
	ReasonOrderCancelled:  true,
	ReasonGoodwill:        true,
}

var (
	ErrInvalidReason = errors.New("refunds: unknown reason")
	// ⚠ 057 — a programming error, not an operator one: no request body can set the actor kind, it is
	// set by whichever route handled the call. Surfacing it as a 500 rather than a 400 is deliberate.
	ErrInvalidActorKind = errors.New("refunds: unknown actor kind")
	ErrNoteRequired     = errors.New("refunds: a goodwill refund must carry a note")
	ErrAmountRejected   = errors.New("refunds: an item-derived refund computes its own amount")
	ErrNoLines          = errors.New("refunds: no lines selected")
	ErrAmountInvalid    = errors.New("refunds: the amount must be positive")
)

// IssueInput is one refund a staff member is asking for.
type IssueInput struct {
	OrderID  string
	Kind     string // "item" | "goodwill"
	Reason   string
	Note     string
	Lines    []LineInput
	Amount   string // goodwill only
	ActorSub string
	/**
	 * ⚠ 057 — WHICH POOL THE ACTOR CAME FROM, and it is REQUIRED rather than defaulted.
	 *
	 * It was the literal "back_office" inside [Service.Issue] until a shop manager could issue a
	 * refund too. Defaulting it here would have been the smaller diff and the worse decision: a new
	 * call site that forgot to set it would record a shop's refund as back-office work, and the audit
	 * trail would name the wrong organisation with nothing failing. `validate` refuses an unknown
	 * value, so adding a fourth actor forces a decision instead of inheriting one — which is exactly
	 * what 053 and 056 both failed to do when they widened an enum.
	 */
	ActorKind string
}

type LineInput struct {
	OrderItemID string
	Quantity    int
}

// ⚠ THE PROVIDER'S VOCABULARY IS SMALLER THAN OURS, and only one value is ever sent.
//
// `fraudulent` adds the payer's card and email to the provider's block list — a consequence for a
// person beyond this order, decided in a console with no review step. `duplicate` is a claim the
// platform cannot substantiate. Everything Effy does is, from the provider's point of view, a refund
// the customer asked for (research R5).
func providerReason(string) string { return "requested_by_customer" }

// Idempotency derives the key from the ACTION, never randomly.
//
// ⚠ THIS IS THE WHOLE OF FR-005, and it does double duty: it is our uniqueness constraint AND the key
// sent to the provider, so an ambiguous retry — a timeout where we cannot tell whether the refund
// exists — is recognised by the provider as the same request and returns the original rather than
// creating a second. A random key would make the automatic retry in FR-005d a way to refund twice.
func idempotencyKey(in IssueInput, amountCents int64) string {
	h := sha256.New()
	fmt.Fprintf(h, "refund:%s:%s:%s:%d", in.OrderID, in.Kind, in.Reason, amountCents)
	for _, l := range in.Lines {
		fmt.Fprintf(h, ":%s x%d", l.OrderItemID, l.Quantity)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// ⚠ The actor kinds a HUMAN request may claim. `system` and `customer` are deliberately absent:
// `system` means the provider acted with nobody behind it (and the DB's refund_actor_sub_ck forbids it
// a subject at all), and a customer never issues a refund — they request one, which is a different
// table. A value outside this set is a programming error and must fail loudly, not be coerced.
var issuerKinds = map[string]bool{"back_office": true, "shop": true}

// validate checks what a refund must be before any money is considered.
func validate(in IssueInput) error {
	if !issuerKinds[in.ActorKind] {
		return ErrInvalidActorKind
	}
	if !operatorReasons[in.Reason] {
		return ErrInvalidReason
	}
	switch in.Kind {
	case "goodwill":
		if in.Reason != ReasonGoodwill {
			return ErrInvalidReason
		}
		// ⚠ FR-003c. An amount with no line and no explanation is unaccountable — nobody reading the
		// record later can tell what it was for, and "we gave someone $20" is exactly the entry that
		// needs to say. The database refuses it too; this refuses it first, with a usable message.
		if in.Note == "" {
			return ErrNoteRequired
		}
	case "item":
		if in.Reason == ReasonGoodwill {
			return ErrInvalidReason
		}
		if len(in.Lines) == 0 {
			return ErrNoLines
		}
		// ⚠ FR-003 / A7a: an item-derived refund computes its amount from the lines, and a supplied
		// one is REJECTED rather than ignored. If a caller could send an amount beside a line
		// selection the two could disagree, and the record would then claim a refund covered items it
		// did not — a false statement in the one place that must be true.
		if in.Amount != "" {
			return ErrAmountRejected
		}
	default:
		return ErrInvalidReason
	}
	return nil
}

// goodwillCents parses and bounds a free amount typed by an operator.
//
// ⚠ IT REFUSES MORE THAN TWO DECIMAL PLACES, and that is a deliberate departure from
// `money.ParseCents`, which TRUNCATES them. Truncation is right for its original use — values read
// from a `numeric(12,2)` column, which never have extra digits — and wrong here, because this is free
// human input. An operator typing "12.345" would silently refund $12.34 with nothing on screen saying
// so, and the difference is money.
//
// ⚠ The fix belongs here rather than in `money`: changing the shared helper would ripple across every
// wire amount on the platform to solve a problem only this input has.
func goodwillCents(amount string) (int64, error) {
	trimmed := strings.TrimSpace(amount)
	if _, frac, found := strings.Cut(trimmed, "."); found && len(frac) > 2 {
		return 0, ErrAmountInvalid
	}
	cents, err := money.ParseCents(trimmed)
	if err != nil {
		return 0, ErrAmountInvalid
	}
	if cents <= 0 {
		return 0, ErrAmountInvalid
	}
	// A refund larger than any order the platform can take is a typo, not an intent.
	if cents > 100_000_00 {
		return 0, ErrAmountInvalid
	}
	return cents, nil
}

// IssueResult is what the operator gets back.
type IssueResult struct {
	RefundID string `json:"refundId"`
	Amount   string `json:"amount"`
	// ⚠ NEVER "refunded". The provider has it; the bank has not moved anything and may refuse weeks
	// later (FR-007). The console renders this verbatim, so the word here is the word staff read.
	Status string `json:"status"`
	// What still could be refunded, so a partial refund's next step is obvious.
	RemainingAmount string `json:"remainingAmount"`
	// ⚠ TRUE WHEN THE PROVIDER NEVER ANSWERED — the refund may or may not exist, and nobody can say
	// which. It is NOT a failure (that would claim a decision nobody made) and NOT a success. The
	// console must say so plainly: an operator told nothing would either assume it worked or issue it
	// again, and one of those refunds the customer twice.
	Stalled bool `json:"stalled,omitempty"`
}

// Issue records a refund and submits it to the provider.
//
// ⚠ RECORD FIRST, THEN SUBMIT — and the order is not stylistic. Calling the provider first and
// recording afterwards loses money on any crash between them: the customer is refunded, the platform
// has no record, the ceiling is wrong, and it can happen again. Recording first means the worst case
// is a refund row stuck in `submitting`, which is visible, bounded and retryable (FR-005d).
func (s *Service) Issue(ctx context.Context, in IssueInput) (IssueResult, error) {
	if err := validate(in); err != nil {
		return IssueResult{}, err
	}

	var (
		amountCents int64
		lines       []InsertLine
		err         error
	)
	if in.Kind == "goodwill" {
		if amountCents, err = goodwillCents(in.Amount); err != nil {
			return IssueResult{}, err
		}
	} else {
		// ⚠ COMPUTED from the receipt lines, never from the request (FR-003).
		if amountCents, lines, err = s.repo.PriceLines(ctx, in.OrderID, in.Lines); err != nil {
			return IssueResult{}, err
		}
	}

	var note *string
	if in.Note != "" {
		note = &in.Note
	}

	refundID, paid, err := s.repo.Record(ctx, InsertInput{
		OrderID: in.OrderID, Kind: in.Kind, AmountCents: amountCents, Currency: "AUD",
		Reason: in.Reason, Note: note, IdempotencyKey: idempotencyKey(in, amountCents),
		ActorKind: in.ActorKind, ActorSub: in.ActorSub, Lines: lines,
	})
	if errors.Is(err, ErrAlreadyIssued) {
		// ⚠ A SUCCESS THAT CHANGED NOTHING. A double-click must not look like a failure to the
		// operator, or they will click again.
		//
		// ⚠ REPORTING THE ROW'S REAL STATE, not a fixed word. A refund still in `submitting` never got
		// an answer from the provider, and saying so is the difference between an operator who waits
		// and one who assumes it worked.
		return IssueResult{
			RefundID: refundID, Status: paid.ExistingStatus,
			Stalled:         paid.ExistingStatus == "submitting",
			Amount:          money.FormatCents(amountCents),
			RemainingAmount: money.FormatCents(paid.RemainingCents()),
		}, nil
	}
	if err != nil {
		return IssueResult{}, err
	}

	res, ferr := s.submit(ctx, refundID, paid.PaymentIntentID, amountCents,
		providerReason(in.Reason), idempotencyKey(in, amountCents))
	if ferr != nil {
		var refused *checkout.RefusedError
		if errors.As(ferr, &refused) {
			// ⚠ A DECISION. Terminal — retrying it cannot change the answer (FR-005d).
			_ = s.repo.MarkRefused(ctx, refundID, refused.Reason)
			s.meter(func(m Metrics) { m.RefundSubmitFailed("refused") })
			return IssueResult{}, fmt.Errorf("refunds: provider refused: %s", refused.Reason)
		}
		// ⚠ AMBIGUOUS AND STILL AMBIGUOUS AFTER RETRYING — the refund may or may not exist. The row
		// stays `submitting`: it must NOT be marked refused (that would claim a decision nobody made)
		// and it must NOT count as refunded (that would hold the ceiling down over an attempt that may
		// never have landed).
		//
		// ⚠ AND IT IS NOT SILENTLY DROPPED. `Stalled` is what the console reads to put it in front of
		// a person; the operator is told the outcome is unknown, which is the honest answer.
		s.meter(func(m Metrics) { m.RefundSubmitFailed("ambiguous") })
		return IssueResult{RefundID: refundID, Status: "submitting", Stalled: true,
			Amount: money.FormatCents(amountCents)}, nil
	}

	_ = s.repo.MarkSubmitted(ctx, refundID, res.ID)
	s.meter(func(m Metrics) { m.RefundIssued(in.Kind) })

	// ⚠ A SHOPPER WHO ASKED HAS NOW BEEN ANSWERED (FR-005r2). Without this the request stays open
	// forever: a queue item nobody can close, and a customer who is never told the outcome of the
	// thing they raised.
	//
	// ⚠ SWALLOWED, and after the refund is recorded. The money is on its way either way; failing the
	// refund because a status update did not land would be reporting a failure for something that
	// demonstrably happened. Most refunds have no request at all — the platform proposes them from
	// shortfalls — so "no open request" is the ordinary case, not an error.

	// ⚠ FR-030 — PUT THE UNITS BACK, but only where the platform can know it should: an item-derived
	// refund, a tracked product, an uncollected portion. See `stock.go` for why each condition is
	// there. Swallowed and AFTER the refund is recorded: the money is already on its way, and a stock
	// write that could abort that would trade a customer's refund for a shelf count.
	if in.Kind == "item" {
		_ = s.repo.ReturnStock(ctx, refundID, in.OrderID)
	}

	_ = s.repo.CloseOpenRequestForOrder(ctx, in.OrderID, in.ActorSub)

	return IssueResult{
		RefundID: refundID, Amount: money.FormatCents(amountCents), Status: "submitted",
		RemainingAmount: money.FormatCents(paid.RemainingCents() - amountCents),
	}, nil
}

// maxSubmitAttempts bounds the retry of an AMBIGUOUS submission failure.
//
// ⚠ SMALL ON PURPOSE. This runs inside an operator's request, so every attempt is time they spend
// watching a spinner over a control that moves money. Two attempts covers the case this exists for —
// a single dropped connection or a rate-limit blip — and anything beyond that is not a blip and should
// reach a person rather than a longer loop.
const maxSubmitAttempts = 2

// submit sends the refund to the provider, retrying an AMBIGUOUS failure under the SAME key.
//
// ⚠ THE IDEMPOTENCY KEY IS WHAT MAKES THIS SAFE, AND IT IS NOT A DETAIL. The key is derived from the
// action and stored on the refund row before the first call, so every attempt here is the provider's
// own idempotency: a retry after a timeout that DID reach the provider returns the original refund
// rather than creating a second one. Without it, retrying an ambiguous failure would be a mechanism
// for refunding a customer twice — which is why the classification and the key had to land together.
//
// ⚠ A DEFINITE REFUSAL IS NEVER RETRIED. Retrying a decision cannot change it; it only delays telling
// the operator something they need to act on, while their screen says "refunding…".
func (s *Service) submit(
	ctx context.Context,
	refundID, intentID string,
	amountCents int64,
	reason, key string,
) (checkout.Refund, error) {
	var lastErr error
	for attempt := 1; attempt <= maxSubmitAttempts; attempt++ {
		res, err := s.gateway.CreateRefund(ctx, checkout.CreateRefundInput{
			PaymentIntentID: intentID,
			AmountCents:     amountCents,
			Reason:          reason,
			IdempotencyKey:  key,
			Metadata:        map[string]string{"effy_refund_id": refundID},
		})
		if err == nil {
			return res, nil
		}
		var refused *checkout.RefusedError
		if errors.As(err, &refused) {
			return checkout.Refund{}, err
		}
		lastErr = err
		// ⚠ The context is honoured between attempts. An operator who has given up and a request that
		// has been cancelled must not leave a retry loop running against the payment provider.
		if ctx.Err() != nil {
			return checkout.Refund{}, ctx.Err()
		}
	}
	return checkout.Refund{}, lastErr
}
