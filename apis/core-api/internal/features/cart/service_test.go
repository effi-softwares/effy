package cart

import (
	"context"
	"slices"
	"sort"
	"testing"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
)

// fakeRepo is a hand-rolled in-memory cart repository (the Repo seam). It models the SQL's behaviour
// closely enough to be worth trusting: absolute set-quantity, union-with-MAXIMUM merge, the change-id
// dedupe, the revision bump, and the two separate item tables.
type fakeRepo struct {
	cartID       string
	revision     int64
	items        map[string]int    // productID → qty (payable)
	saved        map[string]int    // productID → qty (set aside)
	addPrice     map[string]string // productID → the price recorded at add time ("" = none recorded)
	statuses     map[string]string // productID → status ("" = missing)
	priceByID    map[string]string // productID → current unit price
	nameByID     map[string]string // productID → name
	changes      map[string]bool   // applied change ids
	orders       map[string][]ReorderCandidate
	promos       []PromoCode
	usage        map[string]PromoUsage
	appliedPromo string
	addedSeq     []string // insertion order, so Lines() is deterministic like `ORDER BY added_at`
	writes       int      // how many mutations actually reached the "database"
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		cartID:    "cart-1",
		items:     map[string]int{},
		saved:     map[string]int{},
		addPrice:  map[string]string{},
		statuses:  map[string]string{},
		priceByID: map[string]string{},
		nameByID:  map[string]string{},
		changes:   map[string]bool{},
		orders:    map[string][]ReorderCandidate{},
		usage:     map[string]PromoUsage{},
	}
}

// Valid uuids for the tests.
const (
	pMilk  = "11111111-1111-1111-1111-111111111111"
	pBread = "22222222-2222-2222-2222-222222222222"
	pGone  = "33333333-3333-3333-3333-333333333333"
	pEggs  = "44444444-4444-4444-4444-444444444444"
	// A past order, for the reorder tests. A real uuid because the service validates the shape before it
	// touches the database — a malformed id is a 404, not a lookup.
	orderOne = "55555555-5555-5555-5555-555555555555"
)

func (f *fakeRepo) GetOrCreateCartID(_ context.Context, _ string) (string, error) {
	return f.cartID, nil
}

func (f *fakeRepo) Meta(_ context.Context, _ string) (CartMeta, error) {
	return CartMeta{Revision: f.revision, PromoCodeID: f.appliedPromo}, nil
}

func (f *fakeRepo) Lines(_ context.Context, _ string) ([]cartLineRow, error) {
	return f.rowsFrom(f.items), nil
}

func (f *fakeRepo) SavedLines(_ context.Context, _ string) ([]cartLineRow, error) {
	return f.rowsFrom(f.saved), nil
}

func (f *fakeRepo) rowsFrom(src map[string]int) []cartLineRow {
	ids := make([]string, 0, len(src))
	for id := range src {
		ids = append(ids, id)
	}
	// Deterministic order: insertion order first (mirroring `ORDER BY added_at`), then anything else.
	sort.SliceStable(ids, func(i, j int) bool { return f.seq(ids[i]) < f.seq(ids[j]) })

	out := make([]cartLineRow, 0, len(ids))
	for _, id := range ids {
		row := cartLineRow{
			ID: "line-" + id, ProductID: id, Quantity: src[id],
			Name: f.nameByID[id], UnitPriceAmount: f.priceByID[id], Currency: "AUD",
			Status: f.statuses[id],
		}
		if p := f.addPrice[id]; p != "" {
			row.UnitPriceAtAdd = &p
		}
		out = append(out, row)
	}
	return out
}

func (f *fakeRepo) seq(id string) int {
	for i, s := range f.addedSeq {
		if s == id {
			return i
		}
	}
	return len(f.addedSeq)
}

func (f *fakeRepo) AllLines(_ context.Context, _ string) ([]cartLineRow, []cartLineRow, int64, error) {
	return f.rowsFrom(f.items), f.rowsFrom(f.saved), f.revision, nil
}

func (f *fakeRepo) CountDistinct(_ context.Context, _ string) (int, error) { return len(f.items), nil }

func (f *fakeRepo) ProductStatus(_ context.Context, productID string) (string, string, bool, error) {
	s, ok := f.statuses[productID]
	return s, f.priceByID[productID], ok, nil
}

func (f *fakeRepo) ProductSnapshots(_ context.Context, productIDs []string) ([]cartLineRow, error) {
	out := make([]cartLineRow, 0, len(productIDs))
	for _, id := range productIDs {
		if _, ok := f.statuses[id]; !ok {
			continue // absent, exactly like the SQL: unresolved ids simply do not come back
		}
		out = append(out, cartLineRow{
			ProductID: id, Name: f.nameByID[id], UnitPriceAmount: f.priceByID[id],
			Currency: "AUD", Status: f.statuses[id],
		})
	}
	return out, nil
}

func (f *fakeRepo) OrderItemsForReorder(_ context.Context, _, orderID string) ([]ReorderCandidate, bool, error) {
	items, ok := f.orders[orderID]
	return items, ok && len(items) > 0, nil
}

// guard models markChangeApplied: a repeat change id means the mutation never happens.
func (f *fakeRepo) guard(changeID string) bool {
	if changeID == "" {
		return true
	}
	if f.changes[changeID] {
		return false
	}
	f.changes[changeID] = true
	return true
}

func (f *fakeRepo) mutate(changeID string, fn func()) (bool, error) {
	if !f.guard(changeID) {
		return false, nil
	}
	fn()
	f.revision++
	f.writes++
	return true, nil
}

func (f *fakeRepo) note(productID string) {
	if slices.Contains(f.addedSeq, productID) {
		return
	}
	f.addedSeq = append(f.addedSeq, productID)
}

