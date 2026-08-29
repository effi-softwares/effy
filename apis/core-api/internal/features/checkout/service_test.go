package checkout

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// ── Checkout service tests ─────────────────────────────────────────────────────────────────────
//
// ⚠ THIS SUITE SHRANK BY DESIGN. It used to be dominated by delivery quoting — per-package options,
// captured-quote windows, selection validation, exclusion sets, serviceability. Delivery zones,
// quotes and fees were WITHDRAWN from the platform, so those tests were not "fixed": the behaviour
// they described no longer exists.
//
// What remains is what checkout still decides — the amount, the minimum-order gate, the billing
// snapshot — and the rule that outlives all of it: the server computes every figure it charges and
// never takes one from the client.

type fakeStore struct {
	lines   []CheckoutLine
	address map[string][]byte

	// 052 — what the receipt would show, and a way to make saving it fail.
	savedMethod          *PaymentMethodSummary
	savePaymentMethodErr error

	amounts     OrderAmounts
	billingJSON []byte
	billingSet  bool
	payment     int64
	upsertErr   error

	captureCalled bool
	capturedPkgs  []PackageDelivery
	capturedQuote []byte

	// 051 — the provider reference and the platform's own contact fields.
	providerCustomerID string
	email              string
	name               string
	// providerWrites counts SetProviderCustomerID calls, which is how a test proves the reference is
	// written once and not on every retry.
	providerWrites int

	// 051 T087 — the confirm fallback now carries every redirect return (Klarna, Zip, Afterpay, 3DS),
	// so its idempotency deserves a test rather than an assumption.
	finalizeSucceeded int
	stockShortfall    bool
	alreadyFinalized  bool

	// The customer's lingering pending order, if any — what `mayReusePendingOrder` reads.
	pendingOrderID  string
	pendingIntentID string
	// Whether the service allowed the open order to be recycled.
	reuseAsked bool
	// finalizeFailed counts the release of an order whose intent can never be paid.
	finalizeFailed int
	pendingReadErr error
	orderIntent    string
	orderNotFound  bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{email: "shopper@example.com", name: "Test Shopper", address: map[string][]byte{
		addrID:    []byte(`{"line1":"1 Test St","postalCode":"3121"}`),
		otherAddr: []byte(`{"line1":"9 Other Rd","postalCode":"3550"}`),
	}}
}

func (f *fakeStore) CartLines(context.Context, string) ([]CheckoutLine, error) { return f.lines, nil }

func (f *fakeStore) PaymentProfile(context.Context, string) (string, string, string, error) {
	return f.providerCustomerID, f.email, f.name, nil
}

func (f *fakeStore) SetProviderCustomerID(_ context.Context, _, providerCustomerID string) error {
	f.providerWrites++
	// Mirrors the real store's `WHERE stripe_customer_id IS NULL`: first write wins.
	if f.providerCustomerID == "" {
		f.providerCustomerID = providerCustomerID
	}
	return nil
}

func (f *fakeStore) AddressSnapshot(_ context.Context, _, addressID string) ([]byte, bool, error) {
	j, ok := f.address[addressID]
	return j, ok, nil
}

func (f *fakeStore) UpsertPendingOrder(_ context.Context, _ string, a OrderAmounts, _ []byte, _ []CheckoutLine, reusePending bool) (string, string, error) {
	if f.upsertErr != nil {
		return "", "", f.upsertErr
	}
	f.amounts = a
	// What the service DECIDED — the whole point of the parameter, and the only thing a test can assert
	// about it from here.
	f.reuseAsked = reusePending
	return "order-1", "EFY-TEST01", nil
}

func (f *fakeStore) SetOrderBilling(_ context.Context, _ string, billingJSON []byte) error {
	f.billingSet, f.billingJSON = true, billingJSON
	return nil
}

func (f *fakeStore) CaptureDelivery(_ context.Context, _ string, quoteJSON []byte, _ time.Time, pkgs []PackageDelivery) error {
	f.captureCalled = true
	f.capturedQuote = quoteJSON
	f.capturedPkgs = pkgs
	return nil
}

func (f *fakeStore) UpsertPayment(_ context.Context, _, _ string, cents int64, _ string) error {
	f.payment = cents
	return nil
}

