package refunds

import (
	"context"
	"fmt"

	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// The provider's side of a refund's life (055 US4).
//
// ⚠ A REFUND IS A STATE MACHINE, NOT A CALL, AND THIS IS THE HALF THAT MAKES THAT TRUE. `Issue`
// records `submitted` — the provider has ACCEPTED the request. The bank can still reject it up to
// THIRTY DAYS later. A platform that treats the API's 200 as the end will tell customers their money
// is on its way and never find out it was wrong; that is the single most-skipped property of refund
// integrations, and it is why this file was built before anything customer-facing.
//
// ⚠ IT RIDES THE EXISTING SIGNATURE-VERIFIED ENDPOINT. There is exactly one webhook on this platform,
// its signature is verified before anything is parsed, and its events are deduped against
// `stripe_event`. A second endpoint would be a second thing to secure and a second dedup table to
// keep honest.

// SettleOutcome is what one provider event did, for logging and metrics.
type SettleOutcome struct {
	// Recognised is false when the provider names a refund this platform has no row for.
	Recognised bool
	// Changed is false when the event arrived for a refund already in a terminal state.
	Changed bool
	Status  string
}

// HandleRefundEvent applies one verified refund event.
//
// ⚠ THE CALLER HAS ALREADY DEDUPED. `stripe_event` is marked before this runs, so a redelivery never
// reaches here — which is what makes it safe for this to be a plain UPDATE rather than a
// compare-and-set on an expected prior state.
func (s *Service) HandleRefundEvent(ctx context.Context, evt checkout.WebhookEvent) error {
	_, err := s.settleRefundEvent(ctx, evt)
	return err
}

// settleRefundEvent is the same work, returning what it did so tests can assert on it.
func (s *Service) settleRefundEvent(ctx context.Context, evt checkout.WebhookEvent) (SettleOutcome, error) {
	if evt.RefundID == "" {
		return SettleOutcome{}, nil
	}

	status, terminal := settledStatus(evt.RefundStatus)
	if !terminal {
		// `pending` and `requires_action` are the provider still working. The platform already says
		// `submitted`, which is the truth: it is on its way and has not arrived.
		return SettleOutcome{Recognised: true, Status: string(evt.RefundStatus)}, nil
	}

	changed, err := s.repo.SettleByProviderID(ctx, evt.RefundID, status, evt.FailureReason)
	if err != nil {
		return SettleOutcome{}, err
	}
	if changed {
		return SettleOutcome{Recognised: true, Changed: true, Status: status}, nil
	}

	// ⚠ NOT CHANGED — AND THAT MEANS ONE OF TWO VERY DIFFERENT THINGS. Either this refund is already
	// terminal (a `refund.updated` after a `refund.failed`, which is ordinary and must be ignored), or
	// THE PLATFORM HAS NO ROW FOR IT AT ALL.
	known, err := s.repo.KnowsProviderRefund(ctx, evt.RefundID)
	if err != nil {
		return SettleOutcome{}, err
	}
	if known {
		return SettleOutcome{Recognised: true, Status: status}, nil
	}

	// ⚠ RECORDED, NEVER DISCARDED (FR-010). A refund issued from the provider's own dashboard is a
	// real thing that happens — someone in support returns money by hand during an incident. Dropping
	// the event leaves the order claiming money it no longer holds, the ceiling wrong, and the same
	// money refundable a second time. The platform does not know who issued it or why, and says so.
	if err := s.repo.RecordUnattributedRefund(ctx, evt); err != nil {
		return SettleOutcome{}, fmt.Errorf("refunds: record unattributed: %w", err)
	}
	logger.FromContext(ctx).Warn("refunds: refund issued outside the platform",
		zap.String("providerRefundId", evt.RefundID),
		zap.String("status", status))
	return SettleOutcome{Recognised: false, Changed: true, Status: status}, nil
}

// settledStatus maps the provider's vocabulary onto the platform's terminal states.
//
// ⚠ `failed` AND `canceled` ARE NOT THE SAME OUTCOME, though both mean the money did not go.
// `failed` is the bank rejecting a refund that was accepted — staff must resolve it, and a retry may
// work. `canceled` is the provider withdrawing it before it ever moved, which retrying cannot change.
// They map to `failed` and `refused` respectively, and that difference is the whole reason the state
// machine has five states rather than three.
func settledStatus(s checkout.RefundStatus) (string, bool) {
	switch s {
	case checkout.RefundSucceeded:
		return "succeeded", true
	case checkout.RefundFailed:
		return "failed", true
	case checkout.RefundCanceled:
		return "refused", true
	default:
		return "", false
	}
}
