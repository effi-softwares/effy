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
	// CustomerID is the PROVIDER customer id (051). Attaching it is what lets a card the shopper chooses
	// to keep be reused on a later order. ⚠ SetupFutureUsage is deliberately absent from this struct:
	// whether the card is kept is the shopper's decision, made at confirmation, not the server's.
	CustomerID string
}

// PaymentIntent is the provider-neutral result the service persists + returns (client_secret only).
// PaymentMethodSummary is how an order was paid, reduced to what a receipt may show (052 FR-006).
//
// ⚠ NO CARD DATA BEYOND Last4. There is no field here for a card number, an expiry or a cardholder
// name, and none may be added — this is the same boundary 051's payment.ts draws.
type PaymentMethodSummary struct {
	// Effy's OWN family, never the provider's type string: card | wallet | pay_over_time | other.
	Type  string
	Brand string
	Last4 string
}

type PaymentIntent struct {
	ID           string
	ClientSecret string
	Status       IntentStatus
	// AvailableMethods is what the provider says can actually be used for THIS intent — its amount,
	// its currency, this account's activation state, all accounted for (051 US4).
	//
	// ⚠ THE CLIENT CANNOT WORK THIS OUT. Whether a pay-over-time option is offerable depends on the
	// basket total and on account eligibility, neither of which a browser knows. Guessing produces
	// exactly the two failures FR-010/FR-011 forbid: an option offered and then refused after the
	// shopper commits, or one that vanishes with no explanation.
	AvailableMethods []string
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

// ── 051 payment-method types ──────────────────────────────────────────────────────────────────────

// SavedCard is a card the shopper explicitly chose to keep, in provider-neutral form.
//
// ⚠ THESE ARE THE ONLY FIELDS PERMITTED TO LEAVE THE PROVIDER. There is no field for a card number, a
// security code or a cardholder name, and none may be added (FR-025 / SC-012). `Last4` is the only part
// of a card number that ever crosses this boundary.
//
// ⚠ Never persisted. Read live at the moment it is needed, because a mirrored copy rots: a card removed
// at the provider, expired, or replaced by the issuer's auto-updater would keep being offered from a
// stale row (data-model § 2).
type SavedCard struct {
	ID        string
	Brand     string
	Last4     string
	ExpMonth  int64
	ExpYear   int64
	IsDefault bool
}

// CustomerSession authorizes a provider-owned payment-method list for ONE shopper.
//
// ⚠ Minted only for a client that renders such a list — the mobile embedded element. The web card route
// renders Effy's own list and confirms with a payment-method id, so a session there would be an unused
// provider round trip on a path 027 already found latency-sensitive (research R5 AMENDED, spike S2).
type CustomerSession struct {
	ClientSecret string
}

// PaymentGateway is the port. The Stripe adapter (stripegateway.go) implements it; a fake implements it
// in tests.
type PaymentGateway interface {
	// CreatePaymentIntent creates (or, via the deterministic idempotency key, re-returns) one intent.
	CreatePaymentIntent(ctx context.Context, in CreateIntentInput) (PaymentIntent, error)
	// RetrievePaymentIntent re-fetches an intent (the confirm fallback re-reads authoritative status).
	RetrievePaymentIntent(ctx context.Context, intentID string) (PaymentIntent, error)
	// ConstructWebhookEvent verifies the provider signature over the raw body and returns the event.
	ConstructWebhookEvent(payload []byte, signatureHeader string) (WebhookEvent, error)

	// ── 052 ──────────────────────────────────────────────────────────────────────────────────────

	// DescribePaymentMethod reads how an intent was ACTUALLY paid, in a form safe to print on a
	// receipt (FR-006).
	//
	// ⚠ IT COSTS A NETWORK ROUND TRIP, and the caller must therefore keep it OUT of the finalize
	// transaction. The webhook event's `latest_charge` is an id string rather than an expanded
	// object, so this cannot be read from the payload the platform already has.
	//
	// ⚠ A failure here is NOT an error the caller should propagate: the order is already paid, and a
	// receipt without a payment line is a supported state (research R3).
	DescribePaymentMethod(ctx context.Context, intentID string) (PaymentMethodSummary, error)

	// ── 051 ──────────────────────────────────────────────────────────────────────────────────────

	// EnsureCustomer returns the provider customer id for this shopper, creating one if absent.
	// MUST be idempotent: a retried intent for one order must not create a second provider customer.
	EnsureCustomer(ctx context.Context, in EnsureCustomerInput) (customerID string, err error)

	// CreateCustomerSession mints a short-lived, single-customer session for a provider-owned
	// payment-method list. Called only when the caller renders one (mobile).
	CreateCustomerSession(ctx context.Context, providerCustomerID string) (CustomerSession, error)

	// ListSavedCards returns the shopper's kept cards.
	//
	// ⚠ MUST return an error, never an empty slice, when the provider cannot be reached. "You have no
	// cards" and "we could not ask" are different facts, and conflating them is the FR-036 failure mode.
	ListSavedCards(ctx context.Context, providerCustomerID string) ([]SavedCard, error)

	// DetachPaymentMethod removes a kept card. The caller MUST have verified ownership first —
	// the id is client-supplied and a detach that trusts it is a cross-customer write (FR-026).
	DetachPaymentMethod(ctx context.Context, paymentMethodID string) error
}

// EnsureCustomerInput carries what the provider needs to create a customer record. The email and name
// are the platform's own record of this shopper, never client-supplied.
type EnsureCustomerInput struct {
	// Existing is the reference already stored against the customer, when there is one. Non-empty means
	// no create is attempted.
	Existing string
	Email    string
	Name     string
	// CustomerID is Effy's own customer id, carried as provider metadata so a provider-side record can
	// be traced back. ⚠ Not the Cognito subject — that is an auth identifier and has no business here.
	CustomerID string
}