func (f *fakeStore) FindOrderByIntent(context.Context, string) (string, bool, error) {
	return "order-1", true, nil
}
func (f *fakeStore) MarkEventSeen(context.Context, string, string) (bool, error) { return true, nil }
func (f *fakeStore) PendingOrderIntent(context.Context, string) (string, string, bool, error) {
	if f.pendingReadErr != nil {
		return "", "", false, f.pendingReadErr
	}
	if f.pendingOrderID == "" || f.pendingIntentID == "" {
		return f.pendingOrderID, "", false, nil
	}
	return f.pendingOrderID, f.pendingIntentID, true, nil
}

func (f *fakeStore) OrderIntentForCustomer(context.Context, string, string) (string, bool, error) {
	if f.orderNotFound {
		return "", false, nil
	}
	return "pi_1", true, nil
}

// 051 T087: count the paid transitions. `applied` mirrors the real store, where the transition runs
// only for an order still in pending_payment — so a repeat confirm reports false, not a second apply.
func (f *fakeStore) FinalizeSucceeded(context.Context, string) (FinalizeOutcome, error) {
	f.finalizeSucceeded++
	applied := !f.alreadyFinalized
	f.alreadyFinalized = true
	// 054: `stockShortfall` lets a test drive the oversell metric without a database.
	return FinalizeOutcome{Applied: applied, StockShortfall: f.stockShortfall}, nil
}
func (f *fakeStore) FinalizeFailed(context.Context, string) error {
	f.finalizeFailed++
	return nil
}

// 052 — records what the receipt would show, and whether saving it was even attempted.
func (f *fakeStore) SavePaymentMethod(_ context.Context, _ string, m PaymentMethodSummary) error {
	f.savedMethod = &m
	if f.savePaymentMethodErr != nil {
		return f.savePaymentMethodErr
	}
	return nil
}

type fakeGateway struct {
	amount int64

	// 052 — the payment summary the provider reports, how many times it was asked, and a way to make
	// the provider unreachable.
	describe      PaymentMethodSummary
	describeCalls int
	describeErr   error

	// 051 — what the fake was asked to do, so a test can assert the SHAPE of the calls and not just
	// their result. `customerCreates` is what proves EnsureCustomer is idempotent.
	customerCreates int
	sessions        int
	detached        []string
	cards           []SavedCard
	// listErr forces the provider-unreachable path, which must never look like an empty list.
	listErr error
	// What the intent was actually built with — the only way to assert the provider customer is attached.
	intentCustomer string
	// What the provider reports as usable for this intent (051 US4).
	availableMethods []string
	// What RetrievePaymentIntent reports, and whether it can be reached at all. Empty status keeps the
	// long-standing default ("succeeded"), which the confirm-fallback tests depend on.
	retrieveStatus IntentStatus
	retrieveErr    error
}

func (g *fakeGateway) CreatePaymentIntent(_ context.Context, in CreateIntentInput) (PaymentIntent, error) {
	g.amount = in.AmountMinor
	g.intentCustomer = in.CustomerID
	return PaymentIntent{
		ID: "pi_1", ClientSecret: "cs_1", Status: "requires_payment_method",
		AvailableMethods: g.availableMethods,
	}, nil
}

func (g *fakeGateway) RetrievePaymentIntent(_ context.Context, id string) (PaymentIntent, error) {
	if g.retrieveErr != nil {
		return PaymentIntent{}, g.retrieveErr
	}
	status := g.retrieveStatus
	if status == "" {
		status = IntentSucceeded
	}
	return PaymentIntent{ID: id, Status: status}, nil
}

func (g *fakeGateway) ConstructWebhookEvent([]byte, string) (WebhookEvent, error) {
	return WebhookEvent{}, nil
}

// 052 — the receipt's payment summary. `describeErr` simulates the provider being unreachable.
func (g *fakeGateway) DescribePaymentMethod(context.Context, string) (PaymentMethodSummary, error) {
	g.describeCalls++
	if g.describeErr != nil {
		return PaymentMethodSummary{}, g.describeErr
	}
	return g.describe, nil
}

// ── 051 ───────────────────────────────────────────────────────────────────────────────────────────

func (g *fakeGateway) EnsureCustomer(_ context.Context, in EnsureCustomerInput) (string, error) {
	if in.Existing != "" {
		return in.Existing, nil
	}
	g.customerCreates++
	return "cus_fake", nil
}

func (g *fakeGateway) CreateCustomerSession(context.Context, string) (CustomerSession, error) {
	g.sessions++
	return CustomerSession{ClientSecret: "cuss_fake"}, nil
}