func (f *fakeRepo) AddItem(_ context.Context, _, productID, changeID string, qty, max int) (bool, error) {
	return f.mutate(changeID, func() {
		if _, exists := f.items[productID]; !exists {
			f.addPrice[productID] = f.priceByID[productID] // recorded on insert only
		}
		f.note(productID)
		f.items[productID] = min(f.items[productID]+qty, max)
	})
}

func (f *fakeRepo) SetQty(_ context.Context, _, productID, changeID string, qty int) (bool, error) {
	return f.mutate(changeID, func() {
		if _, exists := f.items[productID]; exists {
			f.items[productID] = qty
		}
	})
}

func (f *fakeRepo) RemoveItem(_ context.Context, _, productID, changeID string) (bool, error) {
	return f.mutate(changeID, func() { delete(f.items, productID) })
}

func (f *fakeRepo) DeleteAllItems(_ context.Context, _, changeID string) (bool, error) {
	return f.mutate(changeID, func() { f.items = map[string]int{} })
}

func (f *fakeRepo) DeleteLines(_ context.Context, _ string, productIDs []string) error {
	for _, id := range productIDs {
		delete(f.items, id)
	}
	f.revision++
	return nil
}

// MergeItems mirrors the SQL: union with MAXIMUM quantity, clamped; nothing is ever deleted.
func (f *fakeRepo) MergeItems(_ context.Context, _, changeID string, productIDs []string, quantities []int32, max int) (bool, error) {
	return f.mutate(changeID, func() {
		for i, id := range productIDs {
			f.note(id)
			if _, exists := f.items[id]; !exists {
				f.addPrice[id] = f.priceByID[id]
			}
			f.items[id] = min(max, maxInt(f.items[id], int(quantities[i])))
		}
	})
}

// ── Promotions (US8) ────────────────────────────────────────────────────────────────────────────

func (f *fakeRepo) PromoByCode(_ context.Context, code string) (PromoCode, bool, error) {
	for _, p := range f.promos {
		if NormalisePromoCode(p.Code) == code {
			return p, true, nil
		}
	}
	return PromoCode{}, false, nil
}

func (f *fakeRepo) PromoByID(_ context.Context, id string) (PromoCode, bool, error) {
	for _, p := range f.promos {
		if p.ID == id {
			return p, true, nil
		}
	}
	return PromoCode{}, false, nil
}

func (f *fakeRepo) PromoUsageFor(_ context.Context, promoCodeID, _ string) (PromoUsage, error) {
	return f.usage[promoCodeID], nil
}

func (f *fakeRepo) SetCartPromo(_ context.Context, _ string, promoCodeID *string, changeID string) (bool, error) {
	return f.mutate(changeID, func() {
		if promoCodeID == nil {
			f.appliedPromo = ""
		} else {
			f.appliedPromo = *promoCodeID
		}
	})
}

func (f *fakeRepo) SetAside(_ context.Context, _, productID, changeID string) (bool, error) {
	return f.mutate(changeID, func() {
		qty, ok := f.items[productID]
		if !ok {
			return
		}
		f.saved[productID] = maxInt(f.saved[productID], qty)
		delete(f.items, productID)
	})
}

func (f *fakeRepo) RestoreSaved(_ context.Context, _, productID, changeID string, max int) (bool, error) {
	return f.mutate(changeID, func() {
		qty, ok := f.saved[productID]
		if !ok {
			return
		}
		f.note(productID)
		f.items[productID] = min(max, maxInt(f.items[productID], qty))
		f.addPrice[productID] = f.priceByID[productID] // restored AT THE CURRENT PRICE (FR-029)
		delete(f.saved, productID)
	})
}

func (f *fakeRepo) DeleteSaved(_ context.Context, _, productID, changeID string) (bool, error) {
	return f.mutate(changeID, func() { delete(f.saved, productID) })
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type noPresign struct{}

func (noPresign) PresignGet(_ context.Context, _ string) (string, error) { return "", nil }

// fakePolicy lets a test set the ceilings and the minimum without a database.
type fakePolicy struct{ p cartpolicy.Policy }

func (f fakePolicy) Policy(_ context.Context) (cartpolicy.Policy, error) { return f.p, nil }

func defaultPolicy() fakePolicy { return fakePolicy{cartpolicy.Default()} }

func seedProduct(f *fakeRepo, id, name, price, status string) {
	f.statuses[id] = status
	f.priceByID[id] = price
	f.nameByID[id] = name
}

func newSvc(f *fakeRepo, p fakePolicy) *Service { return NewService(f, noPresign{}, p) }

func noticeKinds(cart Cart) map[NoticeKind]string {
	out := map[NoticeKind]string{}
	for _, n := range cart.Notices {
		out[n.Kind] = n.ProductID
	}
	return out
}

// ── Totals and the anonymous package key (019/021, unchanged behaviour) ──────────────────────────

func TestAddComputesItemTotalsNoCartDeliveryFee(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())

	cart, err := svc.Add(context.Background(), "cust-1", pMilk, "chg-1", 2)
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if cart.ItemSubtotalAmount != "10.00" {
		t.Errorf("item subtotal = %q, want 10.00", cart.ItemSubtotalAmount)
	}
	if cart.GrandTotalAmount != "10.00" {
		t.Errorf("grand total = %q, want 10.00", cart.GrandTotalAmount)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].PackageKey == "" {
		t.Fatalf("line must carry a packageKey, got %+v", cart.Lines)
	}
	if len(cart.Lines[0].PackageKey) < 4 || cart.Lines[0].PackageKey[:4] != "pkg_" {
		t.Errorf("packageKey should be an opaque pkg_ token, got %q", cart.Lines[0].PackageKey)
	}
	if cart.Revision == 0 {
		t.Error("a mutation must advance the revision — a change the client cannot detect gets overwritten")
	}
	if cart.Limits.MaxLineQuantity != 99 || cart.Limits.MaxDistinctItems != 100 {
		t.Errorf("limits must reach the client so they can be explained, got %+v", cart.Limits)
	}
}

