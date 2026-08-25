package checkout

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/customersession"
	"github.com/stripe/stripe-go/v82/paymentintent"
	"github.com/stripe/stripe-go/v82/paymentmethod"
	"github.com/stripe/stripe-go/v82/webhook"
)

// StripeGateway is the Stripe adapter for PaymentGateway. It holds the secret + webhook secret; neither
// ever leaves this type (SC-012). Constructed once in main and shared.
type StripeGateway struct {
	webhookSecret string
}

// NewStripeGateway sets the process Stripe key and returns the adapter. One secret per process (the
// server talks to one Stripe account).
func NewStripeGateway(secretKey, webhookSecret string) *StripeGateway {
	stripe.Key = secretKey
	return &StripeGateway{webhookSecret: webhookSecret}
}

// CreatePaymentIntent creates one PaymentIntent with automatic capture + automatic payment methods,
// carrying a DETERMINISTIC idempotency key so a retried create returns the same intent (R5 #1).
func (g *StripeGateway) CreatePaymentIntent(ctx context.Context, in CreateIntentInput) (PaymentIntent, error) {
	params := &stripe.PaymentIntentParams{
		Amount:        stripe.Int64(in.AmountMinor),
		Currency:      stripe.String(strings.ToLower(in.Currency)),
		CaptureMethod: stripe.String(string(stripe.PaymentIntentCaptureMethodAutomatic)),
		AutomaticPaymentMethods: &stripe.PaymentIntentAutomaticPaymentMethodsParams{
			Enabled: stripe.Bool(true),
		},
	}
	if in.CustomerID != "" {
		params.Customer = stripe.String(in.CustomerID)
	}
	params.Context = ctx
	params.SetIdempotencyKey(in.IdempotencyKey)
	params.AddMetadata("order_id", in.OrderID)
	params.AddMetadata("order_number", in.OrderNumber)

	pi, err := paymentintent.New(params)
	if err != nil {
		return PaymentIntent{}, fmt.Errorf("checkout: stripe create intent: %w", err)
	}
	return toPaymentIntent(pi), nil
}

// RetrievePaymentIntent re-fetches an intent (the confirm fallback reads authoritative status).
func (g *StripeGateway) RetrievePaymentIntent(ctx context.Context, intentID string) (PaymentIntent, error) {
	params := &stripe.PaymentIntentParams{}
	params.Context = ctx
	pi, err := paymentintent.Get(intentID, params)
	if err != nil {
		return PaymentIntent{}, fmt.Errorf("checkout: stripe get intent: %w", err)
	}
	return toPaymentIntent(pi), nil
}

// ConstructWebhookEvent verifies the Stripe signature over the RAW body (HMAC + timestamp tolerance)
// and extracts the PaymentIntent id + status. A bad signature is an error (the handler 400s).
func (g *StripeGateway) ConstructWebhookEvent(payload []byte, signatureHeader string) (WebhookEvent, error) {
	// IgnoreAPIVersionMismatch: the account's default API version can be newer than the one
	// stripe-go/v82 pins (e.g. an account on `2026-05-27.dahlia` while the SDK expects
	// `2025-08-27.basil`). ConstructEvent treats that as a hard error, which would 400 every webhook
	// and leave every paid order stuck at pending_payment. We only read the event type and the
	// PaymentIntent id below — both stable across these versions — so a mismatched deserialization of
	// fields we never touch is harmless. The HMAC signature is still fully verified either way.
	event, err := webhook.ConstructEventWithOptions(payload, signatureHeader, g.webhookSecret,
		webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true})
	if err != nil {
		return WebhookEvent{}, fmt.Errorf("checkout: webhook signature: %w", err)
	}
	out := WebhookEvent{ID: event.ID, Type: string(event.Type)}

	switch event.Type {
	case EventPaymentSucceeded, EventPaymentFailed:
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
			return WebhookEvent{}, fmt.Errorf("checkout: webhook decode intent: %w", err)
		}
		out.PaymentIntentID = pi.ID
		if event.Type == EventPaymentFailed {
			out.IntentStatus = IntentFailed
		} else {
			out.IntentStatus = IntentSucceeded
		}
	}
	return out, nil
}

// toPaymentIntent normalizes a Stripe PaymentIntent to our provider-neutral shape.
func toPaymentIntent(pi *stripe.PaymentIntent) PaymentIntent {
	return PaymentIntent{
		ID:           pi.ID,
		ClientSecret: pi.ClientSecret,
		Status:       mapIntentStatus(pi.Status),
	}
}

func mapIntentStatus(s stripe.PaymentIntentStatus) IntentStatus {
	switch s {
	case stripe.PaymentIntentStatusSucceeded:
		return IntentSucceeded
	case stripe.PaymentIntentStatusRequiresAction, stripe.PaymentIntentStatusRequiresConfirmation:
		return IntentRequiresAction
	case stripe.PaymentIntentStatusCanceled:
		return IntentCanceled
	default:
		// requires_payment_method, processing, requires_capture → still pending from our side.
		return IntentRequiresPaymentMethod
	}
}