func (g *fakeGateway) ListSavedCards(context.Context, string) ([]SavedCard, error) {
	if g.listErr != nil {
		return nil, g.listErr
	}
	return g.cards, nil
}

func (g *fakeGateway) DetachPaymentMethod(_ context.Context, id string) error {
	g.detached = append(g.detached, id)
	return nil
}

type fakePolicy struct{ minimum int64 }

func (p fakePolicy) Policy(context.Context) (cartpolicy.Policy, error) {
	return cartpolicy.Policy{MinimumSubtotalCents: p.minimum}, nil
}

type fakePromos struct{ discount int64 }

func (p fakePromos) DiscountForCustomer(context.Context, string, int64, time.Time) (int64, string, string, error) {
	return p.discount, "promo-1", "SAVE", nil
}

// fakeQuoter is a stand-in delivery engine (047): it returns a fixed quote so the checkout wiring can be
// tested without a database.
type fakeQuoter struct {
	res delivery.QuoteResult
	err error
}

func (q fakeQuoter) Quote(context.Context, string, []delivery.PackageInput, time.Time) (delivery.QuoteResult, error) {
	return q.res, q.err
}

// stdOnly builds a serviced quote with one standard-only package at the given fee.
func stdOnly(shopID string, feeCents int64) delivery.QuoteResult {
	return delivery.QuoteResult{
		Serviced: true,
		Packages: []delivery.PackageQuote{{ShopID: shopID, Options: []delivery.Option{{Method: "standard", FeeCents: feeCents}}}},
	}
}

const (
	custID    = "11111111-1111-1111-1111-111111111111"
	addrID    = "22222222-2222-2222-2222-222222222222"
	otherAddr = "55555555-5555-5555-5555-555555555555"
)

func storeWithMilk() *fakeStore {
	s := newFakeStore()
	s.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2}}
	return s
}

func svcWith(store *fakeStore, gw *fakeGateway) *Service {
	return NewService(store, gw, "pk_test")
}

func intent(s *Service, in IntentInput) (IntentResult, error) {
	return s.CreateCheckoutIntent(context.Background(), custID, in, time.Now())
}

// ── The amount ─────────────────────────────────────────────────────────────────────────────────

// ⚠ THE CENTRAL ARITHMETIC, and it is now one line: items minus discount. There is no delivery fee on
// this platform, so a grand total that exceeds the item subtotal would be money nobody can explain.
func TestIntent_ChargesItemsMinusDiscount(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}

	res, err := intent(svcWith(store, gw).WithPromotions(fakePromos{discount: 200}), IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.EqualValues(t, 1000, store.amounts.ItemSubtotalCents)
	require.EqualValues(t, 200, store.amounts.DiscountCents)
	require.EqualValues(t, 800, store.amounts.GrandTotalCents)
	require.Equal(t, "8.00", res.GrandTotal)

	// ⚠ The gateway is charged the platform's own figure, never anything the client sent.
	require.EqualValues(t, 800, gw.amount)
	require.EqualValues(t, 800, store.payment)
}