func TestAddIncrementsAndClampsWithANotice(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "1.00", "active")
	svc := newSvc(f, defaultPolicy())

	_, _ = svc.Add(context.Background(), "c", pMilk, "chg-1", 50)
	cart, _ := svc.Add(context.Background(), "c", pMilk, "chg-2", 60) // 110 → clamp 99
	if cart.Lines[0].Quantity != 99 {
		t.Errorf("quantity = %d, want 99 (clamped)", cart.Lines[0].Quantity)
	}
	// A clamp is not a failure — the shopper gets a cart AND is told (FR-037).
	if got := noticeKinds(cart)[NoticeQuantityClamped]; got != pMilk {
		t.Errorf("want a quantity_clamped notice for milk, got notices %+v", cart.Notices)
	}
}

func TestAddUnavailableAndMissingAreRejected(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pBread, "Bread", "3.00", "unavailable")
	svc := newSvc(f, defaultPolicy())

	if _, err := svc.Add(context.Background(), "c", pBread, "a", 1); err != ErrProductUnavailable {
		t.Errorf("want ErrProductUnavailable, got %v", err)
	}
	if _, err := svc.Add(context.Background(), "c", pGone, "b", 1); err != ErrProductNotFound {
		t.Errorf("want ErrProductNotFound, got %v", err)
	}
	if _, err := svc.Add(context.Background(), "c", "not-a-uuid", "c", 1); err != ErrProductNotFound {
		t.Errorf("want ErrProductNotFound for bad uuid, got %v", err)
	}
}

// ── Exactly-once (FR-018) ───────────────────────────────────────────────────────────────────────

// The whole point of the change id: a retry after an ambiguous failure must not add the item twice.
func TestReplayedChangeIDIsANoOpAndReturnsTheCurrentCart(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	svc := newSvc(f, defaultPolicy())

	first, err := svc.Add(context.Background(), "c", pMilk, "same-change", 1)
	if err != nil {
		t.Fatalf("Add #1: %v", err)
	}
	writesAfterFirst := f.writes

	second, err := svc.Add(context.Background(), "c", pMilk, "same-change", 1)
	if err != nil {
		t.Fatalf("Add #2 (replay): %v", err)
	}
	if f.writes != writesAfterFirst {
		t.Errorf("a replayed change id must not write again: writes %d → %d", writesAfterFirst, f.writes)
	}
	if second.Lines[0].Quantity != 1 {
		t.Errorf("quantity after replay = %d, want 1 (not 2)", second.Lines[0].Quantity)
	}
	if second.Revision != first.Revision {
		t.Errorf("a replay must not advance the revision: %d → %d", first.Revision, second.Revision)
	}
	// And no spurious clamp notice, because nothing happened.
	if _, ok := noticeKinds(second)[NoticeQuantityClamped]; ok {
		t.Error("a replay must report nothing new")
	}
}

// ── Absolute quantities (R1/R4) ─────────────────────────────────────────────────────────────────

// SetQty is ABSOLUTE, which is what lets the client debounce ten taps into one request.
func TestSetQtyIsAbsoluteAndIdempotent(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "add", 1)

	for i := range 3 {
		cart, err := svc.SetQty(context.Background(), "c", pMilk, "", 7)
		if err != nil {
			t.Fatalf("SetQty: %v", err)
		}
		if cart.Lines[0].Quantity != 7 {
			t.Fatalf("run %d: quantity = %d, want 7 every time", i, cart.Lines[0].Quantity)
		}
	}
}

func TestSetQtyZeroRemovesLine(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "add", 3)

	cart, err := svc.SetQty(context.Background(), "c", pMilk, "", 0)
	if err != nil {
		t.Fatalf("SetQty: %v", err)
	}
	if len(cart.Lines) != 0 {
		t.Errorf("want empty cart after qty 0, got %d lines", len(cart.Lines))
	}
	if cart.GrandTotalAmount != "0.00" {
		t.Errorf("empty cart total = %q, want 0.00", cart.GrandTotalAmount)
	}
	if cart.Checkout.Allowed || cart.Checkout.BlockedReason != BlockedEmpty {
		t.Errorf("an empty cart must not offer checkout, got %+v", cart.Checkout)
	}
}

func TestSetQtyClampsWithANotice(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "1.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "add", 1)

	cart, _ := svc.SetQty(context.Background(), "c", pMilk, "", 500)
	if cart.Lines[0].Quantity != 99 {
		t.Errorf("quantity = %d, want 99", cart.Lines[0].Quantity)
	}
	if got := noticeKinds(cart)[NoticeQuantityClamped]; got != pMilk {
		t.Errorf("want a quantity_clamped notice, got %+v", cart.Notices)
	}
}

// ── Merge: union with MAXIMUM (FR-011/FR-012) ───────────────────────────────────────────────────

// The behaviour 019's additive merge got wrong, and 019's replace could not do at all.
func TestMergeIsUnionWithMaximumAndLosesNothing(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	seedProduct(f, pEggs, "Eggs", "4.00", "active")
	svc := newSvc(f, defaultPolicy())

	// The account cart already holds B×3 and C×1.
	_, _ = svc.Add(context.Background(), "c", pBread, "seed-b", 3)
	_, _ = svc.Add(context.Background(), "c", pEggs, "seed-c", 1)

	// The device cart holds A×1 and B×2.
	cart, err := svc.Merge(context.Background(), "c", "merge-1", []LineInput{
		{ProductID: pMilk, Quantity: 1},
		{ProductID: pBread, Quantity: 2},
	})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}

	got := map[string]int{}
	for _, l := range cart.Lines {
		got[l.ProductID] = l.Quantity
	}
	want := map[string]int{pMilk: 1, pBread: 3, pEggs: 1} // B is 3 (the GREATER), not 5 (the sum)
	if len(got) != len(want) {
		t.Fatalf("merged cart has %d lines, want %d: %+v", len(got), len(want), got)
	}
	for id, q := range want {
		if got[id] != q {
			t.Errorf("product %s quantity = %d, want %d", id, got[id], q)
		}
	}
}

