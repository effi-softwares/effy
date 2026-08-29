package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/customersession"
	"github.com/stripe/stripe-go/v82/paymentintent"
	"github.com/stripe/stripe-go/v82/paymentmethod"
	"github.com/stripe/stripe-go/v82/refund"
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

// DescribePaymentMethod reads how the intent was actually paid (052 FR-006).
//
// ⚠ THE EXPAND IS THE WHOLE POINT. `latest_charge` on a PaymentIntent is an ID STRING; without asking
// Stripe to expand it (and the payment-method details inside it) there is no brand and no last4 to
// read. That is why this is a separate call rather than something the webhook payload already carried.
//
// ⚠ Everything here degrades to a zero value rather than erroring on shape. A receipt with no payment
// line is a supported state; a receipt read that fails because a provider changed a nested field is
// not. The caller additionally ignores the error entirely (see store.go) — this signature returns one
// only so a caller COULD log it.
func (g *StripeGateway) DescribePaymentMethod(ctx context.Context, intentID string) (PaymentMethodSummary, error) {
	params := &stripe.PaymentIntentParams{}
	params.Context = ctx
	params.AddExpand("latest_charge.payment_method_details")
	pi, err := paymentintent.Get(intentID, params)
	if err != nil {
		return PaymentMethodSummary{}, fmt.Errorf("checkout: stripe describe method: %w", err)
	}
	if pi == nil || pi.LatestCharge == nil || pi.LatestCharge.PaymentMethodDetails == nil {
		return PaymentMethodSummary{}, nil
	}

	d := pi.LatestCharge.PaymentMethodDetails
	switch {
	case d.Card != nil:
		// ⚠ A card paid through a wallet still arrives as `card`, with the wallet named inside it.
		// Reporting "Apple Pay" where the shopper used Apple Pay is the honest answer; falling back to
		// "Visa" when there is no wallet is equally honest. Both read correctly on a receipt.
		if d.Card.Wallet != nil && d.Card.Wallet.Type != "" {
			return PaymentMethodSummary{
				Type:  "wallet",
				Brand: string(d.Card.Wallet.Type),
				Last4: d.Card.Last4,
			}, nil
		}
		return PaymentMethodSummary{Type: "card", Brand: string(d.Card.Brand), Last4: d.Card.Last4}, nil
	case d.Klarna != nil:
		return PaymentMethodSummary{Type: "pay_over_time", Brand: "klarna"}, nil
	case d.AfterpayClearpay != nil:
		return PaymentMethodSummary{Type: "pay_over_time", Brand: "afterpay"}, nil
	case d.Zip != nil:
		return PaymentMethodSummary{Type: "pay_over_time", Brand: "zip"}, nil
	default:
		// ⚠ `other`, NOT an error and NOT a guess. An unrecognised method still deserves a receipt;
		// inventing a brand for it would put a false fact on a financial record.
		return PaymentMethodSummary{Type: "other", Brand: string(d.Type)}, nil
	}
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

	case EventRefundCreated, EventRefundUpdated, EventRefundFailed:
		// 055. ⚠ The refund's own id is what the platform keys on — NOT the PaymentIntent. An order
		// can have several refunds, and attaching an outcome to the intent would apply one refund's
		// fate to all of them.
		var r stripe.Refund
		if err := json.Unmarshal(event.Data.Raw, &r); err != nil {
			return WebhookEvent{}, fmt.Errorf("checkout: webhook decode refund: %w", err)
		}
		out.RefundID = r.ID
		out.RefundStatus = RefundStatus(r.Status)
		out.RefundAmountCents = r.Amount
		if r.PaymentIntent != nil {
			out.RefundPaymentIntentID = r.PaymentIntent.ID
		}
		out.FailureReason = string(r.FailureReason)
		if r.PaymentIntent != nil {
			out.PaymentIntentID = r.PaymentIntent.ID
		}
	}
	return out, nil
}

// toPaymentIntent normalizes a Stripe PaymentIntent to our provider-neutral shape.
func toPaymentIntent(pi *stripe.PaymentIntent) PaymentIntent {
	return PaymentIntent{
		ID:               pi.ID,
		ClientSecret:     pi.ClientSecret,
		Status:           mapIntentStatus(pi.Status),
		AvailableMethods: pi.PaymentMethodTypes,
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
		// ⚠ CONSENT IS A FIELD ON THE CARD, AND THIS LIST MUST HONOUR IT (FR-020).
		//
		// `allow_redisplay` is the provider's record of what the shopper ticked: `always` when they
		// chose to keep the card, `limited` when the save control was shown and left UNTICKED, and
		// `unspecified` (the API default) for anything attached without asking. The provider's own
		// element filters on this; a raw `paymentmethod.List` does not — so without this test Effy's
		// list would show cards the shopper declined while the element correctly hid them. Two views
		// of one question, disagreeing, with ours being the wrong one.
		if pm.AllowRedisplay != stripe.PaymentMethodAllowRedisplayAlways {
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

// CreateRefund returns money for a payment, in whole or in part (055).
//
// ⚠ THREE THINGS THIS DOES THAT ARE EASY TO GET WRONG.
//
//  1. **The idempotency key is the caller's, not a fresh one.** It is the same key stored on the
//     refund row, so an ambiguous retry — a timeout where we do not know whether the refund exists —
//     is recognised by the provider as the same request and returns the original rather than creating
//     a second. Without it, FR-005d's automatic retry would be a way to refund twice.
//
//  2. **A refusal is classified, not just returned.** A provider error that names a decision comes
//     back as *RefusedError so the caller never retries it; anything else (a timeout, an unreachable
//     host, a 5xx) stays ambiguous and IS retried. Retrying a decision fills a queue with attempts
//     that can never succeed; not retrying an ambiguous failure abandons money mid-flight.
//
//  3. **Success means SUBMITTED.** The returned status is usually `pending` — the bank has not moved
//     anything. The caller must not record the money as returned on the strength of this (FR-007).
func (g *StripeGateway) CreateRefund(ctx context.Context, in CreateRefundInput) (Refund, error) {
	params := &stripe.RefundParams{
		PaymentIntent: stripe.String(in.PaymentIntentID),
		Amount:        stripe.Int64(in.AmountCents),
	}
	params.Context = ctx
	// ⚠ The SAME key the refund row carries. This is the whole of the retry safety.
	params.SetIdempotencyKey(in.IdempotencyKey)
	if in.Reason != "" {
		params.Reason = stripe.String(in.Reason)
	}
	for k, v := range in.Metadata {
		params.AddMetadata(k, v)
	}

	r, err := refund.New(params)
	if err != nil {
		// ⚠ A card_error or invalid_request_error is the provider REFUSING — a decision. An
		// api_error, rate-limit or transport failure is AMBIGUOUS: the refund may already exist.
		var serr *stripe.Error
		if errors.As(err, &serr) {
			switch serr.Type {
			case stripe.ErrorTypeCard, stripe.ErrorTypeInvalidRequest:
				return Refund{}, &RefusedError{Reason: serr.Msg}
			}
		}
		return Refund{}, fmt.Errorf("checkout: create refund: %w", err)
	}
	return Refund{
		ID:            r.ID,
		Status:        RefundStatus(r.Status),
		FailureReason: string(r.FailureReason),
	}, nil
}
