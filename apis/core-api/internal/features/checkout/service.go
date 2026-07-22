package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
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
	OrderID           string
	OrderNumber       string
	ClientSecret      string
	PublishableKey    string
	GrandTotal        string
	Currency          string
	DeliveryBreakdown []BreakdownLine
}

// BreakdownLine is one anonymous per-package delivery line for the order summary (021). No shop.
type BreakdownLine struct {
	PackageKey   string
	ServiceLevel string
	FeeAmount    string
}

// ConfirmResult is the fallback-finalizer ack; the client reads the full receipt from GET /v1/orders/{id}.
type ConfirmResult struct {
	OrderID string
	Paid    bool
}

type Service struct {
	store          Store
	qstore         QuoteStore
	gateway        PaymentGateway
	publishableKey string
}

func NewService(store Store, gateway PaymentGateway, publishableKey string) *Service {
	svc := &Service{store: store, gateway: gateway, publishableKey: publishableKey}
	// pgStore implements both Store and QuoteStore; a test Store that also implements QuoteStore is used
	// directly, else the delivery-quote paths are unavailable (nil) — the fake supplies its own.
	if qs, ok := store.(QuoteStore); ok {
		svc.qstore = qs
	}
	return svc
}

// IntentInput carries the customer's per-package delivery choices for placement (021). The customer id
// and address come from the trusted context/DB; NO fee is ever here — the server prices from the
// captured quote (SC-004).
type IntentInput struct {
	AddressID string
	// BillingAddressID is the billing address when the customer diverged from shipping (023). Empty, or
	// equal to AddressID, means "billing same as shipping" → the order's billing_address is set to NULL.
	// Billing never affects the amount or the quote.
	BillingAddressID string
	Selections       []DeliverySelection
	ExcludedKeys     []string
}

// CreateCheckoutIntent prices delivery PER PACKAGE from the captured quote (never the client), writes
// the pending order + per-package deliveries, and creates ONE PaymentIntent with a DETERMINISTIC
// idempotency key. Honors the captured quote within its validity window (021 FR-011); refuses on
// expiry, an invalid selection, or an exclusion set that disagrees with serviceability (R8).
func (s *Service) CreateCheckoutIntent(ctx context.Context, customerID string, in IntentInput, now time.Time) (IntentResult, error) {
	addressID := in.AddressID
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

	// The captured quote is the authority for per-package fees (FR-011). No captured quote → the client
	// must quote first.
	cq, orderID, orderNumber, found, err := s.qstore.ReadCapturedQuote(ctx, customerID)
	if err != nil {
		return IntentResult{}, err
	}
	if !found {
		return IntentResult{}, ErrQuoteExpired // treat "no quote" as "must (re)quote"
	}
	if now.After(cq.ExpiresAt) {
		return IntentResult{}, ErrQuoteExpired
	}

	selByKey := map[string]DeliverySelection{}
	for _, sel := range in.Selections {
		selByKey[sel.PackageKey] = sel
	}
	excluded := map[string]bool{}
	for _, k := range in.ExcludedKeys {
		excluded[k] = true
	}

	deliveries, deliveryFeeCents, err := resolveSelections(cq, selByKey, excluded, now)
	if err != nil {
		return IntentResult{}, err // ErrExclusionMismatch / ErrSelectionInvalid / ErrNoServiceableItems
	}

	// Item subtotal excludes any items in an unserviceable (excluded) package — they are not charged.
	itemSubtotalCents := payableSubtotal(lines, cq, excluded)
	grandTotalCents := itemSubtotalCents + deliveryFeeCents

	if err := s.qstore.WritePackageDeliveries(ctx, orderID, deliveries, itemSubtotalCents, deliveryFeeCents, cq.ExpiresAt); err != nil {
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

	breakdown := make([]BreakdownLine, 0, len(deliveries))
	for _, d := range deliveries {
		breakdown = append(breakdown, BreakdownLine{
			PackageKey:   delivery.PackageKey(d.ShopID),
			ServiceLevel: d.ServiceLevel,
			FeeAmount:    moneyStr(d.FeeCents),
		})
	}

	return IntentResult{
		OrderID:           orderID,
		OrderNumber:       orderNumber,
		ClientSecret:      pi.ClientSecret,
		PublishableKey:    s.publishableKey,
		GrandTotal:        moneyStr(grandTotalCents),
		Currency:          pricing.Currency,
		DeliveryBreakdown: breakdown,
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

// payableSubtotal sums the line subtotals for every line whose package is NOT excluded (021). Items in
// an auto-set-aside undeliverable package are never charged (FR-006b, SC-011a). Never trusts a client
// amount — it recomputes from the cart lines.
func payableSubtotal(lines []CheckoutLine, cq CapturedQuote, excluded map[string]bool) int64 {
	excludedShops := map[string]bool{}
	for _, p := range cq.Packages {
		if excluded[p.PackageKey] {
			excludedShops[p.ShopID] = true
		}
	}
	var subtotal int64
	for _, l := range lines {
		if excludedShops[l.ShopID] {
			continue
		}
		subtotal += l.UnitCents * int64(l.Quantity)
	}
	return subtotal
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