func TestMergeIsIdempotentAcrossRepeatedSignIns(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	svc := newSvc(f, defaultPolicy())
	in := []LineInput{{ProductID: pMilk, Quantity: 2}}

	// Five sign-ins, each with a DIFFERENT change id — so the idempotence being tested is the
	// operation's own (union-with-max), not the dedupe guard's.
	for i, chg := range []string{"m1", "m2", "m3", "m4", "m5"} {
		cart, err := svc.Merge(context.Background(), "c", chg, in)
		if err != nil {
			t.Fatalf("Merge %d: %v", i, err)
		}
		if len(cart.Lines) != 1 || cart.Lines[0].Quantity != 2 {
			t.Fatalf("after merge %d: %+v, want exactly one line qty 2 (no accumulation)", i+1, cart.Lines)
		}
	}
}

// ⚠ The property whose absence caused the 2026-07-23 bug family, and the one that makes a stale device
// harmless: merging NEVER deletes a line the client did not mention.
func TestMergeNeverDeletesLinesTheClientDidNotSend(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pBread, "seed", 1) // built on another device

	cart, err := svc.Merge(context.Background(), "c", "m", []LineInput{{ProductID: pMilk, Quantity: 1}})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if len(cart.Lines) != 2 {
		t.Fatalf("merge must be additive-by-union, got %+v — a stale device must not clobber", cart.Lines)
	}
}

func TestMergeOfNothingLeavesTheAccountCartAlone(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "seed", 4)

	cart, err := svc.Merge(context.Background(), "c", "m", nil)
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].Quantity != 4 {
		t.Errorf("an empty guest cart must not empty the account cart, got %+v", cart.Lines)
	}
}

// An unavailable product still merges, and arrives FLAGGED — not silently dropped (US3 scenario 4).
func TestMergeKeepsAnUnavailableProductFlagged(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pBread, "Bread", "3.00", "unavailable")
	svc := newSvc(f, defaultPolicy())

	cart, err := svc.Merge(context.Background(), "c", "m", []LineInput{{ProductID: pBread, Quantity: 1}})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].Available {
		t.Fatalf("the line must survive the merge, flagged unavailable: %+v", cart.Lines)
	}
	if got := noticeKinds(cart)[NoticeUnavailable]; got != pBread {
		t.Errorf("want an unavailable notice, got %+v", cart.Notices)
	}
}

func TestMergeSkipsArchivedAndMissingProducts(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "2.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "archived")
	svc := newSvc(f, defaultPolicy())

	cart, err := svc.Merge(context.Background(), "c", "m", []LineInput{
		{ProductID: pMilk, Quantity: 1},
		{ProductID: pBread, Quantity: 1}, // archived — terminal, never coming back
		{ProductID: pGone, Quantity: 1},  // no such product
	})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].ProductID != pMilk {
		t.Errorf("merged cart = %+v, want only milk", cart.Lines)
	}
}

// ── Availability and price honesty (US5) ────────────────────────────────────────────────────────

func TestUnavailableLineExcludedFromPayableAndFlagged(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.Add(context.Background(), "c", pBread, "b", 1)

	f.statuses[pBread] = "unavailable" // goes away after being added
	cart, _ := svc.Get(context.Background(), "c")

	if cart.ItemSubtotalAmount != "5.00" {
		t.Errorf("subtotal must exclude the unavailable line: got %q, want 5.00", cart.ItemSubtotalAmount)
	}
	if got := noticeKinds(cart)[NoticeUnavailable]; got != pBread {
		t.Errorf("want one unavailable notice for bread, got %+v", cart.Notices)
	}
	if len(cart.Lines) != 2 {
		t.Errorf("the line stays in the cart, flagged — a temporary state may be waited out: %+v", cart.Lines)
	}
}

func TestAllUnavailableCartOffersNoCheckout(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)

	f.statuses[pMilk] = "unavailable"
	cart, _ := svc.Get(context.Background(), "c")

	if cart.Checkout.Allowed || cart.Checkout.BlockedReason != BlockedNoPayableItems {
		t.Errorf("want checkout blocked as no_payable_items, got %+v", cart.Checkout)
	}
}

// An `archived` product is terminal, so its line is SWEPT rather than left as clutter (research R11).
func TestArchivedProductLineIsRemovedAndReported(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.Add(context.Background(), "c", pBread, "b", 1)

	f.statuses[pBread] = "archived"
	cart, _ := svc.Get(context.Background(), "c")

	if len(cart.Lines) != 1 || cart.Lines[0].ProductID != pMilk {
		t.Fatalf("the archived line must be gone, got %+v", cart.Lines)
	}
	if got := noticeKinds(cart)[NoticeRemoved]; got != pBread {
		t.Errorf("want a `removed` notice for the archived product, got %+v", cart.Notices)
	}
	if _, still := f.items[pBread]; still {
		t.Error("the archived line must actually be deleted, not merely hidden")
	}
}

