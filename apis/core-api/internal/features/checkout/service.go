package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/pricing"
)

// quoteValidity is how long a captured delivery quote is honoured before the shopper must re-quote.
const quoteValidity = 30 * time.Minute

// Sentinel errors mapped by the handler.
var (
	ErrEmptyCart       = errors.New("checkout: cart has no payable items")
	ErrAddressNotFound = errors.New("checkout: address not found")
	ErrOrderNotFound   = errors.New("checkout: order not found")
	// ErrNotServiceable means the destination postcode is in no active delivery zone (047 FR-002): the
	// single "we don't deliver there yet" outcome. Standard and same-day alike are simply unavailable.
	ErrNotServiceable = errors.New("checkout: address is not in a delivery zone")
	// ErrPaymentMethodNotFound covers BOTH "no such card" and "not this shopper's card" (051). They are
	// deliberately indistinguishable: separating them would turn the route into an oracle for whether a
	// payment-method id exists on the platform.
	ErrPaymentMethodNotFound = errors.New("checkout: payment method not found")
)

// IntentResult is returned to the client (client_secret only — the secret key never leaves core-api).
type IntentResult struct {
	OrderID        string
	OrderNumber    string
	ClientSecret   string
	PublishableKey string
	GrandTotal     string
	Currency       string
	// 051 — additive. Every field above keeps its name and meaning.
	//
	// CustomerSessionSecret authorizes a provider-owned payment-method list, and is minted ONLY for a
	// client that renders one (mobile). Empty for web, which renders Effy's own list and confirms with a
	// payment-method id — minting a session there would be an unused provider round trip on a path 027
	// already found latency-sensitive (spike S2).
	CustomerSessionSecret string
	// ProviderCustomerID accompanies the session, and ONLY the session (051 US3).
	//
	// ⚠ Both mobile SDKs take the id and the secret together — a session without its id cannot be
	// attached. Empty whenever no session is minted, which is every web request. The secret is the
	// credential; this id alone reaches no API (data-model § 1, amended).
	ProviderCustomerID string
	// PayOverTimeAvailable reports whether the provider offers any instalment option for this intent.
	//
	// ⚠ A BOOLEAN, not the list. Which providers are offered is the payment element's business; all
	// Effy needs to know is whether the row is worth rendering at all. Sending the raw list would leak
	// account configuration to a client that has no use for it.
	PayOverTimeAvailable bool
	// BillingDetails is what the client passes back at confirmation, because the payment step no longer
	// asks the shopper for a country, a postcode or a name (FR-014/FR-015).
	BillingDetails BillingDetails
}

// BillingDetails is what Effy supplies on the shopper's behalf at confirmation.
//
// ⚠ DERIVED FROM THE ORDER, NEVER FROM THE REQUEST. It is the address the shopper confirmed one screen
// earlier plus the platform's own record of their name — which is what stops the provider guessing a
// country from the shopper's IP, the cause of "Country: Sri Lanka" on an Australia-only storefront.
type BillingDetails struct {
	Name    string
	Email   string
	Address BillingAddress
}

// BillingAddress mirrors the order's stored address snapshot. Country is ISO-3166 alpha-2.
type BillingAddress struct {
	Line1      string
	Line2      string
	City       string
	State      string
	PostalCode string
	Country    string
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
	// The delivery fee engine (047). Nil-able like the others: with no quoter wired, no delivery fee is
	// charged and no quote is captured — the platform's pre-047 behaviour, and what the unit tests use.
	delivery DeliveryQuoter
	// Delivery telemetry (047). Nil-able; a no-op when unwired.
	deliveryMetrics DeliveryMetrics
}

// DeliveryQuoter computes the delivery quote (standard + same-day options) for a destination postcode +
// per-shop packages at time `now`. The concrete implementation is *delivery.Quoter; an interface keeps
// checkout decoupled and testable.
type DeliveryQuoter interface {
	Quote(ctx context.Context, postcode string, pkgs []delivery.PackageInput, now time.Time) (delivery.QuoteResult, error)
}

