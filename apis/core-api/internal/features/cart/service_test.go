package cart

import (
	"context"
	"testing"
)

// fakeRepo is a hand-rolled in-memory cart repository (the Repo seam).
type fakeRepo struct {
	cartID    string
	items     map[string]int    // productID → qty
	statuses  map[string]string // productID → status ("" = missing)
	priceByID map[string]string // productID → unit price
	nameByID  map[string]string // productID → name
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		cartID:    "cart-1",
		items:     map[string]int{},
		statuses:  map[string]string{},
		priceByID: map[string]string{},
		nameByID:  map[string]string{},
	}
}

// two valid uuids for the tests.
const (
	pMilk  = "11111111-1111-1111-1111-111111111111"
	pBread = "22222222-2222-2222-2222-222222222222"
	pGone  = "33333333-3333-3333-3333-333333333333"
)

func (f *fakeRepo) GetOrCreateCartID(_ context.Context, _ string) (string, error) {
	return f.cartID, nil
}

func (f *fakeRepo) Lines(_ context.Context, _ string) ([]cartLineRow, error) {
	out := make([]cartLineRow, 0, len(f.items))
	for id, qty := range f.items {
		out = append(out, cartLineRow{
			ID: "line-" + id, ProductID: id, Quantity: qty,
			Name: f.nameByID[id], UnitPriceAmount: f.priceByID[id], Currency: "AUD",
			Status: f.statuses[id],
		})
	}
	return out, nil
}

func (f *fakeRepo) ProductStatus(_ context.Context, productID string) (string, bool, error) {
	s, ok := f.statuses[productID]
	return s, ok, nil
}

func (f *fakeRepo) AddItem(_ context.Context, _, productID string, qty, max int) error {
	f.items[productID] = min(f.items[productID]+qty, max)
	return nil
}

func (f *fakeRepo) SetQty(_ context.Context, _, productID string, qty int) error {
	f.items[productID] = qty
	return nil
}

func (f *fakeRepo) RemoveItem(_ context.Context, _, productID string) error {
	delete(f.items, productID)
	return nil
}

type noPresign struct{}

func (noPresign) PresignGet(_ context.Context, _ string) (string, error) { return "", nil }

func seedProduct(f *fakeRepo, id, name, price, status string) {
	f.statuses[id] = status
	f.priceByID[id] = price
	f.nameByID[id] = name
}

// 021: the cart no longer carries a delivery fee — delivery is priced per package at checkout (it needs
// the address). The cart shows item subtotal only; DeliveryFeeAmount is 0 and GrandTotal == subtotal.
func TestAddComputesItemTotalsNoCartDeliveryFee(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := NewService(f, noPresign{})

	cart, err := svc.Add(context.Background(), "cust-1", pMilk, 2)
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if cart.ItemSubtotalAmount != "10.00" {
		t.Errorf("item subtotal = %q, want 10.00", cart.ItemSubtotalAmount)
	}
	if cart.DeliveryFeeAmount != "0.00" {
		t.Errorf("delivery fee = %q, want 0.00 (calculated at checkout, 021)", cart.DeliveryFeeAmount)
	}
	if cart.GrandTotalAmount != "10.00" {
		t.Errorf("grand total = %q, want 10.00 (no cart delivery fee, 021)", cart.GrandTotalAmount)
	}
	// The line carries an opaque, anonymous package key — never a shop id/name.
	if len(cart.Lines) != 1 || cart.Lines[0].PackageKey == "" {
		t.Fatalf("line must carry a packageKey, got %+v", cart.Lines)
	}
	if len(cart.Lines[0].PackageKey) < 4 || cart.Lines[0].PackageKey[:4] != "pkg_" {
		t.Errorf("packageKey should be an opaque pkg_ token, got %q", cart.Lines[0].PackageKey)
	}
}

func TestAddMergesQuantityAndClampsAtMax(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "1.00", "active")
	svc := NewService(f, noPresign{})

	_, _ = svc.Add(context.Background(), "c", pMilk, 50)
	cart, _ := svc.Add(context.Background(), "c", pMilk, 60) // 110 → clamp 99
	if cart.Lines[0].Quantity != 99 {
		t.Errorf("quantity = %d, want 99 (clamped)", cart.Lines[0].Quantity)
	}
}

func TestAddUnavailableAndMissingAreRejected(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pBread, "Bread", "3.00", "unavailable")
	svc := NewService(f, noPresign{})

	if _, err := svc.Add(context.Background(), "c", pBread, 1); err != ErrProductUnavailable {
		t.Errorf("want ErrProductUnavailable, got %v", err)
	}
	if _, err := svc.Add(context.Background(), "c", pGone, 1); err != ErrProductNotFound {
		t.Errorf("want ErrProductNotFound, got %v", err)
	}
	if _, err := svc.Add(context.Background(), "c", "not-a-uuid", 1); err != ErrProductNotFound {
		t.Errorf("want ErrProductNotFound for bad uuid, got %v", err)
	}
}

func TestUnavailableLineExcludedFromPayableAndFlagged(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	svc := NewService(f, noPresign{})
	_, _ = svc.Add(context.Background(), "c", pMilk, 1)
	_, _ = svc.Add(context.Background(), "c", pBread, 1)

	// Bread goes unavailable after being added.
	f.statuses[pBread] = "unavailable"
	cart, _ := svc.Get(context.Background(), "c")

	if cart.ItemSubtotalAmount != "5.00" {
		t.Errorf("subtotal should exclude the unavailable line: got %q, want 5.00", cart.ItemSubtotalAmount)
	}
	if len(cart.Notices) != 1 || cart.Notices[0].Kind != "unavailable" || cart.Notices[0].ProductID != pBread {
		t.Errorf("want one unavailable notice for bread, got %+v", cart.Notices)
	}
}

func TestSetQtyZeroRemovesLine(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := NewService(f, noPresign{})
	_, _ = svc.Add(context.Background(), "c", pMilk, 3)

	cart, err := svc.SetQty(context.Background(), "c", pMilk, 0)
	if err != nil {
		t.Fatalf("SetQty: %v", err)
	}
	if len(cart.Lines) != 0 {
		t.Errorf("want empty cart after qty 0, got %d lines", len(cart.Lines))
	}
	if cart.GrandTotalAmount != "0.00" {
		t.Errorf("empty cart total = %q, want 0.00", cart.GrandTotalAmount)
	}
}

func TestMergeSumsIntoServerCartSkippingBadItems(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	svc := NewService(f, noPresign{})
	_, _ = svc.Add(context.Background(), "c", pMilk, 1)

	cart, err := svc.Merge(context.Background(), "c", []MergeLine{
		{ProductID: pMilk, Quantity: 2}, // sums with existing → 3
		{ProductID: pGone, Quantity: 5}, // missing → skipped
	})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if cart.Lines[0].Quantity != 3 {
		t.Errorf("merged quantity = %d, want 3", cart.Lines[0].Quantity)
	}
}