// A price change is reported WITH the old price — in both directions (FR-023/FR-024).
func TestPriceChangeIsReportedWithThePreviousAmount(t *testing.T) {
	for _, tc := range []struct{ name, newPrice, wantSubtotal string }{
		{"a rise", "7.50", "7.50"},
		{"a fall", "2.50", "2.50"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFakeRepo()
			seedProduct(f, pMilk, "Milk", "5.00", "active")
			svc := newSvc(f, defaultPolicy())
			_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)

			f.priceByID[pMilk] = tc.newPrice // the catalogue moves
			cart, _ := svc.Get(context.Background(), "c")

			if cart.Lines[0].PriceChangedFrom != "5.00" {
				t.Errorf("priceChangedFrom = %q, want 5.00", cart.Lines[0].PriceChangedFrom)
			}
			if cart.Lines[0].UnitPriceAmount != tc.newPrice {
				t.Errorf("the shopper pays the CURRENT price: got %q, want %q", cart.Lines[0].UnitPriceAmount, tc.newPrice)
			}
			if cart.ItemSubtotalAmount != tc.wantSubtotal {
				t.Errorf("subtotal = %q, want %q", cart.ItemSubtotalAmount, tc.wantSubtotal)
			}
			if got := noticeKinds(cart)[NoticePriceChanged]; got != pMilk {
				t.Errorf("want a price_changed notice, got %+v", cart.Notices)
			}
		})
	}
}

// A line with no recorded add-time price (one predating 027) must NOT fabricate a change.
func TestNoAddTimePriceReportsNoChange(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	f.items[pMilk] = 1
	f.note(pMilk)
	// addPrice deliberately unset — a pre-027 row.
	svc := newSvc(f, defaultPolicy())

	cart, _ := svc.Get(context.Background(), "c")
	if cart.Lines[0].PriceChangedFrom != "" {
		t.Errorf("a NULL add-time price must report no change, got %q", cart.Lines[0].PriceChangedFrom)
	}
	if _, ok := noticeKinds(cart)[NoticePriceChanged]; ok {
		t.Error("no price_changed notice may be invented from an unknown add price")
	}
}

// ── The distinct-item ceiling (FR-038) ──────────────────────────────────────────────────────────

func TestAddBeyondTheDistinctCeilingIsRefusedAndChangesNothing(t *testing.T) {
	p := cartpolicy.Default()
	p.MaxDistinctItems = 2
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "1.00", "active")
	seedProduct(f, pBread, "Bread", "1.00", "active")
	seedProduct(f, pEggs, "Eggs", "1.00", "active")
	svc := newSvc(f, fakePolicy{p})

	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.Add(context.Background(), "c", pBread, "b", 1)

	if _, err := svc.Add(context.Background(), "c", pEggs, "c", 1); err != ErrCartFull {
		t.Fatalf("want ErrCartFull, got %v", err)
	}
	if len(f.items) != 2 {
		t.Errorf("a refused add must leave the cart untouched, got %d items", len(f.items))
	}
}

// Being full must not stop a shopper adjusting what they already chose.
func TestIncrementingAnExistingLineIsAllowedWhenFull(t *testing.T) {
	p := cartpolicy.Default()
	p.MaxDistinctItems = 1
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "1.00", "active")
	svc := newSvc(f, fakePolicy{p})

	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	cart, err := svc.Add(context.Background(), "c", pMilk, "b", 1)
	if err != nil {
		t.Fatalf("incrementing an existing line in a full cart must be allowed: %v", err)
	}
	if cart.Lines[0].Quantity != 2 {
		t.Errorf("quantity = %d, want 2", cart.Lines[0].Quantity)
	}
}

// ── Set aside and clear (US6) ───────────────────────────────────────────────────────────────────

func TestSetAsideRemovesFromTotalsAndKeepsTheItem(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.Add(context.Background(), "c", pBread, "b", 1)

	cart, err := svc.SetAside(context.Background(), "c", pBread, "s")
	if err != nil {
		t.Fatalf("SetAside: %v", err)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].ProductID != pMilk {
		t.Errorf("payable lines = %+v, want only milk", cart.Lines)
	}
	if len(cart.SavedLines) != 1 || cart.SavedLines[0].ProductID != pBread {
		t.Errorf("saved lines = %+v, want bread", cart.SavedLines)
	}
	if cart.ItemSubtotalAmount != "5.00" {
		t.Errorf("subtotal = %q, want 5.00 — a set-aside item contributes to nothing", cart.ItemSubtotalAmount)
	}
	if _, both := f.items[pBread]; both {
		t.Error("a product must never be in both tables")
	}
}

func TestRestoreSavedPricesAtTheCurrentPrice(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 2)
	_, _ = svc.SetAside(context.Background(), "c", pMilk, "s")

	f.priceByID[pMilk] = "6.00" // the price moves while it is set aside

	cart, err := svc.RestoreSaved(context.Background(), "c", pMilk, "r")
	if err != nil {
		t.Fatalf("RestoreSaved: %v", err)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].Quantity != 2 {
		t.Fatalf("restored line = %+v, want qty 2", cart.Lines)
	}
	if cart.Lines[0].UnitPriceAmount != "6.00" {
		t.Errorf("unit price = %q, want 6.00 (current)", cart.Lines[0].UnitPriceAmount)
	}
	// Restoring is a fresh decision at today's price — no stale "it changed" note about it.
	if cart.Lines[0].PriceChangedFrom != "" {
		t.Errorf("a restore must not report a price change, got %q", cart.Lines[0].PriceChangedFrom)
	}
	if len(cart.SavedLines) != 0 {
		t.Errorf("the saved list must be empty after a restore, got %+v", cart.SavedLines)
	}
}

func TestRestoringAnUnavailableItemIsRefused(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.SetAside(context.Background(), "c", pMilk, "s")

	f.statuses[pMilk] = "unavailable"
	if _, err := svc.RestoreSaved(context.Background(), "c", pMilk, "r"); err != ErrProductUnavailable {
		t.Errorf("want ErrProductUnavailable, got %v", err)
	}
	if _, moved := f.items[pMilk]; moved {
		t.Error("a refused restore must not move the item")
	}
}