func TestIntent_NeverChargesADeliveryFee(t *testing.T) {
	store := storeWithMilk()

	_, err := intent(svcWith(store, &fakeGateway{}), IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.Zero(t, store.amounts.DeliveryFeeCents)
	require.Equal(t, store.amounts.ItemSubtotalCents, store.amounts.GrandTotalCents,
		"with no discount the total IS the item subtotal")
}

func TestIntent_ADiscountCannotDriveTheTotalBelowZero(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}

	_, err := intent(svcWith(store, gw).WithPromotions(fakePromos{discount: 99_999}), IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.Zero(t, store.amounts.GrandTotalCents)
	require.Zero(t, gw.amount)
}

// ── The minimum-order gate ─────────────────────────────────────────────────────────────────────

// ⚠ FR-056: re-decided HERE, not trusted from the cart's own gate. A client that ignores its gate —
// an outdated build, a hand-rolled request — must still be refused.
func TestIntent_RefusesBelowTheMinimum(t *testing.T) {
	store := storeWithMilk()

	_, err := intent(svcWith(store, &fakeGateway{}).WithOrderPolicy(fakePolicy{minimum: 5000}),
		IntentInput{AddressID: addrID})

	var below *BelowMinimumError
	require.ErrorAs(t, err, &below)
	require.EqualValues(t, 5000, below.MinimumCents)
	require.EqualValues(t, 4000, below.RemainingCents, "how much more is needed — never a shop")
}

// ── The address ────────────────────────────────────────────────────────────────────────────────

func TestIntent_RefusesAnUnknownAddress(t *testing.T) {
	_, err := intent(svcWith(storeWithMilk(), &fakeGateway{}),
		IntentInput{AddressID: "99999999-9999-9999-9999-999999999999"})
	require.ErrorIs(t, err, ErrAddressNotFound)
}

func TestIntent_RefusesAMalformedAddressID(t *testing.T) {
	_, err := intent(svcWith(storeWithMilk(), &fakeGateway{}), IntentInput{AddressID: "not-a-uuid"})
	require.ErrorIs(t, err, ErrAddressNotFound)
}

// ── Billing (023) ──────────────────────────────────────────────────────────────────────────────

// FR-009: no billing id → billing recorded as NULL ("same as shipping").
func TestIntent_SameAsShippingWritesNullBilling(t *testing.T) {
	store := storeWithMilk()

	_, err := intent(svcWith(store, &fakeGateway{}), IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.True(t, store.billingSet, "called on every intent, so toggling back ON clears a prior value")
	require.Nil(t, store.billingJSON)
}

func TestIntent_DivergentBillingIsSnapshotted(t *testing.T) {
	store := storeWithMilk()

	_, err := intent(svcWith(store, &fakeGateway{}), IntentInput{AddressID: addrID, BillingAddressID: otherAddr})
	require.NoError(t, err)

	require.NotNil(t, store.billingJSON)
	require.Contains(t, string(store.billingJSON), "Other Rd")
}

// ── Store failure ──────────────────────────────────────────────────────────────────────────────

func TestIntent_PropagatesAStoreFailureRatherThanCharging(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.upsertErr = errors.New("boom")

	_, err := intent(svcWith(store, gw), IntentInput{AddressID: addrID})

	require.Error(t, err)
	require.Zero(t, gw.amount, "no PaymentIntent may be created when the order could not be written")
}

// ── Delivery (047) ─────────────────────────────────────────────────────────────────────────────

func svcWithDelivery(store *fakeStore, gw *fakeGateway, q delivery.QuoteResult) *Service {
	return svcWith(store, gw).WithDelivery(fakeQuoter{res: q})
}

func TestIntent_ChargesAndCapturesDeliveryWhenWired(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{} // items: 2 × $5.00 = $10.00
	store.lines[0].WeightGrams = 800
	svc := svcWithDelivery(store, gw, stdOnly("s1", 600)) // $6.00 delivery

	res, err := intent(svc, IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.Equal(t, int64(600), store.amounts.DeliveryFeeCents)
	require.Equal(t, int64(1600), store.amounts.GrandTotalCents, "items 1000 + delivery 600")
	require.Equal(t, int64(1600), gw.amount, "the shopper is charged the total incl. delivery")
	require.Equal(t, "16.00", res.GrandTotal)
	require.True(t, store.captureCalled, "the quote must be captured")
	require.Len(t, store.capturedPkgs, 1)
	require.Equal(t, "standard", store.capturedPkgs[0].Method)
	require.Equal(t, int64(600), store.capturedPkgs[0].FeeCents)
}

func TestIntent_RefusesAnUnserviceableAddress(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, delivery.QuoteResult{Serviced: false})

	_, err := intent(svc, IntentInput{AddressID: addrID})

	require.ErrorIs(t, err, ErrNotServiceable)
	require.Zero(t, gw.amount, "no charge for an address we cannot deliver to")
	require.False(t, store.captureCalled)
}

func TestIntent_NoQuoterMeansNoDeliveryFee(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	_, err := intent(svcWith(store, gw), IntentInput{AddressID: addrID}) // no WithDelivery
	require.NoError(t, err)
	require.Zero(t, store.amounts.DeliveryFeeCents)
	require.False(t, store.captureCalled, "nothing captured when delivery is not configured")
}

func TestQuoteForCheckout_ReturnsOpaqueStandardOption(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, stdOnly("s1", 600))

	q, err := svc.QuoteForCheckout(context.Background(), custID, addrID, time.Now())
	require.NoError(t, err)
	require.True(t, q.Serviced)
	require.Len(t, q.Packages, 1)
	require.Equal(t, "pkg-1", q.Packages[0].ShopRef, "shopRef is opaque — never a shop id (FR-033)")
	require.Len(t, q.Packages[0].Options, 1)
	require.Equal(t, "standard", q.Packages[0].Options[0].Method)
	require.Equal(t, int64(600), q.Packages[0].Options[0].FeeCents)
}

// US4/FR-036: the captured quote is what a later charge is built from. The fee is captured at intent
// (order.delivery_quote + order_package_delivery); a plan change afterwards cannot re-price a captured
// order because finalize reads the captured rows, never the live plan. This proves the capture happens
// with the fee that was quoted — the mechanism SC-013 rests on.
func TestIntent_CapturesTheQuotedFee(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, stdOnly("s1", 850)) // quoted $8.50

	_, err := intent(svc, IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.True(t, store.captureCalled)
	require.Len(t, store.capturedPkgs, 1)
	require.Equal(t, int64(850), store.capturedPkgs[0].FeeCents, "the captured fee is exactly what was quoted")
	require.Equal(t, int64(850), store.amounts.DeliveryFeeCents)
	// The captured quote JSON is persisted (order.delivery_quote) so intent honours it, not the live plan.
	require.NotEmpty(t, store.capturedQuote)
	require.Contains(t, string(store.capturedQuote), "8.50")
}

// US2/US3: an order-level same-day preference is applied per package where offered, standard elsewhere.
func TestIntent_SameDayPreferenceAppliedPerPackage(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{} // items 2 × $5.00 = $10.00
	svc := svcWithDelivery(store, gw, delivery.QuoteResult{
		Serviced: true,
		Packages: []delivery.PackageQuote{
			// shop s1 offers same-day (1100) + standard (600); s2 offers standard only (700).
			{ShopID: "s1", Options: []delivery.Option{{Method: "standard", FeeCents: 600}, {Method: "same_day", FeeCents: 1100}}},
			{ShopID: "s2", Options: []delivery.Option{{Method: "standard", FeeCents: 700}}},
		},
	})

	_, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day"})
	require.NoError(t, err)

	// s1 → same-day 1100; s2 → standard 700 (no same-day offered). Fee = 1800.
	require.Len(t, store.capturedPkgs, 2)
	require.Equal(t, "same_day", store.capturedPkgs[0].Method)
	require.Equal(t, int64(1100), store.capturedPkgs[0].FeeCents)
	require.Equal(t, "standard", store.capturedPkgs[1].Method)
	require.Equal(t, int64(1800), store.amounts.DeliveryFeeCents)
	require.Equal(t, int64(2800), store.amounts.GrandTotalCents, "items 1000 + delivery 1800")
}

// The idempotency key must cover EVERY parameter the intent request carries (051).
//
// ⚠ THE DEFECT THIS PINS DOWN. 051 added `Customer` to the PaymentIntent parameters and left the key
// derived from (order, amount). Orders created by the previous build had already burned that key on a
// request with no customer, so replaying it with one made Stripe refuse:
//
//	Keys for idempotent requests can only be used with the same parameters they were first used with.
//
// It 500'd every checkout intent for those orders, permanently, and no local test could have seen it —
// a fresh Stripe account has no burned keys. The invariant is cheap to state and is stated here.
func TestIdempotencyKey_CoversEveryRequestParameter(t *testing.T) {
	const (
		order    = "11111111-1111-1111-1111-111111111111"
		otherOrd = "22222222-2222-2222-2222-222222222222"
		cents    = int64(2770)
		customer = "cus_A"
	)
	base := idempotencyKey(order, cents, customer)

	// Same request ⇒ same key. This is what makes a retry a retry rather than a second charge.
	if got := idempotencyKey(order, cents, customer); got != base {
		t.Fatalf("an unchanged retry produced a different key: %s != %s", got, base)
	}

	for name, got := range map[string]string{
		"a different customer": idempotencyKey(order, cents, "cus_B"),
		"no customer at all":   idempotencyKey(order, cents, ""),
		"a different amount":   idempotencyKey(order, 2771, customer),
		"a different order":    idempotencyKey(otherOrd, cents, customer),
	} {
		if got == base {
			t.Errorf("%s reused the key — the provider refuses a key replayed with changed parameters", name)
		}
	}
}

// Whether a checkout may recycle the customer's open order, across every state that order can be in.
//
// ⚠ THE SYMPTOM THIS TABLE EXISTS FOR, seen in dev on 2026-08-25: the shopper places an order, starts a
// second one, and the payment screen flashes up and replaces itself with a RECEIPT FOR THE PREVIOUS
// ORDER. Three individually-correct steps produce it:
//
//  1. `UpsertPendingOrder` RECYCLES the customer's open order instead of making a second.
//  2. A missed or lagging webhook, plus a shopper who never lands on the receipt, leaves an order
//     `pending_payment` after it has actually been paid.
//  3. The recycled row keeps its id, so the deterministic key over (order, amount, customer) resolves
//     to that order's ALREADY-SUCCEEDED PaymentIntent — and the client's "is this already paid?" check
//     then answers yes, truthfully, about the wrong order.
//
// ⚠ THE `live` ROW IS THE ONE THAT CONSTRAINS THE FIX. Reusing a live attempt is a DOUBLE-CHARGE GUARD:
// two tabs on one checkout resolve to the same intent, so paying in both pays once. The obvious fix —
// rotate the key every request — would give those tabs two payable intents for one order. Any change
// here that makes this row expect `false` has reintroduced that.
func TestCreateIntent_ReusesTheOpenOrderOnlyWhileItsPaymentIsLive(t *testing.T) {
	cases := []struct {
		name string
		// The lingering order's intent, as the provider reports it.
		status      IntentStatus
		providerErr error
		// Nothing lingering at all.
		noPendingOrder bool
		// A lingering order that never got as far as an intent.
		noIntent bool

		wantReuse    bool
		wantSettled  int
		wantReleased int
	}{
		{
			name:        "paid but still pending — settle it and start a fresh order",
			status:      IntentSucceeded,
			wantReuse:   false,
			wantSettled: 1,
		},
		{
			name:      "live attempt — reuse, or two tabs become two charges",
			status:    IntentRequiresPaymentMethod,
			wantReuse: true,
		},
		{
			name:      "awaiting the shopper's bank — still live, still one attempt",
			status:    IntentRequiresAction,
			wantReuse: true,
		},
		{
			name:         "cancelled — reusing it would hand over an intent that can never be paid",
			status:       IntentCanceled,
			wantReuse:    false,
			wantReleased: 1,
		},
		{
			name:         "failed — same: released rather than recycled",
			status:       IntentFailed,
			wantReuse:    false,
			wantReleased: 1,
		},
		{
			name:        "provider unreachable — fail safe, an extra abandoned order beats a wrong receipt",
			providerErr: errors.New("stripe unreachable"),
			wantReuse:   false,
		},
		{
			name:           "nothing open — nothing that could collide",
			noPendingOrder: true,
			wantReuse:      true,
		},
		{
			name:      "open but never reached an intent — nothing that could collide",
			noIntent:  true,
			wantReuse: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := storeWithMilk()
			switch {
			case tc.noPendingOrder:
			case tc.noIntent:
				store.pendingOrderID = "11111111-1111-1111-1111-111111111111"
			default:
				store.pendingOrderID = "11111111-1111-1111-1111-111111111111"
				store.pendingIntentID = "pi_from_a_previous_attempt"
			}

			svc := svcWith(store, &fakeGateway{retrieveStatus: tc.status, retrieveErr: tc.providerErr})
			if _, err := svc.CreateCheckoutIntent(context.Background(), custID, IntentInput{AddressID: addrID}, time.Now()); err != nil {
				t.Fatalf("create intent: %v", err)
			}

			if store.reuseAsked != tc.wantReuse {
				t.Errorf("reuse = %v, want %v", store.reuseAsked, tc.wantReuse)
			}
			if store.finalizeSucceeded != tc.wantSettled {
				t.Errorf("settled %d orders, want %d", store.finalizeSucceeded, tc.wantSettled)
			}
			if store.finalizeFailed != tc.wantReleased {
				t.Errorf("released %d orders, want %d", store.finalizeFailed, tc.wantReleased)
			}
		})
	}
}