// WithDelivery enables the delivery fee engine (047). Separate from the constructor so the wiring is one
// greppable line at the composition root, matching WithPromotions / WithOrderPolicy.
func (s *Service) WithDelivery(q DeliveryQuoter) *Service {
	s.delivery = q
	return s
}

// DeliveryMetrics is the checkout's telemetry sink for delivery (047). Nil-able; low-cardinality labels
// only, never PII (Principle VII).
type DeliveryMetrics interface {
	DeliveryQuoted(outcome string) // same_day_and_standard | standard_only | unserviced
	DeliveryQuoteFailed()          // the served-zone-unpriced invariant alarm (FR-029)
}

// WithDeliveryMetrics wires the delivery telemetry sink.
func (s *Service) WithDeliveryMetrics(m DeliveryMetrics) *Service {
	s.deliveryMetrics = m
	return s
}

// deliveryOutcome classifies a served quote for the outcome counter.
func deliveryOutcome(q delivery.QuoteResult) string {
	if !q.Serviced {
		return "unserviced"
	}
	for _, p := range q.Packages {
		for _, o := range p.Options {
			if o.Method == delivery.MethodSameDay {
				return "same_day_and_standard"
			}
		}
	}
	return "standard_only"
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
type IntentInput struct {
	AddressID string
	// BillingAddressID is the billing address when the customer diverged from shipping (023). Empty, or
	// equal to AddressID, means "billing same as shipping" → the order's billing_address is set to NULL.
	// Billing never affects the amount.
	BillingAddressID string
	// DeliveryMethod is the shopper's order-level delivery preference (047): "same_day" or "standard"
	// (default). It is applied per package where that method is offered, falling back to standard for any
	// package where it is not (FR-044/SC-011) — so a mixed basket charges same-day only where possible.
	// The client never sends a fee; the server prices the chosen method from the captured quote (FR-036).
	DeliveryMethod string
	// WantsProviderMethodList asks for a customer session, and is set ONLY by a client that renders a
	// provider-owned payment-method list — the mobile embedded element (051, spike S2).
	//
	// ⚠ This is a capability request, not an authorization: the session is always minted for the
	// AUTHENTICATED subject, so a client asking for one can only ever get its own.
	WantsProviderMethodList bool
}

// CreateCheckoutIntent writes the pending order and creates ONE PaymentIntent with a DETERMINISTIC
// idempotency key. The amount is items − discount + the server-computed delivery fee (047), captured so
// the order is honoured at the quoted fee. Everything that decides money is computed HERE and never taken
// from the client (SC-004).
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

	// 047: the delivery fee. Computed HERE from the destination postcode and the cart's per-shop weights,
	// NEVER taken from the client (SC-004). A not-serviceable address is refused with one reason
	// (ErrNotServiceable). With no quoter wired the fee is zero and nothing is captured (pre-047 path).
	deliveryFeeCents := int64(0)
	var deliveryPkgs []PackageDelivery
	var deliveryQuoteJSON []byte
	if s.delivery != nil {
		postcode, ok := destinationPostcode(addressJSON)
		if !ok {
			return IntentResult{}, ErrAddressNotFound
		}
		quote, qerr := s.delivery.Quote(ctx, postcode, packagesFromLines(lines), now)
		if qerr != nil {
			// ⚠ The invariant breach (a served zone that could not be priced) fires the alarm — it must
			// never happen, and is a page, not a metric to watch idly (FR-029).
			if errors.Is(qerr, delivery.ErrServedZoneUnpriced) && s.deliveryMetrics != nil {
				s.deliveryMetrics.DeliveryQuoteFailed()
			}
			return IntentResult{}, qerr
		}
		if s.deliveryMetrics != nil {
			s.deliveryMetrics.DeliveryQuoted(deliveryOutcome(quote))
		}
		if !quote.Serviced {
			return IntentResult{}, ErrNotServiceable
		}
		// Resolve the shopper's order-level preference per package: same-day where offered, standard
		// elsewhere (FR-044). Absent/unknown preference → standard everywhere.
		preferred := preferredMethod(in.DeliveryMethod)
		deliveryPkgs = resolveDelivery(quote, preferred)
		for _, p := range deliveryPkgs {
			deliveryFeeCents += p.FeeCents
		}
		deliveryQuoteJSON = marshalCapturedQuote(quote)
	}
	grandTotalCents += deliveryFeeCents

	// ⚠ MAY THIS CHECKOUT RECYCLE THE CUSTOMER'S OPEN ORDER? Asked before the upsert, because recycling
	// a row whose payment attempt has already settled is what makes a second order become the first.
	// The full reasoning is on `mayReusePendingOrder`.
	reusePending, err := s.mayReusePendingOrder(ctx, customerID)
	if err != nil {
		return IntentResult{}, err
	}

	orderID, orderNumber, err := s.store.UpsertPendingOrder(ctx, customerID, OrderAmounts{
		ItemSubtotalCents: itemSubtotalCents,
		DeliveryFeeCents:  deliveryFeeCents,
		DiscountCents:     discountCents,
		PromoCodeID:       promoCodeID,
		PromoCode:         promoCode,
		GrandTotalCents:   grandTotalCents,
		Currency:          pricing.Currency,
	}, addressJSON, lines, reusePending)
	if err != nil {
		return IntentResult{}, err
	}

	// Capture the quote so intent honours it within the validity window and the client never sends a fee
	// (047 FR-036). Written after the order exists; re-run on every intent (delete+reinsert).
	if s.delivery != nil {
		if err := s.store.CaptureDelivery(ctx, orderID, deliveryQuoteJSON, now.Add(quoteValidity), deliveryPkgs); err != nil {
			return IntentResult{}, err
		}
	}

	// Billing (023): snapshot the billing address onto the order when the customer diverged from
	// shipping; otherwise NULL ("same as shipping"). Billing never affects the amount. Idempotent —
	// re-running the intent after toggling "same as shipping" back ON clears a prior divergent value.
	// 051: applyBilling now also hands back the snapshot it settled on — the SAME bytes the order stores —
	// so the billing details Effy sends at confirmation cannot drift from the billing address it recorded.
	billingSnapshot, err := s.applyBilling(ctx, customerID, orderID, addressID, in.BillingAddressID, addressJSON)
	if err != nil {
		return IntentResult{}, err
	}

	// 051 — the provider customer, resolved before the intent so a saved card can attach to it.
	// Idempotent: an existing reference short-circuits, and the write is first-wins (store.go).
	providerCustomerID, profileEmail, profileName, err := s.store.PaymentProfile(ctx, customerID)
	if err != nil {
		return IntentResult{}, err
	}
	resolved, err := s.gateway.EnsureCustomer(ctx, EnsureCustomerInput{
		Existing:   providerCustomerID,
		Email:      profileEmail,
		Name:       profileName,
		CustomerID: customerID,
	})
	if err != nil {
		return IntentResult{}, err
	}
	if resolved != providerCustomerID {
		if err := s.store.SetProviderCustomerID(ctx, customerID, resolved); err != nil {
			return IntentResult{}, err
		}
	}

	// ⚠ The session is minted CONCURRENTLY with the intent, and only when the caller renders a
	// provider-owned method list. 027 measured a Sydney round trip at ~135 ms and found this path
	// latency-sensitive; a serial mint spends another one for nothing.
	type sessionResult struct {
		secret string
		err    error
	}
	sessionCh := make(chan sessionResult, 1)
	if in.WantsProviderMethodList {
		go func() {
			sess, sErr := s.gateway.CreateCustomerSession(ctx, resolved)
			sessionCh <- sessionResult{secret: sess.ClientSecret, err: sErr}
		}()
	} else {
		sessionCh <- sessionResult{}
	}

	// ⚠ `Customer` is what lets a kept card attach. `SetupFutureUsage` is deliberately NOT set here:
	// whether the card is kept is the shopper's choice, made at confirmation, and setting it server-side
	// would keep a card they declined (FR-020, research R5).
	pi, err := s.gateway.CreatePaymentIntent(ctx, CreateIntentInput{
		AmountMinor:    grandTotalCents,
		Currency:       pricing.Currency,
		IdempotencyKey: idempotencyKey(orderID, grandTotalCents, resolved),
		OrderID:        orderID,
		OrderNumber:    orderNumber,
		CustomerID:     resolved,
	})
	if err != nil {
		return IntentResult{}, err
	}

	session := <-sessionCh
	if session.err != nil {
		return IntentResult{}, session.err
	}

	if err := s.store.UpsertPayment(ctx, orderID, pi.ID, grandTotalCents, paymentStatusFor(pi.Status)); err != nil {
		return IntentResult{}, err
	}

	return IntentResult{
		OrderID:               orderID,
		OrderNumber:           orderNumber,
		ClientSecret:          pi.ClientSecret,
		PublishableKey:        s.publishableKey,
		GrandTotal:            moneyStr(grandTotalCents),
		Currency:              pricing.Currency,
		CustomerSessionSecret: session.secret,
		ProviderCustomerID:    providerIDFor(in.WantsProviderMethodList, resolved),
		PayOverTimeAvailable:  hasPayOverTime(pi.AvailableMethods),
		BillingDetails:        billingDetailsFrom(billingSnapshot, profileName, profileEmail),
	}, nil
}

