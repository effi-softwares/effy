package orders

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// fakeRepo records what the service asks for and returns canned rows. Hand-written, matching the
// core-api test posture (no mocking library).
type fakeRepo struct {
	order       orderRow
	items       []itemRow
	fulfillment []fulfillmentRow
	shortfalls  []shortfallRow
	shortCalls  int
	// 052
	arrivals []arrivalRow
	method   methodRow
}

func (f *fakeRepo) List(context.Context, string) ([]summaryRow, error) { return nil, nil }
func (f *fakeRepo) Get(context.Context, string, string) (orderRow, error) {
	return f.order, nil
}
func (f *fakeRepo) Items(context.Context, string) ([]itemRow, error) { return f.items, nil }
func (f *fakeRepo) Fulfillments(context.Context, string) ([]fulfillmentRow, error) {
	return f.fulfillment, nil
}
func (f *fakeRepo) Shortfalls(context.Context, string) ([]shortfallRow, error) {
	f.shortCalls++
	return f.shortfalls, nil
}
func (f *fakeRepo) Arrivals(context.Context, string) ([]arrivalRow, error) { return f.arrivals, nil }
func (f *fakeRepo) PaymentMethod(context.Context, string) (methodRow, error) {
	return f.method, nil
}

const orderID = "3f1c0b6e-7a7e-4a1a-9f2e-2b6c9a5d4e31"

func baseRepo() *fakeRepo {
	return &fakeRepo{
		order: orderRow{
			ID: orderID, OrderNumber: "EFY-1", Status: "paid",
			ItemSubtotal: "45.00", GrandTotal: "50.00", Currency: "AUD",
			Address: []byte(`{"city":"Melbourne"}`),
		},
		fulfillment: []fulfillmentRow{
			{ID: "portion-a", Status: "ready_for_pickup", Count: 3, Subtotal: "35.00"},
			{ID: "portion-b", Status: "picking", Count: 1, Subtotal: "10.00"},
		},
	}
}

// 023 US5 / FR-016: a same-as-shipping order carries NO billing snapshot (the column is NULL) — the
// service returns an empty BillingAddress and the handler omits `billingAddress`, so the client shows
// "Billing: same as shipping".
func TestGet_BillingSameAsShippingIsEmpty(t *testing.T) {
	repo := baseRepo() // order.Billing left nil
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.BillingAddress) != 0 {
		t.Errorf("BillingAddress = %q, want empty (same as shipping)", got.BillingAddress)
	}
}

// 023 US5 / FR-008: a divergent-billing order carries its own immutable billing snapshot, distinct
// from the shipping (delivery) address.
func TestGet_DivergentBillingIsReturned(t *testing.T) {
	repo := baseRepo()
	repo.order.Billing = []byte(`{"city":"Sydney"}`)
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(got.BillingAddress) != `{"city":"Sydney"}` {
		t.Errorf("BillingAddress = %q, want the divergent snapshot", got.BillingAddress)
	}
	if string(got.DeliveryAddress) == string(got.BillingAddress) {
		t.Error("shipping and billing must be distinct snapshots here")
	}
}

// 020 US5 / FR-017: the customer's view reflects the shop's real working lifecycle. Before this
// slice every portion was permanently `pending` because nothing could change it.
func TestGet_ExposesRicherFulfillmentStates(t *testing.T) {
	repo := baseRepo()
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.Fulfillments) != 2 {
		t.Fatalf("want 2 portions, got %d", len(got.Fulfillments))
	}
	if got.Fulfillments[0].Status != "ready_for_pickup" || got.Fulfillments[1].Status != "picking" {
		t.Fatalf("statuses not passed through: %+v", got.Fulfillments)
	}
}

// FR-018b / SC-017: shortfalls attach to the portion that reported them, and only terminal portions
// can report any — the repository query enforces that, so an un-flagged item never reaches here.
func TestGet_AttachesShortfallsToTheirOwnPortion(t *testing.T) {
	repo := baseRepo()
	repo.shortfalls = []shortfallRow{
		{FulfillmentID: "portion-a", ProductName: "Barilla Spaghetti", Quantity: 1},
	}

	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.Fulfillments[0].Unavailable) != 1 {
		t.Fatalf("terminal portion should carry its shortfall, got %+v", got.Fulfillments[0])
	}
	if got.Fulfillments[0].Unavailable[0].ProductName != "Barilla Spaghetti" {
		t.Fatalf("wrong shortfall: %+v", got.Fulfillments[0].Unavailable[0])
	}
	// The still-picking portion must carry none, even though it is on the same order.
	if got.Fulfillments[1].Unavailable != nil {
		t.Fatalf("non-terminal portion must carry no shortfall, got %+v", got.Fulfillments[1].Unavailable)
	}
}

