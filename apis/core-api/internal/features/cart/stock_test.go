package cart

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// 054 US2 — the buying gates. Everything here is about ONE harm: a shopper being charged in full for
// something that does not exist. Before this feature the only discovery mechanism was a picker at an
// empty shelf, hours later, with no money path behind it.

func trackedProduct(f *fakeRepo, id, name, price string, onHand int) {
	seedProduct(f, id, name, price, "active")
	f.track(id, onHand)
}

// newFixture is the house shape (a fake repo + the default policy), named once so these tests read
// as behaviour rather than setup.
func newFixture(_ *testing.T) (*fakeRepo, *Service) {
	f := newFakeRepo()
	return f, newSvc(f, defaultPolicy())
}

func TestAdd_RefusedBeyondStock_AndSaysHowMany(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 2)

	_, err := svc.Add(context.Background(), "c", pMilk, "a", 5)

	var stockErr *InsufficientStockError
	if !errors.As(err, &stockErr) {
		t.Fatalf("want InsufficientStockError, got %v", err)
	}
	// ⚠ THE NUMBER IS THE REQUIREMENT (FR-016). "That product is unavailable" leaves a shopper with
	// nothing to do; "only 2 available" lets them take the two.
	if stockErr.Available != 2 {
		t.Errorf("the refusal must carry the available quantity: got %d, want 2", stockErr.Available)
	}
}

func TestAdd_LeavesTheCartUntouchedWhenRefused(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 2)

	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 5); err == nil {
		t.Fatal("want a refusal")
	}
	cart, err := svc.Get(context.Background(), "c")
	if err != nil {
		t.Fatal(err)
	}
	if len(cart.Lines) != 0 {
		t.Errorf("a refused add must change nothing: %+v", cart.Lines)
	}
}

func TestAdd_UpToStockSucceeds(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 2)

	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 2); err != nil {
		t.Fatalf("taking exactly what the shop has must succeed: %v", err)
	}
}

// ⚠ THE DEFECT THIS CLOSES. Checking only the increment would let a shopper walk a line past the
// shelf two taps at a time — 2, then 2, then 2 against a shelf of 3.
func TestAdd_ChecksTheRESULTINGQuantityNotTheIncrement(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 3)

	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 2); err != nil {
		t.Fatalf("first add: %v", err)
	}
	_, err := svc.Add(context.Background(), "c", pMilk, "b", 2)

	var stockErr *InsufficientStockError
	if !errors.As(err, &stockErr) {
		t.Fatalf("2 + 2 against a shelf of 3 must be refused, got %v", err)
	}
}

func TestSetQty_RefusedBeyondStock(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 4)
	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 1); err != nil {
		t.Fatal(err)
	}

	_, err := svc.SetQty(context.Background(), "c", pMilk, "b", 9)
	var stockErr *InsufficientStockError
	if !errors.As(err, &stockErr) || stockErr.Available != 4 {
		t.Fatalf("want a refusal naming 4 available, got %v", err)
	}
}

// ⚠ UNTRACKED IS UNCHANGED (FR-002, SC-006). This is the single most important property on day one:
// the whole catalogue is untracked the moment this ships.
func TestAdd_UntrackedProductIsUnaffectedAtAnyQuantity(t *testing.T) {
	f, svc := newFixture(t)
	seedProduct(f, pMilk, "Milk", "2.00", "active") // no track() call

	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 50); err != nil {
		t.Fatalf("an untracked product must behave exactly as it did before 054: %v", err)
	}
}

// FR-017: the shopper is TOLD, and the payable amount counts only what is available.
func TestRead_APartiallySuppliedLineIsCappedAndFlagged(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 5)
	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 5); err != nil {
		t.Fatal(err)
	}

	f.onHandByID[pMilk] = 2 // the shop sells four to someone else

	cart, err := svc.Get(context.Background(), "c")
	if err != nil {
		t.Fatal(err)
	}
	if len(cart.Lines) != 1 {
		t.Fatalf("the line must survive, capped: %+v", cart.Lines)
	}
	// ⚠ The PRESENTED quantity is capped, so `lineSubtotal == unitPrice × quantity` still holds.
	// Leaving quantity at 5 while charging for 2 is the shape of 051/052's "lines did not add up"
	// defect, and every surface that renders a cart does that multiplication somewhere.
	if got := cart.Lines[0].Quantity; got != 2 {
		t.Errorf("quantity must be capped at what the shop has: got %d, want 2", got)
	}
	if got := cart.Lines[0].LineSubtotalAmount; got != "4.00" {
		t.Errorf("subtotal must match the capped quantity: got %q, want 4.00", got)
	}
	if got := cart.ItemSubtotalAmount; got != "4.00" {
		t.Errorf("payable subtotal must count only what is available: got %q", got)
	}
	if noticeKinds(cart)[NoticeQuantityClamped] != pMilk {
		t.Errorf("the shopper must be told what changed: %+v", cart.Notices)
	}
}

