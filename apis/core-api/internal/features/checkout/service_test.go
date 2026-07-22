package checkout

import (
	"context"
	"testing"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// fakeGateway records what the service asks of the payment provider.
type fakeGateway struct {
	createCalls  []CreateIntentInput
	webhookEvent WebhookEvent
	webhookErr   error
	retrieve     PaymentIntent
}

func (f *fakeGateway) CreatePaymentIntent(_ context.Context, in CreateIntentInput) (PaymentIntent, error) {
	f.createCalls = append(f.createCalls, in)
	return PaymentIntent{ID: "pi_1", ClientSecret: "cs_1", Status: IntentRequiresPaymentMethod}, nil
}
func (f *fakeGateway) RetrievePaymentIntent(_ context.Context, _ string) (PaymentIntent, error) {
	return f.retrieve, nil
}
func (f *fakeGateway) ConstructWebhookEvent(_ []byte, _ string) (WebhookEvent, error) {
	return f.webhookEvent, f.webhookErr
}

// fakeStore is an in-memory checkout store recording orchestration effects.
type fakeStore struct {
	lines        []CheckoutLine
	addressFound bool
	orderID      string
	orderNumber  string
	payments     []struct {
		orderID, intentID string
		amount            int64
		status            string
	}
	seen            map[string]bool
	intentToOrder   map[string]string
	orderIntent     map[string]string
	succeeded       []string
	failed          []string
	finalizeApplied bool

	// 021 QuoteStore state
	destOK           bool
	captured         CapturedQuote
	haveCaptured     bool
	legs             map[string]Leg
	wroteDeliveries  []PackageDelivery
	wroteItemSub     int64
	wroteDeliveryFee int64

	// 023 billing
	billingSet     bool   // SetOrderBilling was called
	billingJSON    []byte // the snapshot written (nil = NULL, "same as shipping")
	missingAddress string // an address id AddressSnapshot reports as not-found (a foreign billing id)
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		orderID: "order-1", orderNumber: "EFY-TEST", addressFound: true, finalizeApplied: true,
		seen: map[string]bool{}, intentToOrder: map[string]string{}, orderIntent: map[string]string{},
	}
}

func (f *fakeStore) CartLines(_ context.Context, _ string) ([]CheckoutLine, error) {
	return f.lines, nil
}
func (f *fakeStore) AddressSnapshot(_ context.Context, _, addressID string) ([]byte, bool, error) {
	if !f.addressFound || (f.missingAddress != "" && addressID == f.missingAddress) {
		return nil, false, nil
	}
	return []byte(`{"line1":"snap"}`), true, nil
}
func (f *fakeStore) SetOrderBilling(_ context.Context, _ string, billingJSON []byte) error {
	f.billingSet = true
	f.billingJSON = billingJSON
	return nil
}
func (f *fakeStore) UpsertPendingOrder(_ context.Context, _ string, _ OrderAmounts, _ []byte, _ []CheckoutLine) (string, string, error) {
	return f.orderID, f.orderNumber, nil
}
func (f *fakeStore) UpsertPayment(_ context.Context, orderID, intentID string, amount int64, status string) error {
	f.payments = append(f.payments, struct {
		orderID, intentID string
		amount            int64
		status            string
	}{orderID, intentID, amount, status})
	return nil
}
func (f *fakeStore) FindOrderByIntent(_ context.Context, intentID string) (string, bool, error) {
	o, ok := f.intentToOrder[intentID]
	return o, ok, nil
}
func (f *fakeStore) MarkEventSeen(_ context.Context, eventID, _ string) (bool, error) {
	if f.seen[eventID] {
		return false, nil
	}
	f.seen[eventID] = true
	return true, nil
}
func (f *fakeStore) OrderIntentForCustomer(_ context.Context, _, orderID string) (string, bool, error) {
	i, ok := f.orderIntent[orderID]
	return i, ok, nil
}
func (f *fakeStore) FinalizeSucceeded(_ context.Context, orderID string) (bool, error) {
	f.succeeded = append(f.succeeded, orderID)
	return f.finalizeApplied, nil
}
func (f *fakeStore) FinalizeFailed(_ context.Context, orderID string) error {
	f.failed = append(f.failed, orderID)
	return nil
}

