package checkout

import (
	"context"
	"testing"
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
func (f *fakeStore) AddressSnapshot(_ context.Context, _, _ string) ([]byte, bool, error) {
	if !f.addressFound {
		return nil, false, nil
	}
	return []byte(`{}`), true, nil
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

const validAddr = "44444444-4444-4444-4444-444444444444"

func TestIntentAmountIsServerComputedWithFlatDeliveryFee(t *testing.T) {
	store := newFakeStore()
	store.lines = []CheckoutLine{
		{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2},  // 1000
		{ProductID: "p2", ShopID: "s2", Name: "Bread", UnitCents: 300, Quantity: 1}, // 300
	}
	gw := &fakeGateway{}
	svc := NewService(store, gw, "pk_test_x")

	res, err := svc.CreateCheckoutIntent(context.Background(), "cust-1", validAddr)
	if err != nil {
		t.Fatalf("intent: %v", err)
	}
	// subtotal 1300 + flat delivery 500 = 1800 → the amount the provider is asked to charge.
	if got := gw.createCalls[0].AmountMinor; got != 1800 {
		t.Errorf("charge amount = %d, want 1800 (server-computed)", got)
	}
	if res.GrandTotal != "18.00" {
		t.Errorf("grand total = %q, want 18.00", res.GrandTotal)
	}
	if res.ClientSecret != "cs_1" || res.PublishableKey != "pk_test_x" {
		t.Errorf("unexpected client fields: %+v", res)
	}
	if len(store.payments) != 1 || store.payments[0].amount != 1800 {
		t.Errorf("payment not upserted with server amount: %+v", store.payments)
	}
}

func TestIntentIdempotencyKeyIsDeterministic(t *testing.T) {
	store := newFakeStore()
	store.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", Name: "Milk", UnitCents: 500, Quantity: 2}}
	gw := &fakeGateway{}
	svc := NewService(store, gw, "pk")

	_, _ = svc.CreateCheckoutIntent(context.Background(), "c", validAddr)
	_, _ = svc.CreateCheckoutIntent(context.Background(), "c", validAddr)

	if len(gw.createCalls) != 2 {
		t.Fatalf("want 2 create calls, got %d", len(gw.createCalls))
	}
	if gw.createCalls[0].IdempotencyKey == "" || gw.createCalls[0].IdempotencyKey != gw.createCalls[1].IdempotencyKey {
		t.Errorf("idempotency key not deterministic across retries: %q vs %q",
			gw.createCalls[0].IdempotencyKey, gw.createCalls[1].IdempotencyKey)
	}
}

func TestIntentRejectsEmptyCartAndBadAddress(t *testing.T) {
	gw := &fakeGateway{}

	empty := newFakeStore()
	if _, err := NewService(empty, gw, "pk").CreateCheckoutIntent(context.Background(), "c", validAddr); err != ErrEmptyCart {
		t.Errorf("want ErrEmptyCart, got %v", err)
	}

	noAddr := newFakeStore()
	noAddr.lines = []CheckoutLine{{ProductID: "p1", ShopID: "s1", UnitCents: 100, Quantity: 1}}
	noAddr.addressFound = false
	if _, err := NewService(noAddr, gw, "pk").CreateCheckoutIntent(context.Background(), "c", validAddr); err != ErrAddressNotFound {
		t.Errorf("want ErrAddressNotFound, got %v", err)
	}
	if _, err := NewService(noAddr, gw, "pk").CreateCheckoutIntent(context.Background(), "c", "not-a-uuid"); err != ErrAddressNotFound {
		t.Errorf("want ErrAddressNotFound for bad uuid, got %v", err)
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
