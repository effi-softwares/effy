package checkout

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/paymentintent"
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
	event, err := webhook.ConstructEvent(payload, signatureHeader, g.webhookSecret)
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