// ── 021 QuoteStore ──
func (f *fakeStore) DestinationZone(_ context.Context, _, _ string) (string, string, bool, error) {
	if !f.destOK {
		return "3000", "", false, nil
	}
	return "3000", "zone-dest", true, nil
}
func (f *fakeStore) Legs(_ context.Context, _ []string, _ string) (map[string]Leg, error) {
	return f.legs, nil
}
func (f *fakeStore) CaptureQuote(_ context.Context, _ string, _ []byte, _ []CheckoutLine, cq CapturedQuote) (string, string, error) {
	f.captured = cq
	f.haveCaptured = true
	return f.orderID, f.orderNumber, nil
}
func (f *fakeStore) ReadCapturedQuote(_ context.Context, _ string) (CapturedQuote, string, string, bool, error) {
	return f.captured, f.orderID, f.orderNumber, f.haveCaptured, nil
}
func (f *fakeStore) WritePackageDeliveries(_ context.Context, _ string, rows []PackageDelivery, itemSub, deliveryFee int64, _ time.Time) error {
	f.wroteDeliveries = rows
	f.wroteItemSub = itemSub
	f.wroteDeliveryFee = deliveryFee
	return nil
}

const validAddr = "44444444-4444-4444-4444-444444444444"

// twoPackageQuote captures a metro (same_day $7 + standard $5) and a regional (standard $8) package.
func twoPackageQuote(exp time.Time) CapturedQuote {
	return CapturedQuote{
		ExpiresAt: exp,
		Packages: []QuotePackage{
			{PackageKey: "pkg_a", ShopID: "s1", Serviceable: true, Options: []QuoteOption{
				{Method: "same_day", ServiceLevel: "Same-day", FeeCents: 700},
				{Method: "standard", ServiceLevel: "Standard", FeeCents: 500},
			}},
			{PackageKey: "pkg_b", ShopID: "s2", Serviceable: true, Options: []QuoteOption{
				{Method: "standard", ServiceLevel: "Standard", FeeCents: 800},
			}},
		},
	}
}

func intentInput(sels ...DeliverySelection) IntentInput {
	return IntentInput{AddressID: validAddr, Selections: sels}
}

// ── 023: billing snapshot ─────────────────────────────────────────────────────────────────────

const otherAddr = "55555555-5555-5555-5555-555555555555"

func singlePackageStore(t *testing.T, now time.Time) *fakeStore {
	t.Helper()
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2}}
	store.captured = CapturedQuote{ExpiresAt: now.Add(time.Minute), Packages: []QuotePackage{
		{PackageKey: "pkg_a", ShopID: "s1", Serviceable: true, Options: []QuoteOption{
			{Method: "standard", ServiceLevel: "Standard", FeeCents: 500},
		}},
	}}
	store.haveCaptured = true
	return store
}

// FR-009/SC-004: no billing id → billing recorded as NULL ("same as shipping").
func TestIntentBillingSameAsShippingWritesNull(t *testing.T) {
	now := time.Now()
	store := singlePackageStore(t, now)
	svc := NewService(store, &fakeGateway{}, "pk")

	_, err := svc.CreateCheckoutIntent(context.Background(), "c",
		intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"}), now)
	if err != nil {
		t.Fatalf("intent: %v", err)
	}
	if !store.billingSet {
		t.Fatal("SetOrderBilling was not called")
	}
	if store.billingJSON != nil {
		t.Errorf("billing = %q, want NULL (nil) for same-as-shipping", store.billingJSON)
	}
}

// FR-009: billingAddressId equal to the shipping id → still NULL (it IS the same address).
func TestIntentBillingEqualToShippingWritesNull(t *testing.T) {
	now := time.Now()
	store := singlePackageStore(t, now)
	svc := NewService(store, &fakeGateway{}, "pk")

	in := intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"})
	in.BillingAddressID = validAddr // == shipping AddressID
	if _, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now); err != nil {
		t.Fatalf("intent: %v", err)
	}
	if store.billingJSON != nil {
		t.Errorf("billing = %q, want NULL when billing == shipping", store.billingJSON)
	}
}

// FR-008/SC-005: a distinct, valid billing id → the billing snapshot is stored.
func TestIntentDivergentBillingStoresSnapshot(t *testing.T) {
	now := time.Now()
	store := singlePackageStore(t, now)
	svc := NewService(store, &fakeGateway{}, "pk")

	in := intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"})
	in.BillingAddressID = otherAddr
	if _, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now); err != nil {
		t.Fatalf("intent: %v", err)
	}
	if store.billingJSON == nil {
		t.Fatal("divergent billing must store a snapshot, got NULL")
	}
	if string(store.billingJSON) != `{"line1":"snap"}` {
		t.Errorf("billing snapshot = %q, want the address snapshot", store.billingJSON)
	}
}

