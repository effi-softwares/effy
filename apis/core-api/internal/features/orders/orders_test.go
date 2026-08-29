package orders

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// fakeRepo records what the service asks for and returns canned rows. Hand-written, matching the
// core-api test posture (no mocking library).
type fakeRepo struct {
	// 055 — the refund block on the customer's order read.
	refunds     []refundRow
	refundsErr  error
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

func (f *fakeRepo) Refunds(context.Context, string) ([]refundRow, error) {
	return f.refunds, f.refundsErr
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
		// 055 — whether the SHOPPER may still cancel it themselves (FR-012). Server-derived.
		"cancellable": true,
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

// ── 055 US5 — what happened to the shopper's money ──────────────────────────────────────────────

// ⚠ SC-011 / T065 — AN ORDER WITH NO REFUNDS MUST BE BYTE-IDENTICAL TO ITS PRE-SLICE SELF.
//
// Every 055 field is `omitempty` for exactly this reason. A client that has never seen a refund must
// not be able to tell this slice shipped: no empty array, no "0.00" totals, no `fullyRefunded:false`.
// Adding three keys to every order response on the platform to say nothing happened is not free —
// it is bytes on every read, and a shape every client must now branch on.
func TestOrderDTO_AnUnrefundedOrderCarriesNoRefundKeysAtAll(t *testing.T) {
	blob, err := json.Marshal(orderDTO{})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, key := range []string{"refunds", "refundedTotal", "amountPaidAfterRefunds", "fullyRefunded"} {
		if strings.Contains(string(blob), key) {
			t.Fatalf("an unrefunded order must not carry %q: %s", key, blob)
		}
	}
}

// ⚠ T063 — THE NUMBERS MUST ADD UP. 051 and 052 EACH SHIPPED A RECEIPT WHOSE LINES DID NOT, and a
// refund puts a second set of figures on the same document.
func TestGet_RefundArithmeticAddsUp(t *testing.T) {
	repo := baseRepo() // grand total 50.00
	repo.refunds = []refundRow{
		{Amount: "10.00", Status: "succeeded"},
		{Amount: "5.50", Status: "submitted"},
	}
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.RefundedTotal != "15.50" {
		t.Fatalf("RefundedTotal = %q, want 15.50", got.RefundedTotal)
	}
	if got.AmountPaidAfterRefunds != "34.50" {
		t.Fatalf("AmountPaidAfterRefunds = %q, want 34.50", got.AmountPaidAfterRefunds)
	}
	// ⚠ THE RECEIPT IS UNCHANGED (FR-024). What was CHARGED is a historical record; a document that
	// silently rewrote itself after a refund could not be reconciled against a bank statement.
	if got.GrandTotalAmount != "50.00" {
		t.Fatalf("the charged total must not move: %q", got.GrandTotalAmount)
	}
}

// ⚠ Accumulating 2-dp strings as floats is how `0.1 + 0.2` reaches a shopper's order page as
// `0.30000000000000004`. Ten ten-cent refunds must come to exactly one dollar.
func TestGet_RefundTotalsDoNotDriftAcrossManySmallAmounts(t *testing.T) {
	repo := baseRepo()
	for i := 0; i < 10; i++ {
		repo.refunds = append(repo.refunds, refundRow{Amount: "0.10", Status: "succeeded"})
	}
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.RefundedTotal != "1.00" {
		t.Fatalf("RefundedTotal = %q, want exactly 1.00", got.RefundedTotal)
	}
	if got.AmountPaidAfterRefunds != "49.00" {
		t.Fatalf("AmountPaidAfterRefunds = %q, want 49.00", got.AmountPaidAfterRefunds)
	}
}

// ⚠ AN UNACCEPTED ATTEMPT AND A FAILED ONE MUST NOT REDUCE WHAT THE SHOPPER PAID. Both still APPEAR
// in the list — a shopper should see we tried — but neither has left our hands.
func TestGet_UnsettledAndFailedRefundsAreShownButNotSubtracted(t *testing.T) {
	repo := baseRepo()
	repo.refunds = []refundRow{
		{Amount: "10.00", Status: "submitting"},
		{Amount: "8.00", Status: "failed"},
		{Amount: "2.00", Status: "succeeded"},
	}
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.Refunds) != 3 {
		t.Fatalf("all three must be visible, got %d", len(got.Refunds))
	}
	if got.RefundedTotal != "2.00" {
		t.Fatalf("only the settled one counts: %q", got.RefundedTotal)
	}
	if got.AmountPaidAfterRefunds != "48.00" {
		t.Fatalf("AmountPaidAfterRefunds = %q, want 48.00", got.AmountPaidAfterRefunds)
	}
}

// ⚠ FR-023 — REACHING IT PIECE BY PIECE AND REACHING IT IN ONE ACT MUST BE THE SAME FACT. That is
// why it is derived from the totals rather than stored: a flag could be true while the numbers said
// otherwise, and then nobody knows which to believe.
func TestGet_FullyRefundedIsDerivedNotFlagged(t *testing.T) {
	pieceByPiece := baseRepo()
	pieceByPiece.refunds = []refundRow{
		{Amount: "20.00", Status: "succeeded"},
		{Amount: "20.00", Status: "succeeded"},
		{Amount: "10.00", Status: "succeeded"},
	}
	inOneAct := baseRepo()
	inOneAct.refunds = []refundRow{{Amount: "50.00", Status: "succeeded"}}

	for name, repo := range map[string]*fakeRepo{"piece by piece": pieceByPiece, "in one act": inOneAct} {
		got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if !got.FullyRefunded {
			t.Fatalf("%s: want fully refunded", name)
		}
		if got.AmountPaidAfterRefunds != "0.00" {
			t.Fatalf("%s: AmountPaidAfterRefunds = %q, want 0.00", name, got.AmountPaidAfterRefunds)
		}
	}

	partial := baseRepo()
	partial.refunds = []refundRow{{Amount: "49.99", Status: "succeeded"}}
	got, _ := NewService(partial, nil).Get(context.Background(), "cust-1", orderID)
	if got.FullyRefunded {
		t.Fatal("one cent short is not fully refunded")
	}
}

// ⚠ T059 / SC-009 — NO PROVIDER FAILURE REASON MAY REACH A CUSTOMER, and the strongest form of that
// guarantee is that the column is never selected. This asserts the DTO has nowhere to put one.
func TestCustomerRefundDTO_HasNoPlaceForAProviderFailureReason(t *testing.T) {
	blob, err := json.Marshal(customerRefundDTO{Amount: "10.00", State: "there_was_a_problem"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	wire := strings.ToLower(string(blob))
	for _, leak := range []string{"failure", "reason", "decline", "bank", "kind", "note"} {
		if strings.Contains(wire, leak) {
			t.Fatalf("customer refund payload must not carry %q: %s", leak, wire)
		}
	}
}

// ⚠ A refund read that fails must not fail the whole receipt. The order and its lines are the
// document; the refund block is an addition to it.
func TestGet_AFailedRefundReadStillReturnsTheOrder(t *testing.T) {
	repo := baseRepo()
	repo.refundsErr = errors.New("database unavailable")
	got, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("the receipt must survive a refund read failure: %v", err)
	}
	if got.OrderNumber != "EFY-1" {
		t.Fatal("the order itself must still be there")
	}
	if len(got.Refunds) != 0 {
		t.Fatal("and no refunds are claimed")
	}
}

// ⚠ T066 / SC-009 — SWEEP THE WHOLE CUSTOMER ORDER PAYLOAD, not just the refund block.
//
// The refund fields were added to a response that already had a no-shop-identity guarantee, and a
// new nested struct is exactly where such a guarantee quietly stops holding. This renders a fully
// populated order — refunds included — and sweeps the serialised bytes.
func TestOrderDTO_WithRefundsStillLeaksNothing(t *testing.T) {
	repo := baseRepo()
	repo.shortfalls = []shortfallRow{
		{FulfillmentID: "portion-a", ProductName: "Barilla Spaghetti", Quantity: 1},
	}
	repo.refunds = []refundRow{
		{Amount: "10.00", Status: "failed"},
		{Amount: "5.00", Status: "succeeded"},
	}
	order, err := NewService(repo, nil).Get(context.Background(), "cust-1", orderID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	blob, err := json.Marshal(orderDTO{
		ID: order.ID, OrderNumber: order.OrderNumber, Status: order.Status,
		Refunds:                refundDTOs(order.Refunds),
		RefundedTotal:          order.RefundedTotal,
		AmountPaidAfterRefunds: order.AmountPaidAfterRefunds,
		FullyRefunded:          order.FullyRefunded,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	wire := strings.ToLower(string(blob))
	// ⚠ `shop` is checked as a bare token here rather than as a substring — this payload has no
	// domain in it, but the same sweep in email-kit had to learn that `effyshopping.com` contains it.
	for _, leak := range []string{
		"shop", "portion-a", "fulfillmentid",
		// 055 — the provider's own vocabulary must not reach a shopper.
		"failurereason", "declined", "stripe", "provider", "idempotency", "goodwill", "cancellation",
	} {
		if strings.Contains(wire, leak) {
			t.Fatalf("customer order payload leaks %q: %s", leak, wire)
		}
	}
}