// ⚠ A DATABASE read failure is NOT the provider being unreachable, and must not be swallowed with it.
// Not knowing what the provider thinks is survivable — we fail safe and open a new order. Not being
// able to read our own order table means we cannot trust anything we are about to write to it.
func TestCreateIntent_PropagatesAFailureToReadTheOpenOrder(t *testing.T) {
	store := storeWithMilk()
	store.pendingReadErr = errors.New("connection refused")

	svc := svcWith(store, &fakeGateway{})
	if _, err := svc.CreateCheckoutIntent(context.Background(), custID, IntentInput{AddressID: addrID}, time.Now()); err == nil {
		t.Fatal("a failed read of the customer's open order was swallowed — checkout continued on an unknown order state")
	}
}

// ── 052 — the payment-method capture (FR-006, research R3) ──────────────────────────────────────

// ⚠ THE POINT OF THIS TEST IS THE ORDER'S SAFETY, NOT THE CAPTURE'S SUCCESS.
//
// The capture costs a Stripe round trip and therefore sits OUTSIDE the finalize transaction. This
// pins the consequence: when the provider is unreachable, the paid transition has still happened
// exactly once and the caller is told the order is paid. A receipt without a payment line is a
// supported state; a paid order stranded because a photograph of a card could not be fetched is not.
func TestConfirm_AFailingMethodCaptureStillLeavesTheOrderPaid(t *testing.T) {
	store := storeWithMilk()
	gw := &fakeGateway{retrieveStatus: IntentSucceeded, describeErr: errors.New("stripe unreachable")}

	got, err := svcWith(store, gw).Confirm(context.Background(), "cust-1", "11111111-1111-4111-8111-111111111111")
	if err != nil {
		t.Fatalf("Confirm returned an error when only the METHOD capture failed: %v", err)
	}
	if !got.Paid {
		t.Fatal("Paid = false — a provider hiccup on a cosmetic read must not unmake a payment")
	}
	if store.finalizeSucceeded != 1 {
		t.Fatalf("finalizeSucceeded = %d, want exactly 1", store.finalizeSucceeded)
	}
	if store.savedMethod != nil {
		t.Fatalf("savedMethod = %+v, want nothing written when the provider could not be read", store.savedMethod)
	}
}

