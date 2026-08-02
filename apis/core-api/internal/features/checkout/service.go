package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
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
	// The order rules (027). Nil-able so existing constructions keep working and the minimum is simply not
	// enforced — a missing policy must never block a shopper from checking out.
	policy cartpolicy.Reader
	// The cart's applied promotional code (027). Nil-able for the same reason: no promotions wired means
	// no discount, never a crash.
	promos PromoSource
}

// PromoSource re-computes the discount for a customer's cart at the moment of payment. An interface so
// checkout does not depend on the cart package's internals, and so a test can state the amount directly.
type PromoSource interface {
	DiscountForCustomer(ctx context.Context, customerID string, payableCents int64, now time.Time) (cents int64, promoCodeID, code string, err error)
}

// WithPromotions enables the promotional discount at intent.
func (s *Service) WithPromotions(p PromoSource) *Service {
	s.promos = p
	return s
}

// WithOrderPolicy enables the minimum-spend refusal (FR-056). Separate from the constructor so the wiring
// change is one greppable line at the composition root rather than a signature every caller must follow.
func (s *Service) WithOrderPolicy(r cartpolicy.Reader) *Service {
	s.policy = r
	return s
}

// BelowMinimumError refuses an order under the platform's minimum spend (027 FR-056). It carries both
// amounts so the client can say how much more is needed rather than only that something is wrong.
type BelowMinimumError struct {
	MinimumCents   int64
	RemainingCents int64
}

func (e *BelowMinimumError) Error() string { return "checkout: order below the minimum" }

func NewService(store Store, gateway PaymentGateway, publishableKey string) *Service {
	svc := &Service{store: store, gateway: gateway, publishableKey: publishableKey}
	return svc
}

// IntentInput carries what placement needs. The customer id and address come from the trusted
// context/DB; NO amount is ever here — the server computes every figure it charges.
//
// ⚠ It used to carry per-package delivery Selections and ExcludedKeys. Delivery zones, quotes and fees
// were withdrawn from the platform, so there is nothing per-package left to choose and nothing to
// exclude: every item in the cart is charged.
type IntentInput struct {
	AddressID string
	// BillingAddressID is the billing address when the customer diverged from shipping (023). Empty, or
	// equal to AddressID, means "billing same as shipping" → the order's billing_address is set to NULL.
	// Billing never affects the amount.
	BillingAddressID string
}

