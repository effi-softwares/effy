package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/pricing"
)

// Sentinel errors mapped by the handler.
var (
	ErrEmptyCart       = errors.New("checkout: cart has no payable items")
	ErrAddressNotFound = errors.New("checkout: address not found")
	ErrOrderNotFound   = errors.New("checkout: order not found")
)

// IntentResult is returned to the client (client_secret only — the secret key never leaves core-api).
type IntentResult struct {
	OrderID        string
	OrderNumber    string
	ClientSecret   string
	PublishableKey string
	GrandTotal     string
	Currency       string
}

// ConfirmResult is the fallback-finalizer ack; the client reads the full receipt from GET /v1/orders/{id}.
type ConfirmResult struct {
	OrderID string
	Paid    bool
}

type Service struct {
	store          Store
	gateway        PaymentGateway
	publishableKey string
}

func NewService(store Store, gateway PaymentGateway, publishableKey string) *Service {
	return &Service{store: store, gateway: gateway, publishableKey: publishableKey}
}

// CreateCheckoutIntent computes the authoritative amount from the cart (never the client), locates/
// creates the pending order with an intent-time item snapshot (so charge == order == receipt), and
// creates ONE PaymentIntent with a DETERMINISTIC idempotency key (retry with an unchanged total returns
// the same intent — R5 #1).
func (s *Service) CreateCheckoutIntent(ctx context.Context, customerID, addressID string) (IntentResult, error) {
	if _, err := uuid.Parse(addressID); err != nil {
		return IntentResult{}, ErrAddressNotFound
	}

	lines, err := s.store.CartLines(ctx, customerID)
	if err != nil {
		return IntentResult{}, err
	}
	if len(lines) == 0 {
		return IntentResult{}, ErrEmptyCart
	}

	addressJSON, found, err := s.store.AddressSnapshot(ctx, customerID, addressID)
	if err != nil {
		return IntentResult{}, err
	}
	if !found {
		return IntentResult{}, ErrAddressNotFound
	}

	amounts := computeAmounts(lines)

	orderID, orderNumber, err := s.store.UpsertPendingOrder(ctx, customerID, amounts, addressJSON, lines)
	if err != nil {
		return IntentResult{}, err
	}

	pi, err := s.gateway.CreatePaymentIntent(ctx, CreateIntentInput{
		AmountMinor:    amounts.GrandTotalCents,
		Currency:       amounts.Currency,
		IdempotencyKey: idempotencyKey(orderID, amounts.GrandTotalCents),
		OrderID:        orderID,
		OrderNumber:    orderNumber,
	})
	if err != nil {
		return IntentResult{}, err
	}

	if err := s.store.UpsertPayment(ctx, orderID, pi.ID, amounts.GrandTotalCents, paymentStatusFor(pi.Status)); err != nil {
		return IntentResult{}, err
	}

	return IntentResult{
		OrderID:        orderID,
		OrderNumber:    orderNumber,
		ClientSecret:   pi.ClientSecret,
		PublishableKey: s.publishableKey,
		GrandTotal:     money.FormatCents(amounts.GrandTotalCents),
		Currency:       amounts.Currency,
	}, nil
}

// HandleWebhook is the AUTHORITATIVE finalizer. It verifies the signature, dedups the event, resolves
// the order, and runs the idempotent paid/failed transition. Non-order events are ignored.
func (s *Service) HandleWebhook(ctx context.Context, payload []byte, signature string) error {
	evt, err := s.gateway.ConstructWebhookEvent(payload, signature)
	if err != nil {
		return err // handler → 400
	}
	if evt.PaymentIntentID == "" {
		return nil // not a payment_intent event we act on
	}

	firstTime, err := s.store.MarkEventSeen(ctx, evt.ID, evt.Type)
	if err != nil {
		return err
	}
	if !firstTime {
		return nil // already processed (redelivery)
	}

	orderID, found, err := s.store.FindOrderByIntent(ctx, evt.PaymentIntentID)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}

	switch evt.IntentStatus {
	case IntentSucceeded:
		_, err = s.store.FinalizeSucceeded(ctx, orderID)
		return err
	case IntentFailed:
		return s.store.FinalizeFailed(ctx, orderID)
	default:
		return nil
	}
}

// Confirm is the fallback finalizer (covers a delayed/missed webhook in local dev). It re-fetches the
// intent from Stripe and runs the SAME idempotent transition. Ownership-scoped.
func (s *Service) Confirm(ctx context.Context, customerID, orderID string) (ConfirmResult, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return ConfirmResult{}, ErrOrderNotFound
	}
	intentID, found, err := s.store.OrderIntentForCustomer(ctx, customerID, orderID)
	if err != nil {
		return ConfirmResult{}, err
	}
	if !found {
		return ConfirmResult{}, ErrOrderNotFound
	}
	pi, err := s.gateway.RetrievePaymentIntent(ctx, intentID)
	if err != nil {
		return ConfirmResult{}, err
	}
	if pi.Status == IntentSucceeded {
		if _, err := s.store.FinalizeSucceeded(ctx, orderID); err != nil {
			return ConfirmResult{}, err
		}
		return ConfirmResult{OrderID: orderID, Paid: true}, nil
	}
	if pi.Status == IntentFailed {
		if err := s.store.FinalizeFailed(ctx, orderID); err != nil {
			return ConfirmResult{}, err
		}
	}
	return ConfirmResult{OrderID: orderID, Paid: false}, nil
}

// computeAmounts derives the server-authoritative totals: Σ(unit×qty) + a flat delivery fee (only when
// there is something payable). Never trusts a client-sent amount.
func computeAmounts(lines []CheckoutLine) OrderAmounts {
	var subtotal int64
	for _, l := range lines {
		subtotal += l.UnitCents * int64(l.Quantity)
	}
	delivery := int64(0)
	if subtotal > 0 {
		delivery = pricing.DeliveryFeeCents
	}
	return OrderAmounts{
		ItemSubtotalCents: subtotal,
		DeliveryFeeCents:  delivery,
		GrandTotalCents:   subtotal + delivery,
		Currency:          pricing.Currency,
	}
}

// idempotencyKey is DETERMINISTIC over (order, amount): an unchanged retry returns the same intent; a
// changed total mints a new one (R5 #1).
func idempotencyKey(orderID string, amountCents int64) string {
	sum := sha256.Sum256(fmt.Appendf(nil, "pi:%s:%d", orderID, amountCents))
	return hex.EncodeToString(sum[:])
}

func paymentStatusFor(s IntentStatus) string {
	switch s {
	case IntentSucceeded:
		return "succeeded"
	case IntentRequiresAction:
		return "requires_action"
	case IntentCanceled:
		return "canceled"
	case IntentFailed:
		return "failed"
	default:
		return "requires_payment"
	}
}