// A portion still being picked must expose nothing — mid-pick churn never reaches the customer.
func TestGet_NoShortfallWhileStillPicking(t *testing.T) {
	repo := baseRepo()
	repo.fulfillment = []fulfillmentRow{{ID: "portion-b", Status: "picking", Count: 1, Subtotal: "10.00"}}

	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Fulfillments[0].Unavailable != nil {
		t.Fatalf("want no shortfall while picking, got %+v", got.Fulfillments[0].Unavailable)
	}
}

// SC-009 / FR-018: the customer must learn NOTHING about which or how many shops are involved. The
// portion id exists only to join shortfalls in memory and must never be serialized.
func TestOrderDTO_CarriesNoShopIdentity(t *testing.T) {
	repo := baseRepo()
	repo.shortfalls = []shortfallRow{
		{FulfillmentID: "portion-a", ProductName: "Barilla Spaghetti", Quantity: 1},
	}
	order, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	ful := make([]fulfillmentDTO, 0, len(order.Fulfillments))
	for _, f := range order.Fulfillments {
		var short []shortfallDTO
		for _, sh := range f.Unavailable {
			short = append(short, shortfallDTO{ProductName: sh.ProductName, Quantity: sh.Quantity})
		}
		ful = append(ful, fulfillmentDTO{
			Status: f.Status, ItemCount: f.ItemCount, SubtotalAmount: f.SubtotalAmount,
			Unavailable: short,
		})
	}

	blob, err := json.Marshal(orderDTO{
		ID: order.ID, OrderNumber: order.OrderNumber, Status: order.Status,
		DeliveryAddress: json.RawMessage(order.DeliveryAddress), Fulfillments: ful,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	wire := strings.ToLower(string(blob))
	for _, leak := range []string{"shop", "portion-a", "portion-b", "fulfillmentid"} {
		if strings.Contains(wire, leak) {
			t.Fatalf("customer wire payload leaks %q: %s", leak, wire)
		}
	}
}

// `omitempty` is load-bearing: a portion with no shortfall must omit the key entirely rather than
// emit an empty array, which a client could misread as "we checked and there is nothing".
func TestFulfillmentDTO_OmitsShortfallKeyWhenAbsent(t *testing.T) {
	blob, err := json.Marshal(fulfillmentDTO{Status: "picking", ItemCount: 2, SubtotalAmount: "10.00"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(blob), "unavailableItems") {
		t.Fatalf("want the key omitted, got %s", blob)
	}
}

// ── 052 ─────────────────────────────────────────────────────────────────────────────────────────

// The receipt's key set, asserted against the CONTRACT — specs/052-order-confirmation-invoice/
// contracts/receipt.contract.md §1 — and deliberately NOT against `orderDTO`.
//
// ⚠ THIS IS THE 033 LESSON. That slice wrote its key-set expectation from its own Go struct, so the
// test agreed with the code instead of with the world and passed while the contract was violated. The
// literal below is transcribed from the contract by hand; if someone renames a field in `orderDTO`,
// this fails, which is the entire point. An assertion that cannot fail is not an assertion.
func TestOrderDTO_KeySetMatchesTheContract(t *testing.T) {
	want := map[string]bool{
		"id": true, "orderNumber": true, "status": true, "placedAt": true, "items": true,
		"deliveryAddress": true, "itemSubtotalAmount": true, "discountAmount": true,
		"deliveryFeeAmount": true, "promoCode": true, "grandTotalAmount": true, "currency": true,
		"paymentStatus": true, "fulfillments": true,
		// 052 additions
		"stage": true, "paymentMethod": true, "arrivalEstimates": true,
		// `billingAddress` is omitempty — absent means "same as shipping" (FR-016), so it is not
		// required here and its ABSENCE is asserted by TestGet_BillingSameAsShippingIsEmpty.
	}

	blob, err := json.Marshal(orderDTO{})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(blob, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for k := range want {
		if _, ok := got[k]; !ok {
			t.Errorf("contract requires key %q and the response does not carry it", k)
		}
	}
	for k := range got {
		if !want[k] && k != "billingAddress" {
			t.Errorf("response carries key %q which the contract does not declare", k)
		}
	}
}

// FR-006 / data-model §1: absence is normal. A pre-052 order, or one whose post-commit capture
// failed, carries no method — and the client must be able to tell that apart from a blank.
func TestGet_PaymentMethodIsNilWhenNeverCaptured(t *testing.T) {
	repo := &fakeRepo{order: orderRow{ID: orderID, Currency: "AUD"}}
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.PaymentMethod != nil {
		t.Fatalf("PaymentMethod = %+v, want nil when nothing was captured", got.PaymentMethod)
	}

	blob, _ := json.Marshal(orderDTO{PaymentMethod: nil})
	if !strings.Contains(string(blob), `"paymentMethod":null`) {
		t.Fatalf("an uncaptured method must serialise as null, got %s", blob)
	}
}

// FR-006: only `last4` may describe the card. This pins the SHAPE — if someone adds an expiry or a
// cardholder name to the DTO, it fails here rather than at a privacy review.
func TestPaymentMethodDTO_CarriesNothingButTheFamilyBrandAndLast4(t *testing.T) {
	blob, err := json.Marshal(paymentMethodDTO{Type: "card"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(blob, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	allowed := map[string]bool{"type": true, "brand": true, "last4": true}
	for k := range got {
		if !allowed[k] {
			t.Errorf("paymentMethodDTO carries %q — no card field beyond last4 may exist here (051)", k)
		}
	}
}

// FR-007 / research R4: the arrival estimate is a DATE RANGE. Nothing on this struct may carry a
// time, because the platform has none to give.
func TestArrivalEstimates_AreAlwaysAnArrayAndCarryNoShopReference(t *testing.T) {
	repo := &fakeRepo{
		order: orderRow{ID: orderID, Currency: "AUD"},
		arrivals: []arrivalRow{
			{Method: "same_day", PromisedFrom: strptr("2026-08-26"), PromisedTo: strptr("2026-08-26")},
		},
	}
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.ArrivalEstimates) != 1 || got.ArrivalEstimates[0].Method != "same_day" {
		t.Fatalf("ArrivalEstimates = %+v", got.ArrivalEstimates)
	}

	blob, _ := json.Marshal(arrivalEstimateDTO{Method: "same_day"})
	for _, banned := range []string{"shop", "Shop", "ring", "distance", "readyBy"} {
		if strings.Contains(string(blob), banned) {
			t.Fatalf("arrivalEstimateDTO leaks %q — no fulfilment structure may cross this boundary (FR-009)", banned)
		}
	}

	// An order with no packages still serialises an ARRAY, never null.
	empty := &fakeRepo{order: orderRow{ID: orderID, Currency: "AUD"}}
	e, _ := NewService(empty, nil).Get(context.Background(), "cust-1", orderID)
	if e.ArrivalEstimates == nil {
		t.Fatal("ArrivalEstimates must be an empty slice, never nil — the client has no undefined branch")
	}
}

// FR-003: the image is decoration. No presigner, or no media row, must still produce a whole line.
func TestItems_RenderCompleteWithoutAnImage(t *testing.T) {
	repo := &fakeRepo{
		order: orderRow{ID: orderID, Currency: "AUD"},
		items: []itemRow{{ProductID: "p1", ProductName: "Milk", UnitPrice: "3.10", Quantity: 2, LineSubtotal: "6.20"}},
	}
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.Items) != 1 {
		t.Fatalf("items = %+v", got.Items)
	}
	if got.Items[0].ImageURL != nil {
		t.Fatalf("ImageURL = %v, want nil with no presigner", *got.Items[0].ImageURL)
	}
	// The facts that matter survive regardless.
	if got.Items[0].UnitPriceAmount != "3.10" || got.Items[0].LineSubtotalAmount != "6.20" {
		t.Fatalf("a line missing its picture must still carry its money: %+v", got.Items[0])
	}
}

func strptr(s string) *string { return &s }
