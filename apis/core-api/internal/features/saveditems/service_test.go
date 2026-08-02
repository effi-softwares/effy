package saveditems

import (
	"context"
	"errors"

	"github.com/effyshopping/effy/apis/core-api/internal/features/cart"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// ── Service tests: hand-rolled fakes over the Reader seam — no DB, no mocks ─────────────────────
//
// ⚠ These exist because the capability this replaces had ZERO automated tests on ANY surface,
// despite 019's task list claiming "+ tests" for them. SC-014 is the requirement; this file and its
// siblings are the evidence.
//
// What a fake CAN prove: classification, idempotency at the service boundary, cap plumbing, and the
// mapping the predecessor got wrong. What it CANNOT prove: that the SQL is correct — mocks cannot
// catch a syntax error, a wrong column, or a join that silently returns nothing. That is
// repository_test.go's job, and it is container-backed for exactly that reason.

type fakeRepo struct {
	membership []string
	rows       []listRow
	err        error

	// recorded calls
	savedProduct  string
	savedAt       *time.Time
	savedCap      int
	saveCalls     int
	removedProd   string
	removeCalls   int
	saveReturns   error
	removeReturns error
	mergeOrder    []string
	mergeCap      int
	mergeErr      error
}

func (f *fakeRepo) MembershipIDs(context.Context, string) ([]string, error) {
	return f.membership, f.err
}
func (f *fakeRepo) List(_ context.Context, _ string) ([]listRow, error) {
	if f.err != nil {
		return nil, f.err
	}
	// Mirror the SQL's own rule so the fake cannot disagree with the world: no destination zone means
	// every item reports "not yet determined".
	return f.rows, nil
}
func (f *fakeRepo) Save(_ context.Context, _, productID string, at *time.Time, cap int) error {
	f.saveCalls++
	f.savedProduct, f.savedAt, f.savedCap = productID, at, cap
	return f.saveReturns
}
func (f *fakeRepo) Remove(_ context.Context, _, productID string) error {
	f.removeCalls++
	f.removedProd = productID
	return f.removeReturns
}

// mergeOrder records the order the service handed items over in — the cap truncates in receive
// order, so the ordering is behaviour, not an implementation detail.
func (f *fakeRepo) Merge(_ context.Context, _ string, items []MergeItem, cap int) (int, []Skip, []string, error) {
	f.mergeOrder = nil
	for _, it := range items {
		f.mergeOrder = append(f.mergeOrder, it.ProductID)
	}
	f.mergeCap = cap
	return len(items), []Skip{}, f.membership, f.mergeErr
}

type fakeZones struct {
	zone   string
	found  bool
	err    error
	asked  string
	called int
}

func (f *fakeZones) ZoneForPostcode(_ context.Context, postcode string) (string, bool, error) {
	f.called++
	f.asked = postcode
	return f.zone, f.found, f.err
}

type fakePresign struct{ err error }

func (f fakePresign) PresignGet(_ context.Context, key string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	return "https://media.example/" + key, nil
}

const (
	cust     = "c0000000-0000-0000-0000-000000000001"
	prod     = "90000000-0000-0000-0000-000000000001"
	zoneMel  = "z0000000-0000-0000-0000-000000000001"
	postcode = "3121"
)

func svc(repo *fakeRepo, _ *fakeZones) *Service {
	return NewService(repo, fakePresign{})
}

// ── Saving and un-saving ────────────────────────────────────────────────────────────────────────

func TestSave_PassesTheAccountCapToTheRepository(t *testing.T) {
	repo := &fakeRepo{}
	err := svc(repo, &fakeZones{}).Save(context.Background(), cust, prod, nil)

	require.NoError(t, err)
	require.Equal(t, AccountCap, repo.savedCap,
		"the cap must reach the repository — it is enforced inside the transaction, not here")
	require.Nil(t, repo.savedAt, "an ordinary save takes now(), so it lands at the top of the list")
}

func TestSave_UndoRestoresTheOriginalPosition(t *testing.T) {
	repo := &fakeRepo{}
	when := time.Date(2026, 7, 20, 4, 11, 0, 0, time.UTC)

	require.NoError(t, svc(repo, &fakeZones{}).Save(context.Background(), cust, prod, &when))

	require.NotNil(t, repo.savedAt)
	require.Equal(t, when, *repo.savedAt,
		"undo means 'that removal did not happen' — the item returns to the position it held (FR-018)")
}

func TestSave_MalformedIDIsNotFoundRatherThanAValidationError(t *testing.T) {
	repo := &fakeRepo{}
	err := svc(repo, &fakeZones{}).Save(context.Background(), cust, "not-a-uuid", nil)

	require.ErrorIs(t, err, ErrProductNotFound, "a malformed id names no product")
	require.Zero(t, repo.saveCalls, "a malformed id must never reach the database")
}

func TestSave_CapReachedSurfacesADistinguishableRefusal(t *testing.T) {
	repo := &fakeRepo{saveReturns: ErrCapReached}
	err := svc(repo, &fakeZones{}).Save(context.Background(), cust, prod, nil)

	require.ErrorIs(t, err, ErrCapReached,
		"'you have too many saved items' and 'that product does not exist' need different answers")
}

func TestRemove_IsIdempotentAndNeverChecksExistence(t *testing.T) {
	repo := &fakeRepo{}
	s := svc(repo, &fakeZones{})

	require.NoError(t, s.Remove(context.Background(), cust, prod))
	require.NoError(t, s.Remove(context.Background(), cust, prod))

	require.Equal(t, 2, repo.removeCalls)
	// ⚠ Deliberately asymmetric with Save: removing something absent has the same end state, and a
	// 404 would make a retried delete look like a failure.
}

func TestRemove_MalformedIDIsASilentNoOp(t *testing.T) {
	repo := &fakeRepo{}
	require.NoError(t, svc(repo, &fakeZones{}).Remove(context.Background(), cust, "nope"))
	require.Zero(t, repo.removeCalls)
}

// ── Membership: the read that makes the heart tell the truth ────────────────────────────────────

func TestMembership_CountsWhatItReturns(t *testing.T) {
	repo := &fakeRepo{membership: []string{"a", "b", "c"}}
	m, err := svc(repo, &fakeZones{}).Membership(context.Background(), cust)

	require.NoError(t, err)
	require.Equal(t, 3, m.Count)
	require.Len(t, m.ProductIDs, 3)
}

func TestMembership_EmptyIsAnEmptySliceNotNil(t *testing.T) {
	repo := &fakeRepo{membership: []string{}}
	m, err := svc(repo, &fakeZones{}).Membership(context.Background(), cust)

	require.NoError(t, err)
	require.NotNil(t, m.ProductIDs, "a nil slice serialises as null; the contract says productIds is an array")
	require.Equal(t, 0, m.Count)
}

func TestMembership_PropagatesFailureRatherThanReportingAnEmptySet(t *testing.T) {
	repo := &fakeRepo{err: errors.New("boom")}
	_, err := svc(repo, &fakeZones{}).Membership(context.Background(), cust)

	require.Error(t, err,
		"reporting an empty set on failure would render every heart unsaved and invite the "+
			"destructive second tap this feature exists to remove")
}

// ── Location handling ───────────────────────────────────────────────────────────────────────────

func row(verdict string) listRow {
	return listRow{
		ProductID: prod, Name: "Free Range Eggs 12pk", PriceAmount: "6.50", Currency: "AUD",
		SavedAt: time.Date(2026, 7, 20, 4, 11, 0, 0, time.UTC), SavedPriceAmount: "8.00",
		Verdict: verdict,
	}
}

// ── Mapping — the thing the predecessor got wrong ───────────────────────────────────────────────

func TestList_CarriesTheFieldsThePredecessorDiscarded(t *testing.T) {
	brand, compare, key := "Effy", "8.00", "dairy-eggs"
	storage := "media/eggs.jpg"
	r := row(VerdictPurchasable)
	r.Brand, r.CompareAtAmount, r.CategoryKey, r.StorageKey = &brand, &compare, &key, &storage
	r.PriceDropped = true

	zones := &fakeZones{zone: zoneMel, found: true}
	items, err := svc(&fakeRepo{rows: []listRow{r}}, zones).List(context.Background(), cust)
	require.NoError(t, err)

	// ⚠ The predecessor computed brand / compareAtAmount / badges / savedAt server-side and BOTH
	// clients then dropped them, passing brand=null, badges=[] into the product card — while a code
	// comment blamed the projection for "carrying fewer fields". It did not; the mapper discarded them.
	require.Equal(t, "Effy", *items[0].Brand)
	require.Equal(t, "8.00", *items[0].CompareAtAmount)
	require.Equal(t, "dairy-eggs", *items[0].CategoryKey)
	require.Contains(t, items[0].Badges, "on_sale")
	require.Equal(t, "8.00", items[0].SavedPriceAmount)
	require.True(t, items[0].PriceDropped)
	require.Equal(t, "2026-07-20T04:11:00Z", items[0].SavedAt)
	require.NotNil(t, items[0].ImageURL)
}

func TestList_BadgesAreEmptySliceNotNil(t *testing.T) {
	zones := &fakeZones{zone: zoneMel, found: true}
	items, err := svc(&fakeRepo{rows: []listRow{row(VerdictPurchasable)}}, zones).List(context.Background(), cust)

	require.NoError(t, err)
	require.NotNil(t, items[0].Badges, "badges must serialise as [] not null")
	require.Empty(t, items[0].Badges)
}

func TestList_AFailedPresignBlanksTheImageAndNeverFailsTheRead(t *testing.T) {
	storage := "media/eggs.jpg"
	r := row(VerdictPurchasable)
	r.StorageKey = &storage

	s := NewService(&fakeRepo{rows: []listRow{r}}, fakePresign{err: errors.New("s3 down")})
	items, err := s.List(context.Background(), cust)

	require.NoError(t, err, "losing one thumbnail is a blemish; losing the whole list is an outage")
	require.Nil(t, items[0].ImageURL)
}

func TestList_EmptyIsAnEmptySliceNotNil(t *testing.T) {
	items, err := svc(&fakeRepo{rows: []listRow{}}, &fakeZones{}).List(context.Background(), cust)

	require.NoError(t, err)
	require.NotNil(t, items)
	require.Empty(t, items)
}

// ── The five verdicts survive the mapping unchanged ─────────────────────────────────────────────

// ── Price movement through the service (FR-043/FR-044) ─────────────────────────────────────────
//
// ⚠ The repository proves the SQL decides `price_dropped` correctly; these prove the SERVICE carries
// that decision to the caller intact and does not invent a second one. Two layers each computing
// "has this got cheaper" is how they eventually disagree.

func TestList_PriceDropSurvivesTheMapping(t *testing.T) {
	r := row(VerdictPurchasable)
	r.PriceAmount, r.SavedPriceAmount, r.PriceDropped = "4.00", "6.50", true

	zones := &fakeZones{zone: zoneMel, found: true}
	items, err := svc(&fakeRepo{rows: []listRow{r}}, zones).List(context.Background(), cust)
	require.NoError(t, err)

	require.True(t, items[0].PriceDropped)
	require.Equal(t, "4.00", items[0].PriceAmount, "the CURRENT price is what the shopper pays")
	require.Equal(t, "6.50", items[0].SavedPriceAmount, "and the baseline is what it was when saved")
}

func TestList_NoDropIsCarriedThroughAsFalse(t *testing.T) {
	r := row(VerdictPurchasable)
	r.PriceAmount, r.SavedPriceAmount, r.PriceDropped = "9.99", "6.50", false

	zones := &fakeZones{zone: zoneMel, found: true}
	items, err := svc(&fakeRepo{rows: []listRow{r}}, zones).List(context.Background(), cust)
	require.NoError(t, err)

	// ⚠ A RISE produces no flag and no field on the wire (FR-044). The current price is always shown,
	// so nothing is concealed — but a rise is not something a shopper can act on, and badging it would
	// add noise to the one signal a watchlist exists to carry. There is deliberately no `PriceRose`.
	require.False(t, items[0].PriceDropped)
	require.Equal(t, "9.99", items[0].PriceAmount)
}

func TestList_MoneyCrossesAsTextNeverAFloat(t *testing.T) {
	r := row(VerdictPurchasable)
	r.PriceAmount, r.SavedPriceAmount = "1234567890.05", "1234567890.99"

	zones := &fakeZones{zone: zoneMel, found: true}
	items, err := svc(&fakeRepo{rows: []listRow{r}}, zones).List(context.Background(), cust)
	require.NoError(t, err)

	// ⚠ numeric(12,2)::text all the way out. A float64 cannot hold this exactly, and money that is
	// "nearly" right is money that is wrong.
	require.Equal(t, "1234567890.05", items[0].PriceAmount)
	require.Equal(t, "1234567890.99", items[0].SavedPriceAmount)
}

// ── The guest → account join ────────────────────────────────────────────────────────────────────

func TestMerge_HandsItemsOverNewestFirst(t *testing.T) {
	repo := &fakeRepo{}
	older := time.Date(2026, 7, 1, 9, 0, 0, 0, time.UTC)
	newer := time.Date(2026, 7, 20, 9, 0, 0, 0, time.UTC)

	_, err := svc(repo, &fakeZones{}).Merge(context.Background(), cust, []MergeItem{
		{ProductID: "old", SavedAt: older},
		{ProductID: "new", SavedAt: newer},
	})
	require.NoError(t, err)

	// ⚠ The cap truncates in the order the repository receives items. Left in the client's order,
	// whichever happened to be sent first would survive — arbitrary. Newest-first at least means the
	// shopper keeps what they cared about most recently, and it is a STATED rule.
	require.Equal(t, []string{"new", "old"}, repo.mergeOrder)
}

func TestMerge_PassesTheAccountCap(t *testing.T) {
	repo := &fakeRepo{}
	_, err := svc(repo, &fakeZones{}).Merge(context.Background(), cust, []MergeItem{{ProductID: "a"}})
	require.NoError(t, err)
	require.Equal(t, AccountCap, repo.mergeCap)
}

func TestMerge_DoesNotMutateTheCallersSlice(t *testing.T) {
	repo := &fakeRepo{}
	older := time.Date(2026, 7, 1, 9, 0, 0, 0, time.UTC)
	newer := time.Date(2026, 7, 20, 9, 0, 0, 0, time.UTC)
	input := []MergeItem{{ProductID: "old", SavedAt: older}, {ProductID: "new", SavedAt: newer}}

	_, err := svc(repo, &fakeZones{}).Merge(context.Background(), cust, input)
	require.NoError(t, err)

	// The client still holds this list and clears it only after the merge is acknowledged; reordering
	// it underneath them would be a surprising side effect on data they still own.
	require.Equal(t, "old", input[0].ProductID)
}

func TestMerge_ReturnsTheResultingSetSoTheClientNeedsNoSecondRead(t *testing.T) {
	repo := &fakeRepo{membership: []string{"a", "b"}}
	res, err := svc(repo, &fakeZones{}).Merge(context.Background(), cust, []MergeItem{{ProductID: "a"}})
	require.NoError(t, err)
	require.Equal(t, []string{"a", "b"}, res.ProductIDs)
	require.NotNil(t, res.Skipped, "skipped must serialise as [] not null")
}

// ── Bulk add to cart (FR-051/FR-052) ───────────────────────────────────────────────────────────

type fakeCart struct {
	added     []string
	changeIDs []string
	failOn    map[string]error
}

func (f *fakeCart) Add(_ context.Context, _, productID, changeID string, _ int) error {
	if err, ok := f.failOn[productID]; ok {
		return err
	}
	f.added = append(f.added, productID)
	f.changeIDs = append(f.changeIDs, changeID)
	return nil
}

func mixedRows() []listRow {
	mk := func(id, v string) listRow {
		r := row(v)
		r.ProductID = id
		return r
	}
	return []listRow{
		mk("buyable", VerdictPurchasable),
		mk("oos", VerdictTemporarilyOut),
		mk("gone", VerdictNoLongerSold),
	}
}

func TestAddAllToCart_AddsOnlyThePurchasableOnes(t *testing.T) {
	fc := &fakeCart{}
	s := NewService(&fakeRepo{rows: mixedRows()}, fakePresign{}).WithCart(fc)

	res, err := s.AddAllToCart(context.Background(), cust, "chg")
	require.NoError(t, err)

	require.Equal(t, []string{"buyable"}, res.Added)
	require.Equal(t, []string{"buyable"}, fc.added)
}

// ⚠ THE FAILURE MODE THIS ENDPOINT EXISTS TO PREVENT. A bulk add that quietly drops what it could not
// take leaves the shopper believing they bought something they did not, and they find out at the till.
func TestAddAllToCart_NamesEverySkipWithAReason(t *testing.T) {
	s := NewService(&fakeRepo{rows: mixedRows()}, fakePresign{}).WithCart(&fakeCart{})

	res, err := s.AddAllToCart(context.Background(), cust, "chg")
	require.NoError(t, err)

	require.Len(t, res.Skipped, 2, "nothing may be omitted silently")
	reasons := map[string]string{}
	for _, sk := range res.Skipped {
		reasons[sk.ProductID] = sk.Reason
	}
	// The verdict IS the reason, so the list and the bulk add can never explain the same item
	// differently.
	require.Equal(t, VerdictTemporarilyOut, reasons["oos"])
	require.Equal(t, VerdictNoLongerSold, reasons["gone"])
}

func TestAddAllToCart_CarriesTheCartsOwnRefusalThrough(t *testing.T) {
	fc := &fakeCart{failOn: map[string]error{"buyable": cart.ErrCartFull}}
	s := NewService(&fakeRepo{rows: mixedRows()}, fakePresign{}).WithCart(fc)

	res, err := s.AddAllToCart(context.Background(), cust, "chg")
	require.NoError(t, err)

	require.Empty(t, res.Added)
	require.Contains(t, skipReasons(res.Skipped), "cart_full",
		"'your cart is full' and 'that is out of stock' need different things from the shopper")
}

func TestAddAllToCart_NothingPurchasableIsStillASuccessfulRequest(t *testing.T) {
	rows := []listRow{row(VerdictTemporarilyOut)}
	s := NewService(&fakeRepo{rows: rows}, fakePresign{}).WithCart(&fakeCart{})

	res, err := s.AddAllToCart(context.Background(), cust, "chg")

	// ⚠ Not an error. Nothing was wrong with the request — the shopper's list simply contains nothing
	// they can buy where they are, and the client renders that from `skipped`.
	require.NoError(t, err)
	require.Empty(t, res.Added)
	require.Len(t, res.Skipped, 1)
}

// ⚠ One changeId across the batch would let the cart's own dedupe treat the second item as a retry of
// the first, silently dropping it — a bulk add that adds one thing.
func TestAddAllToCart_GivesEachItemItsOwnChangeID(t *testing.T) {
	rows := []listRow{row(VerdictPurchasable), row(VerdictPurchasable)}
	rows[0].ProductID, rows[1].ProductID = "a", "b"
	fc := &fakeCart{}
	s := NewService(&fakeRepo{rows: rows}, fakePresign{}).WithCart(fc)

	_, err := s.AddAllToCart(context.Background(), cust, "chg")
	require.NoError(t, err)

	require.Len(t, fc.changeIDs, 2)
	require.NotEqual(t, fc.changeIDs[0], fc.changeIDs[1])

	// ⚠ THE ASSERTION THIS TEST WAS MISSING, AND THE WHOLE BULK ADD WAS BROKEN WITHOUT IT.
	//
	// The ids were `changeID + ":" + productID`. Distinct — so the check above passed — but
	// `public.cart_change_log.change_id` is a **uuid** column, so every insert failed with
	// `invalid input syntax for type uuid` and the shopper was told "0 items added" with every
	// product refused. `fakeCart` takes a `string` and accepts anything, so the fixture agreed with
	// the code instead of with the database. A change id must be something the cart can actually
	// store.
	for _, id := range fc.changeIDs {
		_, err := uuid.Parse(id)
		require.NoErrorf(t, err, "change id %q is not a uuid — cart_change_log.change_id is uuid", id)
	}
}

// A retry of the same bulk add must derive the SAME per-item ids, or the cart's dedupe cannot
// recognise it as a retry and the shopper gets two of everything.
func TestAddAllToCart_ChangeIDsAreStableAcrossRetries(t *testing.T) {
	run := func() []string {
		rows := []listRow{row(VerdictPurchasable), row(VerdictPurchasable)}
		rows[0].ProductID, rows[1].ProductID = "a", "b"
		fc := &fakeCart{}
		s := NewService(&fakeRepo{rows: rows}, fakePresign{}).WithCart(fc)
		_, err := s.AddAllToCart(context.Background(), cust, "same-batch")
		require.NoError(t, err)
		return fc.changeIDs
	}
	require.Equal(t, run(), run())

	// ...and a genuinely NEW batch must not collide with the old one, or a deliberate second bulk add
	// would be swallowed as a duplicate.
	require.NotEqual(t, itemChangeID("batch-1", "a"), itemChangeID("batch-2", "a"))
}

func skipReasons(s []Skip) []string {
	out := make([]string, 0, len(s))
	for _, x := range s {
		out = append(out, x.Reason)
	}
	return out
}