// payOverTimeMethods are the instalment providers Effy can accept.
//
// ⚠ Australia only, and that is what bounds this list. PayPal and Amazon Pay are absent because an
// AU-domiciled business cannot offer them at all (research R1); Afterpay is present because it IS
// AU-supported and simply awaits account activation, so the day it activates this needs no code change
// (FR-013).
var payOverTimeMethods = map[string]bool{
	"klarna":            true,
	"zip":               true,
	"afterpay_clearpay": true,
}

// hasPayOverTime reports whether the provider offered any instalment option for this intent.
func hasPayOverTime(available []string) bool {
	for _, m := range available {
		if payOverTimeMethods[m] {
			return true
		}
	}
	return false
}

// providerIDFor returns the provider customer id ONLY when a session was minted for it.
//
// ⚠ Guarded rather than returned unconditionally: the id has no purpose without the session, and
// leaking it into every web response would break the rule that it travels only where an SDK needs it.
func providerIDFor(wantsSession bool, providerCustomerID string) string {
	if !wantsSession {
		return ""
	}
	return providerCustomerID
}

// billingDetailsFrom maps the order's stored address snapshot to what the client passes back at
// confirmation (051 FR-016).
//
// ⚠ The snapshot is the ONLY source. A client-supplied billing object is ignored upstream, because
// honouring one would let it contradict the address the shopper confirmed one screen earlier.
func billingDetailsFrom(snapshot []byte, name, email string) BillingDetails {
	out := BillingDetails{Name: name, Email: email}
	out.Address.Country = "AU" // Effy sells in one country; the snapshot may predate the field.
	if len(snapshot) == 0 {
		return out
	}
	var snap struct {
		RecipientName string `json:"recipientName"`
		Line1         string `json:"line1"`
		Line2         string `json:"line2"`
		City          string `json:"city"`
		Region        string `json:"region"`
		PostalCode    string `json:"postalCode"`
		Country       string `json:"country"`
	}
	if err := json.Unmarshal(snapshot, &snap); err != nil {
		// A malformed snapshot must not block a payment: the provider tolerates partial billing details,
		// and the shopper losing their basket over a mapping failure would be the worse outcome.
		return out
	}
	out.Address = BillingAddress{
		Line1:      snap.Line1,
		Line2:      snap.Line2,
		City:       snap.City,
		State:      snap.Region,
		PostalCode: snap.PostalCode,
		Country:    snap.Country,
	}
	if out.Address.Country == "" {
		out.Address.Country = "AU"
	}
	// The recipient on the order is a better name for a receipt than a profile display name, which may
	// be empty on the OTP and federated routes (011).
	if snap.RecipientName != "" {
		out.Name = snap.RecipientName
	}
	return out
}