// ⚠ The property a `saved` boolean column would have put one forgotten WHERE clause away.
func TestClearEmptiesThePayableCartAndLeavesSavedItems(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.Add(context.Background(), "c", pBread, "b", 1)
	_, _ = svc.SetAside(context.Background(), "c", pBread, "s")

	cart, err := svc.Clear(context.Background(), "c", "clr")
	if err != nil {
		t.Fatalf("Clear: %v", err)
	}
	if len(cart.Lines) != 0 {
		t.Errorf("want an empty payable cart, got %+v", cart.Lines)
	}
	if len(cart.SavedLines) != 1 || cart.SavedLines[0].ProductID != pBread {
		t.Errorf("clearing the cart must NOT touch set-aside items, got %+v", cart.SavedLines)
	}
}

func TestDeleteSavedDiscardsIt(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.SetAside(context.Background(), "c", pMilk, "s")

	cart, err := svc.DeleteSaved(context.Background(), "c", pMilk, "d")
	if err != nil {
		t.Fatalf("DeleteSaved: %v", err)
	}
	if len(cart.SavedLines) != 0 {
		t.Errorf("want no saved lines, got %+v", cart.SavedLines)
	}
}

// ── Preview: the guest path (research R10) ──────────────────────────────────────────────────────

func TestPreviewRePricesAndWritesNothing(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "unavailable")
	svc := newSvc(f, defaultPolicy())

	cart, err := svc.Preview(context.Background(), []LineInput{
		{ProductID: pMilk, Quantity: 2},
		{ProductID: pBread, Quantity: 1},
		{ProductID: pGone, Quantity: 1},
	})
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if f.writes != 0 {
		t.Fatalf("preview must write NOTHING, saw %d writes", f.writes)
	}
	if cart.ItemSubtotalAmount != "10.00" {
		t.Errorf("subtotal = %q, want 10.00 (the unavailable line excluded)", cart.ItemSubtotalAmount)
	}
	if len(cart.Lines) != 2 {
		t.Errorf("want 2 resolvable lines, got %+v", cart.Lines)
	}
	kinds := noticeKinds(cart)
	if kinds[NoticeRemoved] != pGone {
		t.Errorf("an unresolvable product must be reported as removed, got %+v", cart.Notices)
	}
	if kinds[NoticeUnavailable] != pBread {
		t.Errorf("want an unavailable notice for bread, got %+v", cart.Notices)
	}
}

func TestPreviewDedupesAndClamps(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "1.00", "active")
	svc := newSvc(f, defaultPolicy())

	cart, err := svc.Preview(context.Background(), []LineInput{
		{ProductID: pMilk, Quantity: 60},
		{ProductID: pMilk, Quantity: 60}, // 120 → dedupe to one line, clamp to 99
	})
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if len(cart.Lines) != 1 || cart.Lines[0].Quantity != 99 {
		t.Errorf("want one line clamped to 99, got %+v", cart.Lines)
	}
}

// ── The checkout gate ───────────────────────────────────────────────────────────────────────────

func TestNoMinimumMeansNoMinimumIsShown(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	svc := newSvc(f, defaultPolicy())

	cart, _ := svc.Add(context.Background(), "c", pMilk, "a", 1)
	if !cart.Checkout.Allowed {
		t.Errorf("checkout must be allowed, got %+v", cart.Checkout)
	}
	if cart.Checkout.MinimumSubtotalAmount != "" || cart.Checkout.RemainingAmount != "" {
		t.Errorf("with no minimum in force nothing may be shown, got %+v", cart.Checkout)
	}
}

// ── Reorder (US7) ───────────────────────────────────────────────────────────────────────────────

func seedOrder(f *fakeRepo, orderID string, items ...ReorderCandidate) {
	f.orders[orderID] = items
}

func candidate(productID, name string, qty int, status string) ReorderCandidate {
	c := ReorderCandidate{ProductID: productID, Quantity: qty, Name: name}
	if status != "" {
		c.Status = &status
	}
	return c
}

func TestReorderAddsWhatIsAvailableAndReportsWhatIsNot(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "unavailable")
	seedProduct(f, pEggs, "Eggs", "4.00", "archived")
	seedOrder(f, orderOne,
		candidate(pMilk, "Milk", 2, "active"),
		candidate(pBread, "Bread", 1, "unavailable"),
		candidate(pEggs, "Eggs", 1, "archived"),
	)
	svc := newSvc(f, defaultPolicy())

	res, err := svc.Reorder(context.Background(), "c", orderOne, "chg-1")
	if err != nil {
		t.Fatalf("Reorder: %v", err)
	}

	if len(res.Cart.Lines) != 1 || res.Cart.Lines[0].ProductID != pMilk {
		t.Fatalf("cart = %+v, want only milk", res.Cart.Lines)
	}
	if len(res.Skipped) != 2 {
		t.Fatalf("skipped = %+v, want 2 reported", res.Skipped)
	}
	reasons := map[string]SkipReason{}
	for _, s := range res.Skipped {
		reasons[s.ProductID] = s.Reason
	}
	if reasons[pBread] != SkipUnavailable {
		t.Errorf("bread reason = %q, want unavailable", reasons[pBread])
	}
	if reasons[pEggs] != SkipRemoved {
		t.Errorf("an archived product is gone for good, want removed, got %q", reasons[pEggs])
	}
}