// CreateCheckoutIntent writes the pending order and creates ONE PaymentIntent with a DETERMINISTIC
// idempotency key.
//
// ⚠ THE PLATFORM HAS NO DELIVERY FEE. Zones, quotes, per-package selections and serviceability were
// withdrawn, so the amount charged is simply the item subtotal minus any discount. There is no quote
// to capture, nothing to honour a window on, and no package a shopper can be refused for.
//
// Everything that decides money is still computed HERE and never taken from the client (SC-004).
func (s *Service) CreateCheckoutIntent(ctx context.Context, customerID string, in IntentInput, now time.Time) (IntentResult, error) {
	addressID := in.AddressID
	if _, err := uuid.Parse(addressID); err != nil {
		return IntentResult{}, ErrAddressNotFound
	}

	lines, err := s.store.CartLines(ctx, customerID)
	if err != nil {
		return IntentResult{}, err
	}

	addressJSON, found, err := s.store.AddressSnapshot(ctx, customerID, addressID)
	if err != nil {
		return IntentResult{}, err
	}
	if !found {
		return IntentResult{}, ErrAddressNotFound
	}

	itemSubtotalCents := int64(0)
	for _, l := range lines {
		itemSubtotalCents += l.UnitCents * int64(l.Quantity)
	}

	// ⚠ FR-056: the minimum is re-decided HERE, not trusted from the cart's `checkout.allowed`. A client
	// that ignores the cart's own gate — an outdated build, a hand-rolled request — must still be refused,
	// which is the whole reason the rule lives on the server as well as in the UI.
	if s.policy != nil {
		policy, perr := s.policy.Policy(ctx)
		if perr != nil {
			return IntentResult{}, perr
		}
		if !policy.Meets(itemSubtotalCents) {
			return IntentResult{}, &BelowMinimumError{
				MinimumCents:   policy.MinimumSubtotalCents,
				RemainingCents: policy.Remaining(itemSubtotalCents),
			}
		}
	}

	// 027 FR-027/FR-042: the discount is RECOMPUTED here from the cart's applied code, never carried from
	// the cart response and never taken from the request. What the shopper was shown is a display of the
	// platform's own arithmetic; this is that arithmetic, run again at the moment money is decided.
	discountCents, promoCodeID, promoCode := int64(0), "", ""
	if s.promos != nil {
		d, id, code, derr := s.promos.DiscountForCustomer(ctx, customerID, itemSubtotalCents, now)
		if derr != nil {
			return IntentResult{}, derr
		}
		discountCents, promoCodeID, promoCode = d, id, code
	}

	grandTotalCents := itemSubtotalCents - discountCents
	if grandTotalCents < 0 {
		// A discount larger than the basket cannot produce a negative charge.
		grandTotalCents = 0
	}

	orderID, orderNumber, err := s.store.UpsertPendingOrder(ctx, customerID, OrderAmounts{
		ItemSubtotalCents: itemSubtotalCents,
		// ⚠ There is no delivery fee on this platform. The field is kept on OrderAmounts only until the
		// column is dropped by the withdrawal migration; it is always zero.
		DeliveryFeeCents: 0,
		DiscountCents:    discountCents,
		PromoCodeID:      promoCodeID,
		PromoCode:        promoCode,
		GrandTotalCents:  grandTotalCents,
		Currency:         pricing.Currency,
	}, addressJSON, lines)
	if err != nil {
		return IntentResult{}, err
	}

	// Billing (023): snapshot the billing address onto the order when the customer diverged from
	// shipping; otherwise NULL ("same as shipping"). Billing never affects the amount. Idempotent —
	// re-running the intent after toggling "same as shipping" back ON clears a prior divergent value.
	if err := s.applyBilling(ctx, customerID, orderID, addressID, in.BillingAddressID); err != nil {
		return IntentResult{}, err
	}

	pi, err := s.gateway.CreatePaymentIntent(ctx, CreateIntentInput{
		AmountMinor:    grandTotalCents,
		Currency:       pricing.Currency,
		IdempotencyKey: idempotencyKey(orderID, grandTotalCents),
		OrderID:        orderID,
		OrderNumber:    orderNumber,
	})
	if err != nil {
		return IntentResult{}, err
	}

	if err := s.store.UpsertPayment(ctx, orderID, pi.ID, grandTotalCents, paymentStatusFor(pi.Status)); err != nil {
		return IntentResult{}, err
	}

	return IntentResult{
		OrderID:        orderID,
		OrderNumber:    orderNumber,
		ClientSecret:   pi.ClientSecret,
		PublishableKey: s.publishableKey,
		GrandTotal:     moneyStr(grandTotalCents),
		Currency:       pricing.Currency,
	}, nil
}

// applyBilling writes the order's billing snapshot (023). Empty or same-as-shipping → NULL. A distinct
// billing id is validated (customer-scoped via AddressSnapshot) and snapshotted; a foreign/unknown id is
// refused so a client cannot bill against an address that is not the customer's (FR-021).
func (s *Service) applyBilling(ctx context.Context, customerID, orderID, shippingAddressID, billingAddressID string) error {
	if billingAddressID == "" || billingAddressID == shippingAddressID {
		return s.store.SetOrderBilling(ctx, orderID, nil) // NULL — same as shipping
	}
	if _, err := uuid.Parse(billingAddressID); err != nil {
		return ErrAddressNotFound
	}
	billingJSON, found, err := s.store.AddressSnapshot(ctx, customerID, billingAddressID)
	if err != nil {
		return err
	}
	if !found {
		return ErrAddressNotFound
	}
	return s.store.SetOrderBilling(ctx, orderID, billingJSON)
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

// moneyStr renders integer cents as the platform's 2-dp decimal string. Money never crosses as a float.
func moneyStr(cents int64) string { return money.FormatCents(cents) }