func TestRead_AnOutOfStockLineIsExcludedFromPayableAndNamesTheCause(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 3)
	seedProduct(f, pBread, "Bread", "5.00", "active")
	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 2); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Add(context.Background(), "c", pBread, "b", 1); err != nil {
		t.Fatal(err)
	}

	f.onHandByID[pMilk] = 0

	cart, err := svc.Get(context.Background(), "c")
	if err != nil {
		t.Fatal(err)
	}
	if got := cart.ItemSubtotalAmount; got != "5.00" {
		t.Errorf("the out-of-stock line must not be payable: got %q, want 5.00", got)
	}
	if noticeKinds(cart)[NoticeUnavailable] != pMilk {
		t.Fatalf("want an unavailable notice for milk: %+v", cart.Notices)
	}
	// ⚠ FR-014: "out of stock" and "no longer sold" ask DIFFERENT things of a shopper — wait, versus
	// give up. This is the surface where they are about to pay, so collapsing them here would undo
	// the distinction the saved list is built around. SC-010 tests the wording with five observers.
	for _, n := range cart.Notices {
		if n.ProductID == pMilk && n.Kind == NoticeUnavailable {
			if !contains(n.Detail, "out of stock") {
				t.Errorf("the cause must be in the notice: got %q", n.Detail)
			}
		}
	}
}

func TestRead_AnArchivedLineSaysNoLongerSoldNotOutOfStock(t *testing.T) {
	f, svc := newFixture(t)
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 1); err != nil {
		t.Fatal(err)
	}
	f.statuses[pMilk] = "archived"

	cart, err := svc.Get(context.Background(), "c")
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range cart.Notices {
		if n.Kind == NoticeUnavailable && contains(n.Detail, "out of stock") {
			t.Errorf("a withdrawn product must not be described as out of stock: %q", n.Detail)
		}
	}
}

// A cart in which nothing can be supplied must not be able to reach payment (FR-019).
func TestCheckout_IsBlockedWhenEveryLineIsOutOfStock(t *testing.T) {
	f, svc := newFixture(t)
	trackedProduct(f, pMilk, "Milk", "2.00", 3)
	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 2); err != nil {
		t.Fatal(err)
	}
	f.onHandByID[pMilk] = 0

	cart, err := svc.Get(context.Background(), "c")
	if err != nil {
		t.Fatal(err)
	}
	if cart.Checkout.Allowed {
		t.Fatal("a cart with nothing payable must not offer checkout")
	}
	if cart.Checkout.BlockedReason != BlockedNoPayableItems {
		t.Errorf("the shopper must be told why: got %q", cart.Checkout.BlockedReason)
	}
}

// A refused add must not be metered as a stock block on a product that was simply missing.
func TestMetrics_AreCountedOnlyForARealStockRefusal(t *testing.T) {
	f, svc := newFixture(t)
	m := &countingMetrics{}
	svc.WithStockMetrics(m)
	trackedProduct(f, pMilk, "Milk", "2.00", 1)

	if _, err := svc.Add(context.Background(), "c", pMilk, "a", 5); err == nil {
		t.Fatal("want a refusal")
	}
	if m.blocked["add"] != 1 {
		t.Errorf("a stock refusal must be metered once: %+v", m.blocked)
	}

	_, _ = svc.Add(context.Background(), "c", "not-a-uuid", "b", 1)
	if m.blocked["add"] != 1 {
		t.Errorf("a malformed id is not a stock block: %+v", m.blocked)
	}
}

type countingMetrics struct{ blocked map[string]int }

func (c *countingMetrics) StockBlocked(stage string) {
	if c.blocked == nil {
		c.blocked = map[string]int{}
	}
	c.blocked[stage]++
}

func contains(haystack, needle string) bool { return strings.Contains(haystack, needle) }