// FR-021: a billing id that is not the customer's is refused (cannot bill to a foreign address).
func TestIntentForeignBillingIsRefused(t *testing.T) {
	now := time.Now()
	store := singlePackageStore(t, now)
	store.missingAddress = otherAddr // AddressSnapshot reports this id as not-found
	svc := NewService(store, &fakeGateway{}, "pk")

	in := intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"})
	in.BillingAddressID = otherAddr
	if _, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now); err != ErrAddressNotFound {
		t.Errorf("want ErrAddressNotFound for a foreign billing id, got %v", err)
	}
}

// A malformed billing id is refused before any snapshot read.
func TestIntentMalformedBillingIsRefused(t *testing.T) {
	now := time.Now()
	store := singlePackageStore(t, now)
	svc := NewService(store, &fakeGateway{}, "pk")

	in := intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"})
	in.BillingAddressID = "not-a-uuid"
	if _, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now); err != ErrAddressNotFound {
		t.Errorf("want ErrAddressNotFound for a malformed billing id, got %v", err)
	}
}

// SC-002/FR-009: the shown per-package fee == the charge; the order total == item subtotal + Σ fees.
func TestIntentSumsPerPackageFees(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.lines = []CheckoutLine{
		{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2},  // 1000
		{ProductID: "p2", ShopID: "s2", Name: "Bread", UnitCents: 300, Quantity: 1}, // 300
	}
	store.captured = twoPackageQuote(now.Add(time.Minute))
	store.haveCaptured = true
	gw := &fakeGateway{}
	svc := NewService(store, gw, "pk_test_x")

	res, err := svc.CreateCheckoutIntent(context.Background(), "cust-1",
		intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "same_day"},
			DeliverySelection{PackageKey: "pkg_b", Method: "standard"}), now)
	if err != nil {
		t.Fatalf("intent: %v", err)
	}
	// items 1300 + same_day 700 + standard 800 = 2800
	if got := gw.createCalls[0].AmountMinor; got != 2800 {
		t.Errorf("charge = %d, want 2800 (items 1300 + fees 1500)", got)
	}
	if res.GrandTotal != "28.00" {
		t.Errorf("grand total = %q, want 28.00", res.GrandTotal)
	}
	if store.wroteDeliveryFee != 1500 || store.wroteItemSub != 1300 {
		t.Errorf("wrote fee/sub = %d/%d, want 1500/1300", store.wroteDeliveryFee, store.wroteItemSub)
	}
	if len(res.DeliveryBreakdown) != 2 {
		t.Fatalf("want a 2-line breakdown, got %+v", res.DeliveryBreakdown)
	}
	// SC-006: nothing shop-identifying on the breakdown.
	for _, b := range res.DeliveryBreakdown {
		if b.PackageKey == "s1" || b.PackageKey == "s2" {
			t.Errorf("breakdown must use opaque package keys, got %q", b.PackageKey)
		}
	}
}

// SC-004: a client-submitted fee is impossible — selections carry no fee, and the server uses the
// captured option fee. Here the selection has no way to send a price; we assert the captured fee wins.
func TestIntentUsesCapturedFeeNotAnyClientValue(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2}}
	store.captured = CapturedQuote{ExpiresAt: now.Add(time.Minute), Packages: []QuotePackage{
		{PackageKey: "pkg_a", ShopID: "s1", Serviceable: true, Options: []QuoteOption{
			{Method: "standard", ServiceLevel: "Standard", FeeCents: 500},
		}},
	}}
	store.haveCaptured = true
	gw := &fakeGateway{}
	svc := NewService(store, gw, "pk")

	_, err := svc.CreateCheckoutIntent(context.Background(), "c",
		intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"}), now)
	if err != nil {
		t.Fatalf("intent: %v", err)
	}
	// items 1000 + captured standard 500 = 1500 — the CAPTURED fee, no client price anywhere.
	if got := gw.createCalls[0].AmountMinor; got != 1500 {
		t.Errorf("charge = %d, want 1500 (captured fee)", got)
	}
}

