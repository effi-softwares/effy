// Package checkout owns the customer checkout, payment, order placement and multi-shop fan-out.
//
// The payment provider sits behind the PaymentGateway PORT (Principle VI): the service depends on this
// interface, a Stripe adapter implements it, and tests use a fake — so amount authority, idempotency
// and the placement transaction are all testable without a live Stripe. The Stripe SECRET never leaves
// this package (research R3/SC-012).
package checkout

import "context"

// IntentStatus is our normalized PaymentIntent status (maps onto payment.status / order lifecycle).
type IntentStatus string

const (
	IntentRequiresPaymentMethod IntentStatus = "requires_payment"
	IntentRequiresAction        IntentStatus = "requires_action"
	IntentSucceeded             IntentStatus = "succeeded"
	IntentFailed                IntentStatus = "failed"
	IntentCanceled              IntentStatus = "canceled"
)

// CreateIntentInput is the server-authoritative charge request. AmountMinor is integer minor units
// (cents) — converted from the order's numeric(12,2) grand total at this boundary only (research R9).
// IdempotencyKey is DETERMINISTIC (sha256 over order id + attempt) so a retried create returns the same
// intent (research R5 guard #1).
type CreateIntentInput struct {
	AmountMinor    int64
	Currency       string
	IdempotencyKey string
	OrderID        string
	OrderNumber    string
}

// PaymentIntent is the provider-neutral result the service persists + returns (client_secret only).
type PaymentIntent struct {
	ID           string
	ClientSecret string
	Status       IntentStatus
}

// WebhookEvent is the verified, provider-neutral event the webhook handler acts on.
type WebhookEvent struct {
	ID              string
	Type            string
	PaymentIntentID string
	IntentStatus    IntentStatus
}

// Webhook event types we act on.
const (
	EventPaymentSucceeded = "payment_intent.succeeded"
	EventPaymentFailed    = "payment_intent.payment_failed"
)

// PaymentGateway is the port. The Stripe adapter (stripegateway.go) implements it; a fake implements it
// in tests.
type PaymentGateway interface {
	// CreatePaymentIntent creates (or, via the deterministic idempotency key, re-returns) one intent.
	CreatePaymentIntent(ctx context.Context, in CreateIntentInput) (PaymentIntent, error)
	// RetrievePaymentIntent re-fetches an intent (the confirm fallback re-reads authoritative status).
	RetrievePaymentIntent(ctx context.Context, intentID string) (PaymentIntent, error)
	// ConstructWebhookEvent verifies the provider signature over the raw body and returns the event.
	ConstructWebhookEvent(payload []byte, signatureHeader string) (WebhookEvent, error)
}