// applyBilling writes the order's billing snapshot (023). Empty or same-as-shipping → NULL. A distinct
// billing id is validated (customer-scoped via AddressSnapshot) and snapshotted; a foreign/unknown id is
// refused so a client cannot bill against an address that is not the customer's (FR-021).
// It returns the snapshot that EFFECTIVELY governs billing — the shipping snapshot when the shopper did
// not diverge, the divergent one when they did — so the caller can derive the billing details it sends at
// confirmation from the same bytes the order stores (051 FR-016). The order still records NULL for
// "same as shipping"; only the returned value differs.
func (s *Service) applyBilling(ctx context.Context, customerID, orderID, shippingAddressID, billingAddressID string, shippingJSON []byte) ([]byte, error) {
	if billingAddressID == "" || billingAddressID == shippingAddressID {
		if err := s.store.SetOrderBilling(ctx, orderID, nil); err != nil { // NULL — same as shipping
			return nil, err
		}
		return shippingJSON, nil
	}
	if _, err := uuid.Parse(billingAddressID); err != nil {
		return nil, ErrAddressNotFound
	}
	billingJSON, found, err := s.store.AddressSnapshot(ctx, customerID, billingAddressID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrAddressNotFound
	}
	if err := s.store.SetOrderBilling(ctx, orderID, billingJSON); err != nil {
		return nil, err
	}
	return billingJSON, nil
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

// mayReusePendingOrder answers whether this checkout can write into the customer's open order, and
// settles that order when the provider says it is finished.
//
// ── The rule, in one line ───────────────────────────────────────────────────────────────────────
//
// An order row may be recycled ONLY while its payment attempt is still LIVE. Settled, cancelled, or
// unknown — it is released, and this checkout starts a fresh order.
//
// ── Why recycling a settled order is a real defect and not an edge case ─────────────────────────
//
// `UpsertPendingOrder` reuses the customer's open order rather than making a second one, which keeps
// abandoned checkouts from piling up. The recycled row keeps its ID — and the idempotency key is
// derived from (order, amount, customer), so a second checkout for the SAME basket computes the FIRST
// attempt's key and the provider hands back that attempt's already-succeeded PaymentIntent. What the
// shopper sees is the payment screen flashing up and replacing itself with a receipt for the previous
// order. Seen in dev on 2026-08-25; the receipt page had guarded this since 019, but only for a shopper
// who actually reaches the receipt — not for one who closes the tab or whose webhook lags.
//
// ⚠ NO KEY DERIVED FROM CONTENT CAN FIX THIS, which is why the fix is here and not in the key. The
// failing case is buying the SAME basket twice: same order row, same amount, same customer. Nothing
// about the request differs, so nothing hashed from the request can differ either.
//
// ── Why a live attempt MUST still be reused ─────────────────────────────────────────────────────
//
// ⚠ Reusing a live attempt is a DOUBLE-CHARGE GUARD, not an optimisation. Two tabs on one checkout
// resolve to the same key and therefore the same PaymentIntent, so paying in both pays once. Rotating
// the key per request — the obvious "just make it unique" fix — would give those tabs two payable
// intents for one order and charge the shopper twice. That is why this asks about the ATTEMPT's state
// instead of simply making every attempt distinct.
//
// ── Why unknown means "do not reuse" ────────────────────────────────────────────────────────────
//
// ⚠ FAIL-SAFE, DELIBERATELY. If the provider cannot be reached, the two outcomes are not symmetric: an
// extra abandoned pending order is harmless and sweepable, while a wrongly-recycled one shows the wrong
// receipt or hands over a dead intent. A read failure against our OWN database is different — that is
// returned, because it means we cannot trust anything we are about to write.
func (s *Service) mayReusePendingOrder(ctx context.Context, customerID string) (bool, error) {
	orderID, intentID, found, err := s.store.PendingOrderIntent(ctx, customerID)
	if err != nil {
		return false, err
	}
	// No open order, or one that never got as far as an intent: nothing exists that could collide.
	if !found || orderID == "" || intentID == "" {
		return true, nil
	}

	pi, err := s.gateway.RetrievePaymentIntent(ctx, intentID)
	if err != nil {
		return false, nil
	}

	switch pi.Status {
	case IntentSucceeded:
		// Paid, and nothing told the database. Settle it here so it reaches order history and the shop
		// fan-out — a paid order stuck in `pending_payment` is wrong on its own terms, quite apart from
		// this bug. Idempotent; a webhook that arrives later changes nothing.
		if _, err := s.store.FinalizeSucceeded(ctx, orderID); err != nil {
			return false, err
		}
		return false, nil
	case IntentFailed, IntentCanceled:
		// ⚠ A cancelled intent can never be paid, so recycling this row would hand the shopper a dead
		// intent and a pay button that cannot work — a different bug with the same cause. Release it.
		if err := s.store.FinalizeFailed(ctx, orderID); err != nil {
			return false, err
		}
		return false, nil
	default:
		// Live (`requires_payment_method`, `requires_action`, `processing`). The shopper is still in the
		// middle of this attempt: same order, same key, same intent — which is exactly what the
		// double-charge guard above depends on.
		return true, nil
	}
}

// idempotencyKey is DETERMINISTIC over EVERY PARAMETER THE REQUEST CARRIES — the order, the amount and
// the provider customer. An unchanged retry returns the same intent; any change mints a new one (R5 #1).
//
// ⚠ THE CUSTOMER IS IN HERE BECAUSE LEAVING IT OUT BROKE CHECKOUT IN DEV. 051 added `Customer` to the
// intent parameters and left this key over (order, amount) alone. Every order created by the previous
// build had already burned its key on a request with NO customer — so the moment the new build replayed
// that same key WITH one, Stripe refused it outright:
//
//	Keys for idempotent requests can only be used with the same parameters they were first used with.
//
// That is a 400 from the provider, surfacing as a 500 on `POST /v1/checkout/intent`, and it is
// PERMANENT for the affected order: the key never changes, so the shopper can never pay for that
// basket again. It cannot be reproduced locally against a fresh Stripe account or a fresh order — it
// needs a key burned by the older parameter set, which is exactly what a deploy creates.
//
// The rule this encodes: an idempotency key must cover everything that determines the request. Adding
// a parameter without extending the key is a breaking change disguised as an additive one.
func idempotencyKey(orderID string, amountCents int64, providerCustomerID string) string {
	sum := sha256.Sum256(fmt.Appendf(nil, "pi:%s:%d:%s", orderID, amountCents, providerCustomerID))
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

// ── Delivery quote (047) ───────────────────────────────────────────────────────────────────────────

// DeliveryQuote is the shopper-facing preview of delivery for the cart to an address, shown before
// payment. ⚠ ShopRef is OPAQUE — never a shop id (FR-033). serviced=false ⇒ no packages, one reason.
type DeliveryQuote struct {
	Postcode     string
	Serviced     bool
	SameDayUntil *time.Time // latest still-makeable same-day cutoff, or nil
	Packages     []DeliveryQuotePackage
	ExpiresAt    time.Time
}

// DeliveryQuotePackage is one package's offered options (standard always; same-day when available).
type DeliveryQuotePackage struct {
	ShopRef string
	Options []DeliveryQuoteOption
}

// DeliveryQuoteOption is one offered method + its GST-inclusive fee.
type DeliveryQuoteOption struct {
	Method   string
	FeeCents int64
}

// QuoteForCheckout computes the delivery quote to display before payment (047 US1+US2): per package, the
// standard option and — where the fulfilling shop does same-day in the zone and it is before the cutoff —
// a same-day option, plus the latest same-day cutoff.
func (s *Service) QuoteForCheckout(ctx context.Context, customerID, addressID string, now time.Time) (DeliveryQuote, error) {
	if s.delivery == nil {
		return DeliveryQuote{Serviced: false}, nil
	}
	if _, err := uuid.Parse(addressID); err != nil {
		return DeliveryQuote{}, ErrAddressNotFound
	}
	addressJSON, found, err := s.store.AddressSnapshot(ctx, customerID, addressID)
	if err != nil {
		return DeliveryQuote{}, err
	}
	if !found {
		return DeliveryQuote{}, ErrAddressNotFound
	}
	postcode, ok := destinationPostcode(addressJSON)
	if !ok {
		return DeliveryQuote{}, ErrAddressNotFound
	}
	lines, err := s.store.CartLines(ctx, customerID)
	if err != nil {
		return DeliveryQuote{}, err
	}
	q, err := s.delivery.Quote(ctx, postcode, packagesFromLines(lines), now)
	if err != nil {
		return DeliveryQuote{}, err
	}
	if !q.Serviced {
		return DeliveryQuote{Postcode: postcode, Serviced: false}, nil
	}
	out := DeliveryQuote{
		Postcode: postcode, Serviced: true, SameDayUntil: q.SameDayUntil, ExpiresAt: now.Add(quoteValidity),
	}
	for i, p := range q.Packages {
		opts := make([]DeliveryQuoteOption, 0, len(p.Options))
		for _, o := range p.Options {
			opts = append(opts, DeliveryQuoteOption{Method: o.Method, FeeCents: o.FeeCents})
		}
		out.Packages = append(out.Packages, DeliveryQuotePackage{ShopRef: fmt.Sprintf("pkg-%d", i+1), Options: opts})
	}
	return out, nil
}

// preferredMethod normalises the shopper's order-level choice; anything other than same_day is standard.
func preferredMethod(m string) string {
	if m == delivery.MethodSameDay {
		return delivery.MethodSameDay
	}
	return delivery.MethodStandard
}

// resolveDelivery picks each package's captured method+fee from the quote by the shopper's preference,
// falling back to standard where the preferred method is not offered (FR-044/SC-011).
func resolveDelivery(q delivery.QuoteResult, preferred string) []PackageDelivery {
	out := make([]PackageDelivery, 0, len(q.Packages))
	for _, p := range q.Packages {
		method, fee := p.FeeFor(preferred)
		out = append(out, PackageDelivery{ShopID: p.ShopID, Method: method, FeeCents: fee})
	}
	return out
}

// destinationPostcode extracts and validates the 4-digit postcode from an address snapshot (the JSON
// AddressSnapshot builds carries "postalCode").
func destinationPostcode(addressJSON []byte) (string, bool) {
	var a struct {
		PostalCode string `json:"postalCode"`
	}
	if err := json.Unmarshal(addressJSON, &a); err != nil {
		return "", false
	}
	return delivery.NormalizePostcode(a.PostalCode)
}

// packagesFromLines groups cart lines into per-shop packages, summing each product's weight × quantity.
// Shop order is preserved (first appearance) so a quote is deterministic.
func packagesFromLines(lines []CheckoutLine) []delivery.PackageInput {
	grams := map[string]int{}
	order := make([]string, 0)
	for _, l := range lines {
		if _, seen := grams[l.ShopID]; !seen {
			order = append(order, l.ShopID)
		}
		grams[l.ShopID] += l.WeightGrams * l.Quantity
	}
	out := make([]delivery.PackageInput, 0, len(order))
	for _, shopID := range order {
		out = append(out, delivery.PackageInput{ShopID: shopID, Grams: grams[shopID]})
	}
	return out
}

// marshalCapturedQuote is the JSON stored in order.delivery_quote — the full options the shopper was
// shown, so intent honours the captured fees and never trusts a client-supplied one (047 FR-036).
// Server-side only (carries shop ids).
func marshalCapturedQuote(q delivery.QuoteResult) []byte {
	type opt struct {
		Method    string `json:"method"`
		FeeAmount string `json:"feeAmount"`
	}
	type pkg struct {
		ShopID  string `json:"shopId"`
		Options []opt  `json:"options"`
	}
	payload := struct {
		Serviced bool  `json:"serviced"`
		Packages []pkg `json:"packages"`
	}{Serviced: q.Serviced}
	for _, p := range q.Packages {
		row := pkg{ShopID: p.ShopID}
		for _, o := range p.Options {
			row.Options = append(row.Options, opt{Method: o.Method, FeeAmount: money.FormatCents(o.FeeCents)})
		}
		payload.Packages = append(payload.Packages, row)
	}
	b, _ := json.Marshal(payload)
	return b
}

// ── 051 payment methods ───────────────────────────────────────────────────────────────────────────

// KeptCard is one of the shopper's saved cards as a surface sees it.
//
// ⚠ Usable and UnusableReason are computed HERE, not by the client. The rules for what counts as
// unusable belong in one place; a client that decides for itself will disagree with the server the
// moment those rules change (FR-023).
type KeptCard struct {
	ID             string
	Brand          string
	Last4          string
	ExpMonth       int64
	ExpYear        int64
	IsDefault      bool
	Usable         bool
	UnusableReason string
}

// ListKeptCards returns the shopper's saved cards.
//
// ⚠ A shopper who has never paid has no provider record, and that is NOT an error: they simply have no
// cards, and the empty slice says so. A provider FAILURE, by contrast, propagates — "you have no cards"
// and "we could not ask" are different facts, and answering the second with the first is the FR-036
// failure mode (contract § 2).
func (s *Service) ListKeptCards(ctx context.Context, customerID string, now time.Time) ([]KeptCard, error) {
	providerCustomerID, _, _, err := s.store.PaymentProfile(ctx, customerID)
	if err != nil {
		return nil, err
	}
	if providerCustomerID == "" {
		return []KeptCard{}, nil
	}
	cards, err := s.gateway.ListSavedCards(ctx, providerCustomerID)
	if err != nil {
		return nil, err
	}
	out := make([]KeptCard, 0, len(cards))
	for _, c := range cards {
		k := KeptCard{
			ID: c.ID, Brand: c.Brand, Last4: c.Last4,
			ExpMonth: c.ExpMonth, ExpYear: c.ExpYear, IsDefault: c.IsDefault,
			Usable: true,
		}
		if cardExpired(c.ExpMonth, c.ExpYear, now) {
			k.Usable = false
			k.UnusableReason = "This card has expired."
		}
		out = append(out, k)
	}
	return out, nil
}

// cardExpired reports whether a card is past its expiry.
//
// ⚠ A card is valid through the LAST DAY of its expiry month, not up to the first — treating the 1st as
// expired would refuse a perfectly good card for up to 30 days. Compared in the shopper's own month
// rather than by day-of-month arithmetic, which is what makes it correct in every timezone the
// comparison could be made in.
func cardExpired(expMonth, expYear int64, now time.Time) bool {
	y := int64(now.Year())
	m := int64(now.Month())
	if expYear < y {
		return true
	}
	if expYear > y {
		return false
	}
	return expMonth < m
}

// RemoveKeptCard detaches a saved card.
//
// ⚠ OWNERSHIP IS VERIFIED HERE, and it must be. The id arrives from the client, so detaching what it
// names without checking whose it is would be a cross-customer write — one shopper able to remove
// another's card by guessing an id (FR-026). The check is a membership test against the shopper's own
// list, which is the only source that can answer it.
func (s *Service) RemoveKeptCard(ctx context.Context, customerID, paymentMethodID string) error {
	providerCustomerID, _, _, err := s.store.PaymentProfile(ctx, customerID)
	if err != nil {
		return err
	}
	if providerCustomerID == "" {
		return ErrPaymentMethodNotFound
	}
	cards, err := s.gateway.ListSavedCards(ctx, providerCustomerID)
	if err != nil {
		return err
	}
	for _, c := range cards {
		if c.ID == paymentMethodID {
			return s.gateway.DetachPaymentMethod(ctx, paymentMethodID)
		}
	}
	// ⚠ Not found and not-yours are answered IDENTICALLY on purpose. Distinguishing them would make this
	// route an oracle for whether a payment-method id exists on the platform.
	return ErrPaymentMethodNotFound
}