// SC-011: a double tap must not double quantities. Union-with-max is what guarantees it.
func TestReorderTwiceDoesNotDoubleQuantities(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedOrder(f, orderOne, candidate(pMilk, "Milk", 3, "active"))
	svc := newSvc(f, defaultPolicy())

	_, _ = svc.Reorder(context.Background(), "c", orderOne, "chg-1")
	res, err := svc.Reorder(context.Background(), "c", orderOne, "chg-2")
	if err != nil {
		t.Fatalf("Reorder #2: %v", err)
	}
	if res.Cart.Lines[0].Quantity != 3 {
		t.Errorf("quantity = %d, want 3 — a repeat reorder must not accumulate", res.Cart.Lines[0].Quantity)
	}
}

func TestReorderRespectsTheDistinctCeilingAcrossTheBatch(t *testing.T) {
	p := defaultPolicy()
	p.p.MaxDistinctItems = 1
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "5.00", "active")
	seedProduct(f, pBread, "Bread", "3.00", "active")
	seedOrder(f, orderOne, candidate(pMilk, "Milk", 1, "active"), candidate(pBread, "Bread", 1, "active"))
	svc := newSvc(f, p)

	res, _ := svc.Reorder(context.Background(), "c", orderOne, "chg")

	if len(res.Cart.Lines) != 1 {
		t.Fatalf("cart = %+v, want one line", res.Cart.Lines)
	}
	if len(res.Skipped) != 1 || res.Skipped[0].Reason != SkipCartFull {
		t.Errorf("want the second reported as cart_full, got %+v", res.Skipped)
	}
}

func TestReorderOfAnUnknownOrderIs404NotAnEmptyCart(t *testing.T) {
	f := newFakeRepo()
	svc := newSvc(f, defaultPolicy())

	if _, err := svc.Reorder(context.Background(), "c", "11111111-1111-1111-1111-111111111199", "chg"); err != ErrOrderNotFound {
		t.Errorf("want ErrOrderNotFound, got %v", err)
	}
	// Another customer's order is indistinguishable from a missing one — existence is not disclosed.
	if _, err := svc.Reorder(context.Background(), "other", "not-a-uuid", "chg"); err != ErrOrderNotFound {
		t.Errorf("want ErrOrderNotFound for a bad id, got %v", err)
	}
}

func TestReorderOfAnEntirelyUnavailableOrderChangesNothing(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pBread, "Bread", "3.00", "unavailable")
	seedOrder(f, orderOne, candidate(pBread, "Bread", 1, "unavailable"))
	svc := newSvc(f, defaultPolicy())

	res, err := svc.Reorder(context.Background(), "c", orderOne, "chg")
	if err != nil {
		t.Fatalf("Reorder: %v", err)
	}
	if len(res.Cart.Lines) != 0 {
		t.Errorf("cart must be unchanged, got %+v", res.Cart.Lines)
	}
	if len(res.Skipped) != 1 {
		t.Errorf("and the shopper must be told nothing could be added, got %+v", res.Skipped)
	}
}

// ── The minimum order value (US9) ───────────────────────────────────────────────────────────────

func policyWithMinimum(cents int64) fakePolicy {
	p := cartpolicy.Default()
	p.MinimumSubtotalCents = cents
	return fakePolicy{p}
}

func TestBelowTheMinimumBlocksCheckoutAndSaysHowMuchMore(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "9.00", "active")
	svc := newSvc(f, policyWithMinimum(2500)) // $25.00

	cart, _ := svc.Add(context.Background(), "c", pMilk, "a", 2) // $18.00

	if cart.Checkout.Allowed {
		t.Fatal("checkout must be blocked below the minimum")
	}
	if cart.Checkout.BlockedReason != BlockedBelowMinimum {
		t.Errorf("reason = %q, want below_minimum", cart.Checkout.BlockedReason)
	}
	if cart.Checkout.MinimumSubtotalAmount != "25.00" {
		t.Errorf("minimum = %q, want 25.00", cart.Checkout.MinimumSubtotalAmount)
	}
	if cart.Checkout.RemainingAmount != "7.00" {
		t.Errorf("remaining = %q, want 7.00 — the shopper is told how much MORE, not just that it is short", cart.Checkout.RemainingAmount)
	}
}

func TestExactlyAtTheMinimumIsAllowed(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "25.00", "active")
	svc := newSvc(f, policyWithMinimum(2500))

	cart, _ := svc.Add(context.Background(), "c", pMilk, "a", 1)

	if !cart.Checkout.Allowed {
		t.Errorf("exactly at the minimum must be allowed, got %+v", cart.Checkout)
	}
}

// FR-055: only PAYABLE items count. An unavailable line must not carry a shopper over the line.
func TestUnavailableItemsDoNotCountTowardsTheMinimum(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "20.00", "active")
	seedProduct(f, pBread, "Bread", "10.00", "active")
	svc := newSvc(f, policyWithMinimum(2500))
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.Add(context.Background(), "c", pBread, "b", 1) // $30 total, over the minimum

	f.statuses[pBread] = "unavailable" // now only $20 is payable
	cart, _ := svc.Get(context.Background(), "c")

	if cart.Checkout.Allowed {
		t.Fatal("an unavailable line must not carry the cart over the minimum")
	}
	if cart.Checkout.RemainingAmount != "5.00" {
		t.Errorf("remaining = %q, want 5.00", cart.Checkout.RemainingAmount)
	}
}

// ── Promotional codes, end to end through the cart (US8) ────────────────────────────────────────

func seedPromo(f *fakeRepo, code PromoCode) { f.promos = append(f.promos, code) }