// ensure the adapter satisfies the port.
var _ PaymentGateway = (*StripeGateway)(nil)

// ── 051 payment methods ───────────────────────────────────────────────────────────────────────────

// EnsureCustomer returns the provider customer id, creating one only when the platform holds none.
//
// ⚠ Idempotent by construction: a non-empty `Existing` short-circuits before any provider call, so a
// retried intent for one order cannot create a second provider customer (FR-038). The caller persists
// the result inside the same transaction that upserts the pending order.
func (g *StripeGateway) EnsureCustomer(ctx context.Context, in EnsureCustomerInput) (string, error) {
	if in.Existing != "" {
		return in.Existing, nil
	}
	params := &stripe.CustomerParams{}
	params.Context = ctx
	if in.Email != "" {
		params.Email = stripe.String(in.Email)
	}
	if in.Name != "" {
		params.Name = stripe.String(in.Name)
	}
	// Metadata only — enough to trace a provider record back to its Effy customer during support work.
	// ⚠ Never the Cognito subject: that is an auth identifier and has no business at a payment provider.
	params.AddMetadata("effy_customer_id", in.CustomerID)

	c, err := customer.New(params)
	if err != nil {
		return "", fmt.Errorf("checkout: stripe create customer: %w", err)
	}
	return c.ID, nil
}

// CreateCustomerSession mints a short-lived session scoped to ONE customer.
//
// `payment_method_redisplay` is what makes the shopper's kept cards appear; `payment_method_save` is what
// renders the save checkbox and — critically — lets the provider set `allow_redisplay` from what the
// shopper actually ticked. ⚠ The PaymentIntent must NOT also carry `setup_future_usage`: combining the
// two is a documented integration error and would keep a card the shopper declined (FR-020, research R5).
func (g *StripeGateway) CreateCustomerSession(ctx context.Context, providerCustomerID string) (CustomerSession, error) {
	params := &stripe.CustomerSessionParams{
		Customer: stripe.String(providerCustomerID),
		Components: &stripe.CustomerSessionComponentsParams{
			PaymentElement: &stripe.CustomerSessionComponentsPaymentElementParams{
				Enabled: stripe.Bool(true),
				Features: &stripe.CustomerSessionComponentsPaymentElementFeaturesParams{
					PaymentMethodRedisplay: stripe.String("enabled"),
					PaymentMethodSave:      stripe.String("enabled"),
					PaymentMethodRemove:    stripe.String("enabled"),
				},
			},
		},
	}
	params.Context = ctx

	sess, err := customersession.New(params)
	if err != nil {
		return CustomerSession{}, fmt.Errorf("checkout: stripe create customer session: %w", err)
	}
	return CustomerSession{ClientSecret: sess.ClientSecret}, nil
}

// ListSavedCards returns the shopper's kept cards.
//
// ⚠ An error here is NOT an empty list. A provider outage must surface as a failure so the caller can say
// "we could not ask" rather than "you have no cards" — different facts, and conflating them is the
// FR-036 failure mode (contract § 2).
func (g *StripeGateway) ListSavedCards(ctx context.Context, providerCustomerID string) ([]SavedCard, error) {
	cust, err := customer.Get(providerCustomerID, &stripe.CustomerParams{
		Params: stripe.Params{Context: ctx},
	})
	if err != nil {
		return nil, fmt.Errorf("checkout: stripe get customer: %w", err)
	}
	defaultPM := ""
	if cust.InvoiceSettings != nil && cust.InvoiceSettings.DefaultPaymentMethod != nil {
		defaultPM = cust.InvoiceSettings.DefaultPaymentMethod.ID
	}

	listParams := &stripe.PaymentMethodListParams{
		Customer: stripe.String(providerCustomerID),
		Type:     stripe.String(string(stripe.PaymentMethodTypeCard)),
	}
	listParams.Context = ctx

	out := []SavedCard{}
	iter := paymentmethod.List(listParams)
	for iter.Next() {
		pm := iter.PaymentMethod()
		if pm.Card == nil {
			continue
		}
		out = append(out, SavedCard{
			ID:        pm.ID,
			Brand:     string(pm.Card.Brand),
			Last4:     pm.Card.Last4,
			ExpMonth:  pm.Card.ExpMonth,
			ExpYear:   pm.Card.ExpYear,
			IsDefault: pm.ID == defaultPM,
		})
	}
	if err := iter.Err(); err != nil {
		return nil, fmt.Errorf("checkout: stripe list payment methods: %w", err)
	}
	return out, nil
}

// DetachPaymentMethod removes a kept card from its customer.
//
// ⚠ Ownership is the CALLER's job and must already have been checked — this method cannot tell whose card
// it is being handed, and a detach that trusts a client-supplied id is a cross-customer write (FR-026).
func (g *StripeGateway) DetachPaymentMethod(ctx context.Context, paymentMethodID string) error {
	params := &stripe.PaymentMethodDetachParams{}
	params.Context = ctx
	if _, err := paymentmethod.Detach(paymentMethodID, params); err != nil {
		return fmt.Errorf("checkout: stripe detach payment method: %w", err)
	}
	return nil
}