// FR-011a: an expired captured quote → re-quote (surfaced as 409 by the handler).
func TestIntentExpiredQuoteRequiresRequote(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", UnitCents: 500, Quantity: 1}}
	store.captured = twoPackageQuote(now.Add(-time.Second)) // already expired
	store.haveCaptured = true
	svc := NewService(store, &fakeGateway{}, "pk")

	_, err := svc.CreateCheckoutIntent(context.Background(), "c",
		intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"}), now)
	if err != ErrQuoteExpired {
		t.Errorf("want ErrQuoteExpired, got %v", err)
	}
}

// No captured quote at all → must quote first (also ErrQuoteExpired).
func TestIntentWithoutQuoteRequiresQuote(t *testing.T) {
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", UnitCents: 500, Quantity: 1}}
	store.haveCaptured = false
	svc := NewService(store, &fakeGateway{}, "pk")

	_, err := svc.CreateCheckoutIntent(context.Background(), "c",
		intentInput(DeliverySelection{PackageKey: "pkg_a", Method: "standard"}), time.Now())
	if err != ErrQuoteExpired {
		t.Errorf("want ErrQuoteExpired (no quote), got %v", err)
	}
}

// R8/SC-011a: excluding a deliverable package is refused (the customer cannot silently drop items).
func TestIntentExcludingServiceablePackageIsRefused(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", UnitCents: 500, Quantity: 1}}
	store.captured = twoPackageQuote(now.Add(time.Minute))
	store.haveCaptured = true
	svc := NewService(store, &fakeGateway{}, "pk")

	in := IntentInput{AddressID: validAddr,
		Selections:   []DeliverySelection{{PackageKey: "pkg_a", Method: "standard"}},
		ExcludedKeys: []string{"pkg_b"}} // pkg_b is serviceable — excluding it is not allowed
	_, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now)
	if err != ErrExclusionMismatch {
		t.Errorf("want ErrExclusionMismatch, got %v", err)
	}
}

// R8: an unserviceable package must be confirmed-excluded and its items are NOT charged.
func TestIntentExcludesUnserviceablePackageFromCharge(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.lines = []CheckoutLine{
		{ProductID: "p1", ShopID: "s1", UnitCents: 500, Quantity: 2}, // serviceable pkg_a → 1000
		{ProductID: "p2", ShopID: "s2", UnitCents: 900, Quantity: 1}, // unserviceable pkg_b → excluded
	}
	cq := twoPackageQuote(now.Add(time.Minute))
	cq.Packages[1].Serviceable = false
	cq.Packages[1].Options = nil
	store.captured = cq
	store.haveCaptured = true
	gw := &fakeGateway{}
	svc := NewService(store, gw, "pk")

	in := IntentInput{AddressID: validAddr,
		Selections:   []DeliverySelection{{PackageKey: "pkg_a", Method: "standard"}},
		ExcludedKeys: []string{"pkg_b"}}
	_, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now)
	if err != nil {
		t.Fatalf("intent: %v", err)
	}
	// only pkg_a: items 1000 + standard 500 = 1500. pkg_b's 900 is NOT charged.
	if got := gw.createCalls[0].AmountMinor; got != 1500 {
		t.Errorf("charge = %d, want 1500 (excluded pkg not charged)", got)
	}
	if store.wroteItemSub != 1000 {
		t.Errorf("item subtotal = %d, want 1000 (excluded pkg items dropped)", store.wroteItemSub)
	}
}

// All-undeliverable → block entirely (FR-006c).
func TestIntentAllUnserviceableBlocks(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", UnitCents: 500, Quantity: 1}}
	cq := CapturedQuote{ExpiresAt: now.Add(time.Minute), Packages: []QuotePackage{
		{PackageKey: "pkg_a", ShopID: "s1", Serviceable: false},
	}}
	store.captured = cq
	store.haveCaptured = true
	svc := NewService(store, &fakeGateway{}, "pk")

	in := IntentInput{AddressID: validAddr, ExcludedKeys: []string{"pkg_a"}}
	_, err := svc.CreateCheckoutIntent(context.Background(), "c", in, now)
	if err != ErrNoServiceableItems {
		t.Errorf("want ErrNoServiceableItems, got %v", err)
	}
}

func TestIntentRejectsEmptyCartAndBadAddress(t *testing.T) {
	gw := &fakeGateway{}

	empty := newFakeStore()
	if _, err := NewService(empty, gw, "pk").CreateCheckoutIntent(context.Background(), "c", intentInput(), time.Now()); err != ErrEmptyCart {
		t.Errorf("want ErrEmptyCart, got %v", err)
	}

	badUUID := newFakeStore()
	badUUID.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", UnitCents: 100, Quantity: 1}}
	if _, err := NewService(badUUID, gw, "pk").CreateCheckoutIntent(context.Background(), "c",
		IntentInput{AddressID: "not-a-uuid"}, time.Now()); err != ErrAddressNotFound {
		t.Errorf("want ErrAddressNotFound for bad uuid, got %v", err)
	}
}

