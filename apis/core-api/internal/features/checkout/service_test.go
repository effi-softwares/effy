package checkout

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
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

	amounts     OrderAmounts
	billingJSON []byte
	billingSet  bool
	payment     int64
	upsertErr   error
}

func newFakeStore() *fakeStore {
	return &fakeStore{address: map[string][]byte{
		addrID:    []byte(`{"line1":"1 Test St"}`),
		otherAddr: []byte(`{"line1":"9 Other Rd"}`),
	}}
}

func (f *fakeStore) CartLines(context.Context, string) ([]CheckoutLine, error) { return f.lines, nil }

func (f *fakeStore) AddressSnapshot(_ context.Context, _, addressID string) ([]byte, bool, error) {
	j, ok := f.address[addressID]
	return j, ok, nil
}

func (f *fakeStore) UpsertPendingOrder(_ context.Context, _ string, a OrderAmounts, _ []byte, _ []CheckoutLine) (string, string, error) {
	if f.upsertErr != nil {
		return "", "", f.upsertErr
	}
	f.amounts = a
	return "order-1", "EFY-TEST01", nil
}

func (f *fakeStore) SetOrderBilling(_ context.Context, _ string, billingJSON []byte) error {
	f.billingSet, f.billingJSON = true, billingJSON
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
func (f *fakeStore) OrderIntentForCustomer(context.Context, string, string) (string, bool, error) {
	return "pi_1", true, nil
}
func (f *fakeStore) FinalizeSucceeded(context.Context, string) (bool, error) { return true, nil }
func (f *fakeStore) FinalizeFailed(context.Context, string) error            { return nil }

type fakeGateway struct{ amount int64 }

func (g *fakeGateway) CreatePaymentIntent(_ context.Context, in CreateIntentInput) (PaymentIntent, error) {
	g.amount = in.AmountMinor
	return PaymentIntent{ID: "pi_1", ClientSecret: "cs_1", Status: "requires_payment_method"}, nil
}

func (g *fakeGateway) RetrievePaymentIntent(_ context.Context, id string) (PaymentIntent, error) {
	return PaymentIntent{ID: id, Status: "succeeded"}, nil
}

func (g *fakeGateway) ConstructWebhookEvent([]byte, string) (WebhookEvent, error) {
	return WebhookEvent{}, nil
}

type fakePolicy struct{ minimum int64 }

func (p fakePolicy) Policy(context.Context) (cartpolicy.Policy, error) {
	return cartpolicy.Policy{MinimumSubtotalCents: p.minimum}, nil
}

type fakePromos struct{ discount int64 }

func (p fakePromos) DiscountForCustomer(context.Context, string, int64, time.Time) (int64, string, string, error) {
	return p.discount, "promo-1", "SAVE", nil
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