func TestApplyingAValidCodeDiscountsTheCart(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	seedPromo(f, PromoCode{ID: "promo-1", Code: "SPRING20", Kind: PromoPercentage, PercentOff: 20, Status: "active"})
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 5) // $50.00

	cart, err := svc.ApplyPromo(context.Background(), "c", "spring20", now)
	if err != nil {
		t.Fatalf("ApplyPromo: %v", err)
	}
	if cart.Discount == nil {
		t.Fatal("the discount must be shown as its own entry, not folded into the total (FR-045)")
	}
	if cart.DiscountAmount != "10.00" {
		t.Errorf("discount = %q, want 10.00", cart.DiscountAmount)
	}
	if cart.GrandTotalAmount != "40.00" {
		t.Errorf("grand total = %q, want 40.00", cart.GrandTotalAmount)
	}
	if cart.Discount.Label != "20% off" {
		t.Errorf("label = %q, want '20%% off'", cart.Discount.Label)
	}
}

// A shopper types what they type; the code is one code.
func TestCodesAreCaseInsensitive(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	seedPromo(f, PromoCode{ID: "promo-1", Code: "SPRING20", Kind: PromoPercentage, PercentOff: 10, Status: "active"})
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)

	if _, err := svc.ApplyPromo(context.Background(), "c", "  SpRiNg20 ", now); err != nil {
		t.Errorf("a code must apply however it is typed, got %v", err)
	}
}

func TestAnUnknownCodeIsRefused(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)

	if _, err := svc.ApplyPromo(context.Background(), "c", "NOPE", now); err != ErrPromoUnknown {
		t.Errorf("want ErrPromoUnknown, got %v", err)
	}
}

// ⚠ FR-047: a code that stops qualifying must stop discounting AND say so. Silently charging more than the
// total the shopper was last shown is the failure this prevents.
func TestACodeThatStopsQualifyingIsReportedAndStopsDiscounting(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	seedPromo(f, PromoCode{
		ID: "promo-1", Code: "TENOFF", Kind: PromoFixed, AmountOffCents: 1000,
		MinimumSubtotalCents: 5000, Status: "active",
	})
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 5) // $50.00 — qualifies

	applied, err := svc.ApplyPromo(context.Background(), "c", "TENOFF", now)
	if err != nil {
		t.Fatalf("ApplyPromo: %v", err)
	}
	if applied.DiscountAmount != "10.00" {
		t.Fatalf("discount = %q, want 10.00", applied.DiscountAmount)
	}

	// The shopper halves their basket — now below the code's minimum.
	after, err := svc.SetQty(context.Background(), "c", pMilk, "", 2) // $20.00
	if err != nil {
		t.Fatalf("SetQty: %v", err)
	}
	if after.DiscountAmount != "0.00" || after.Discount != nil {
		t.Errorf("the discount must stop, got %q / %+v", after.DiscountAmount, after.Discount)
	}
	if after.GrandTotalAmount != "20.00" {
		t.Errorf("grand total = %q, want 20.00", after.GrandTotalAmount)
	}
	if noticeKinds(after)[NoticePromoNoLongerApplies] != "" {
		// The notice is cart-level, so its productId is empty — presence is what matters.
		t.Logf("notice present: %+v", after.Notices)
	}
	var told bool
	for _, n := range after.Notices {
		if n.Kind == NoticePromoNoLongerApplies {
			told = true
		}
	}
	if !told {
		t.Errorf("the shopper must be TOLD the code stopped applying, got %+v", after.Notices)
	}
}

func TestRemovingACodeRestoresTheFullTotal(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	seedPromo(f, PromoCode{ID: "promo-1", Code: "SPRING20", Kind: PromoPercentage, PercentOff: 20, Status: "active"})
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 1)
	_, _ = svc.ApplyPromo(context.Background(), "c", "SPRING20", now)

	cart, err := svc.RemovePromo(context.Background(), "c")
	if err != nil {
		t.Fatalf("RemovePromo: %v", err)
	}
	if cart.Discount != nil || cart.DiscountAmount != "0.00" {
		t.Errorf("removing the code must clear the discount, got %+v", cart.Discount)
	}
	if cart.GrandTotalAmount != "10.00" {
		t.Errorf("grand total = %q, want 10.00", cart.GrandTotalAmount)
	}
}

// The amount that reaches payment is recomputed from the code — never carried from a cart response.
func TestDiscountForCustomerRecomputesAtPaymentTime(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	seedPromo(f, PromoCode{ID: "promo-1", Code: "SPRING20", Kind: PromoPercentage, PercentOff: 20, Status: "active"})
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 5)
	_, _ = svc.ApplyPromo(context.Background(), "c", "SPRING20", now)

	cents, id, code, err := svc.DiscountForCustomer(context.Background(), "c", 5000, now)
	if err != nil {
		t.Fatalf("DiscountForCustomer: %v", err)
	}
	if cents != 1000 || id != "promo-1" || code != "SPRING20" {
		t.Errorf("got %d / %q / %q, want 1000 / promo-1 / SPRING20", cents, id, code)
	}
}

// A code the shopper has since exhausted elsewhere must not still discount this order.
func TestAnExhaustedCodeDoesNotDiscountAtPaymentTime(t *testing.T) {
	f := newFakeRepo()
	seedProduct(f, pMilk, "Milk", "10.00", "active")
	one := 1
	seedPromo(f, PromoCode{
		ID: "promo-1", Code: "ONCE", Kind: PromoPercentage, PercentOff: 20,
		Status: "active", MaxPerCustomer: &one,
	})
	svc := newSvc(f, defaultPolicy())
	_, _ = svc.Add(context.Background(), "c", pMilk, "a", 5)
	_, _ = svc.ApplyPromo(context.Background(), "c", "ONCE", now)

	// They redeem it on another order in the meantime.
	f.usage["promo-1"] = PromoUsage{Total: 1, ByThisShopper: 1}

	cents, _, _, err := svc.DiscountForCustomer(context.Background(), "c", 5000, now)
	if err != nil {
		t.Fatalf("DiscountForCustomer: %v", err)
	}
	if cents != 0 {
		t.Errorf("discount = %d, want 0 — a spent code must not discount again", cents)
	}
}