// A SAVE failure is equally harmless — the columns are nullable precisely so this can fail.
func TestConfirm_AFailingMethodSaveStillLeavesTheOrderPaid(t *testing.T) {
	store := storeWithMilk()
	store.savePaymentMethodErr = errors.New("db busy")
	gw := &fakeGateway{
		retrieveStatus: IntentSucceeded,
		describe:       PaymentMethodSummary{Type: "card", Brand: "visa", Last4: "4242"},
	}

	got, err := svcWith(store, gw).Confirm(context.Background(), "cust-1", "11111111-1111-4111-8111-111111111111")
	if err != nil {
		t.Fatalf("Confirm returned an error when only the METHOD save failed: %v", err)
	}
	if !got.Paid || store.finalizeSucceeded != 1 {
		t.Fatalf("Paid=%v finalizeSucceeded=%d — the paid transition must be untouched", got.Paid, store.finalizeSucceeded)
	}
}

// The happy path: what the provider reports is what the receipt will show.
func TestConfirm_CapturesTheMethodAfterTheOrderIsPaid(t *testing.T) {
	store := storeWithMilk()
	gw := &fakeGateway{
		retrieveStatus: IntentSucceeded,
		describe:       PaymentMethodSummary{Type: "card", Brand: "visa", Last4: "4242"},
	}

	if _, err := svcWith(store, gw).Confirm(context.Background(), "cust-1", "11111111-1111-4111-8111-111111111111"); err != nil {
		t.Fatalf("Confirm: %v", err)
	}
	if store.savedMethod == nil {
		t.Fatal("no method saved")
	}
	if store.savedMethod.Type != "card" || store.savedMethod.Brand != "visa" || store.savedMethod.Last4 != "4242" {
		t.Fatalf("savedMethod = %+v", *store.savedMethod)
	}
}

// ⚠ An UNPAID intent must not trigger the capture at all. Beyond being wasted work, a method summary
// on an unpaid order is a fact about a payment that did not happen.
func TestConfirm_DoesNotCaptureAMethodForAnUnpaidIntent(t *testing.T) {
	store := storeWithMilk()
	gw := &fakeGateway{retrieveStatus: IntentRequiresAction}

	if _, err := svcWith(store, gw).Confirm(context.Background(), "cust-1", "11111111-1111-4111-8111-111111111111"); err != nil {
		t.Fatalf("Confirm: %v", err)
	}
	if gw.describeCalls != 0 {
		t.Fatalf("describeCalls = %d, want 0 for an unpaid intent", gw.describeCalls)
	}
	if store.savedMethod != nil {
		t.Fatalf("savedMethod = %+v, want nothing for an unpaid intent", store.savedMethod)
	}
}