// The quote endpoint groups by shop into anonymous packages and marks serviceability, leaking no shop.
func TestQuoteGroupsAnonymousPackages(t *testing.T) {
	now := time.Now()
	store := newFakeStore()
	store.destOK = true
	store.lines = []CheckoutLine{
		{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2},
		{ProductID: "p2", ShopID: "s2", Name: "Bread", UnitCents: 300, Quantity: 1},
	}
	store.legs = map[string]Leg{
		"s1": {ShopID: "s1", OriginOK: true, Offerings: []delivery.Offering{
			{Method: delivery.MethodStandard, PriceCents: 500, LeadDaysMin: 2, LeadDaysMax: 3},
		}},
		// s2 has an origin zone but no offering for this dest → unserviceable.
		"s2": {ShopID: "s2", OriginOK: true, Offerings: nil},
	}
	svc := NewService(store, &fakeGateway{}, "pk")

	res, err := svc.Quote(context.Background(), "cust-1", validAddr, now)
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if len(res.Packages) != 2 {
		t.Fatalf("want 2 packages, got %d", len(res.Packages))
	}
	// Serviceability follows the offerings, not the shop.
	byKey := map[string]QuotePackage{}
	for _, p := range res.Packages {
		byKey[p.PackageKey] = p
		// SC-006: an anonymous, opaque key — never the raw shop id.
		if p.PackageKey == "s1" || p.PackageKey == "s2" {
			t.Errorf("package key must be opaque, got %q", p.PackageKey)
		}
	}
	a := byKey[delivery.PackageKey("s1")]
	b := byKey[delivery.PackageKey("s2")]
	if !a.Serviceable || len(a.Options) != 1 {
		t.Errorf("pkg for s1 should be serviceable with 1 option, got %+v", a)
	}
	if b.Serviceable {
		t.Errorf("pkg for s2 (no offering) should be unserviceable, got %+v", b)
	}
	if !store.haveCaptured {
		t.Error("quote must capture the quote server-side")
	}
}

func TestWebhookSucceededFinalizesOnceThenDedups(t *testing.T) {
	store := newFakeStore()
	store.intentToOrder["pi_1"] = "order-1"
	gw := &fakeGateway{webhookEvent: WebhookEvent{ID: "evt_1", Type: EventPaymentSucceeded, PaymentIntentID: "pi_1", IntentStatus: IntentSucceeded}}
	svc := NewService(store, gw, "pk")

	if err := svc.HandleWebhook(context.Background(), []byte("{}"), "sig"); err != nil {
		t.Fatalf("webhook: %v", err)
	}
	// Redelivery of the SAME event id must be a no-op (SC-006).
	if err := svc.HandleWebhook(context.Background(), []byte("{}"), "sig"); err != nil {
		t.Fatalf("webhook redelivery: %v", err)
	}
	if len(store.succeeded) != 1 || store.succeeded[0] != "order-1" {
		t.Errorf("want exactly one finalize for order-1, got %v", store.succeeded)
	}
}

func TestWebhookFailedMarksFailedNoFanOut(t *testing.T) {
	store := newFakeStore()
	store.intentToOrder["pi_1"] = "order-1"
	gw := &fakeGateway{webhookEvent: WebhookEvent{ID: "evt_2", Type: EventPaymentFailed, PaymentIntentID: "pi_1", IntentStatus: IntentFailed}}
	svc := NewService(store, gw, "pk")

	if err := svc.HandleWebhook(context.Background(), []byte("{}"), "sig"); err != nil {
		t.Fatalf("webhook: %v", err)
	}
	if len(store.failed) != 1 || len(store.succeeded) != 0 {
		t.Errorf("failed event should mark failed only: failed=%v succeeded=%v", store.failed, store.succeeded)
	}
}

func TestWebhookBadSignatureErrors(t *testing.T) {
	store := newFakeStore()
	gw := &fakeGateway{webhookErr: context.Canceled} // any non-nil error stands in for a bad signature
	svc := NewService(store, gw, "pk")
	if err := svc.HandleWebhook(context.Background(), []byte("{}"), "bad"); err == nil {
		t.Error("expected an error for an unverifiable webhook")
	}
}

func TestConfirmFinalizesWhenIntentSucceeded(t *testing.T) {
	const orderUUID = "55555555-5555-5555-5555-555555555555"
	store := newFakeStore()
	store.orderIntent[orderUUID] = "pi_1"
	gw := &fakeGateway{retrieve: PaymentIntent{ID: "pi_1", Status: IntentSucceeded}}
	svc := NewService(store, gw, "pk")

	res, err := svc.Confirm(context.Background(), "c", orderUUID)
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	if !res.Paid || len(store.succeeded) != 1 {
		t.Errorf("confirm should finalize a succeeded intent: paid=%v succeeded=%v", res.Paid, store.succeeded)
	}
}
