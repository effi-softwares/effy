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

const orderID = "3f1c0b6e-7a7e-4a1a-9f2e-2b6c9a5d4e31"

func baseRepo() *fakeRepo {
	return &fakeRepo{
		order: orderRow{
			ID: orderID, OrderNumber: "EFY-1", Status: "paid",
			ItemSubtotal: "45.00", DeliveryFee: "5.00", GrandTotal: "50.00", Currency: "AUD",
			Address: []byte(`{"city":"Melbourne"}`),
		},
		fulfillment: []fulfillmentRow{
			{ID: "portion-a", Status: "ready_for_pickup", Count: 3, Subtotal: "35.00"},
			{ID: "portion-b", Status: "picking", Count: 1, Subtotal: "10.00"},
		},
	}
}

// 020 US5 / FR-017: the customer's view reflects the shop's real working lifecycle. Before this
// slice every portion was permanently `pending` because nothing could change it.
func TestGet_ExposesRicherFulfillmentStates(t *testing.T) {
	repo := baseRepo()
	got, err := NewService(repo).Get(context.Background(), "cust-1", orderID)
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

	got, err := NewService(repo).Get(context.Background(), "cust-1", orderID)
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

	got, err := NewService(repo).Get(context.Background(), "cust-1", orderID)
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
	order, err := NewService(repo).Get(context.Background(), "cust-1", orderID)
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
