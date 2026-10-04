package saveditems

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// ── Lists (068), against real PostgreSQL ────────────────────────────────────────────────────────
//
// ⚠ NONE OF THIS CAN BE A UNIT TEST. Every guarantee below is carried by the database: a partial
// unique index (one default list; one name per shopper), two composite foreign keys (no entry in
// someone else's list; no entry for an unsaved product), a cascade, and a sweep statement. A fake
// accepts all of it and proves nothing.
//
// The schema is the REAL 068 migration (see listsMigration in repository_test.go).

const (
	otherShopper = "c0000000-0000-0000-0000-0000000000bb"
	noSuchList   = "11111111-1111-1111-1111-111111111111"
)

// zeroOrphans asserts the invariant: no saved product without a list entry. (The other direction —
// no entry without a saved product — is a foreign key and cannot be violated.)
func zeroOrphans(t *testing.T, pool *pgxpool.Pool, customerID string) {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT count(*) FROM public.customer_saved_item s
		WHERE s.customer_id = $1 AND NOT EXISTS (
			SELECT 1 FROM public.customer_list_entry e
			WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id)`, customerID).Scan(&n))
	require.Zero(t, n, "⚠ a saved product in no list: its heart is filled and the shopper can find it nowhere")
}

func count(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), sql, args...).Scan(&n))
	return n
}

func productIDs(rows []listRow) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.ProductID)
	}
	return out
}

func mustCreate(t *testing.T, r *Repository, customerID, name string, productID *string) string {
	t.Helper()
	id, err := r.CreateList(context.Background(), customerID, name, productID, ListLimit, AccountCap)
	require.NoError(t, err)
	return id
}

// ── The backfill (FR-035, SC-006) ───────────────────────────────────────────────────────────────

func TestBackfill_CarriesEverySavedItemIntoTheDefaultListUnchanged(t *testing.T) {
	if testing.Short() {
		t.Skip("-short: container-backed test skipped")
	}
	pool := startPostgres(t)
	seedBaseSchema(t, pool) // the world BEFORE 068
	seedWorld(t, pool)
	ctx := context.Background()

	base := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	for i, p := range []struct {
		id    string
		price string
	}{{pActive, "8.00"}, {pDraft, "5.00"}, {pArchived, "4.00"}} {
		_, err := pool.Exec(ctx, `
			INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency, saved_at)
			VALUES ($1, $2, $3, 'AUD', $4)`, shopper, p.id, p.price, base.Add(time.Duration(i)*time.Hour))
		require.NoError(t, err)
	}

	applyListsMigration(t, pool)
	r := NewRepository(pool)

	rows, err := r.List(ctx, shopper, DefaultListRef)
	require.NoError(t, err)
	require.Equal(t, []string{pArchived, pDraft, pActive}, productIDs(rows),
		"the default list keeps the order the saved list had: newest first")
	require.Equal(t, "8.00", rows[2].SavedPriceAmount, "the remembered price survives the migration")
	require.True(t, rows[2].PriceDropped, "…and so does the drop it was reporting (8.00 → 6.50)")
	require.Equal(t, base.UTC(), rows[2].SavedAt.UTC(), "position is the original save time")
	require.Equal(t, 3, count(t, pool, `SELECT count(*) FROM public.customer_saved_item`), "nothing lost, nothing duplicated")
	zeroOrphans(t, pool, shopper)

	// ⚠ The backfill is ALSO the repair for the deploy window, so it must be safe to run again.
	_, backfill, found := strings.Cut(listsMigrationUp(t), "-- ── Carry every existing saved item")
	require.True(t, found, "the migration's backfill section marker moved; quickstart §2 quotes it")
	// An orphan, as the pre-068 core-api would write one between the migration and the deploy.
	_, err = pool.Exec(ctx, `
		INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency)
		VALUES ($1, $2, 9.00, 'AUD')`, shopper, pOtherShop)
	require.NoError(t, err)
	for range 2 {
		_, err = pool.Exec(ctx, "-- "+backfill)
		require.NoError(t, err)
	}
	zeroOrphans(t, pool, shopper)
	require.Equal(t, 4, count(t, pool, `SELECT count(*) FROM public.customer_list_entry`))
	require.Equal(t, 1, count(t, pool, `SELECT count(*) FROM public.customer_list`))
}

// ── The heart (FR-018 to FR-020, SC-008) ────────────────────────────────────────────────────────

func TestHeartUnsave_NeverRemovesAProductFromANamedList(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	require.NoError(t, r.Save(ctx, shopper, pDraft, nil, AccountCap))
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pOtherShop, nil, AccountCap)) // ONLY in the named list

	// In "Saved" and in a named list.
	require.ErrorIs(t, r.Remove(ctx, shopper, pActive), ErrInNamedLists)
	// In a named list only.
	require.ErrorIs(t, r.Remove(ctx, shopper, pOtherShop), ErrInNamedLists)
	require.Equal(t, 4, count(t, pool, `SELECT count(*) FROM public.customer_list_entry`),
		"⚠ a refused un-save removes NOTHING — not even the default-list entry")

	// Only in "Saved": the heart un-saves it, as it always did.
	require.NoError(t, r.Remove(ctx, shopper, pDraft))

	ids, err := r.MembershipIDs(ctx, shopper)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{pActive, pOtherShop}, ids,
		"the heart is filled for a product in ANY list, including one that is in no default list")

	named, err := r.NamedProductIDs(ctx, shopper)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{pActive, pOtherShop}, named)
	zeroOrphans(t, pool, shopper)
}

// ── Creating (FR-001, FR-002, FR-007, FR-015) ───────────────────────────────────────────────────

func TestCreateList_NamesAreUniqueIgnoringCase(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	mustCreate(t, r, shopper, "Weekly Items", nil)

	_, err := r.CreateList(ctx, shopper, "weekly ITEMS", nil, ListLimit, AccountCap)
	require.ErrorIs(t, err, ErrNameTaken)

	// Another shopper may use the same name.
	_, err = pool0(t, r).Exec(ctx, `INSERT INTO public.customer (id) VALUES ($1)`, otherShopper)
	require.NoError(t, err)
	_, err = r.CreateList(ctx, otherShopper, "Weekly Items", nil, ListLimit, AccountCap)
	require.NoError(t, err)
}

func pool0(t *testing.T, r *Repository) *pgxpool.Pool { t.Helper(); return r.pool }

func TestCreateList_TwoDevicesOneNameYieldsOneList(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = r.CreateList(ctx, shopper, "Daily Items", nil, ListLimit, AccountCap)
		}()
	}
	wg.Wait()

	won := 0
	for _, err := range errs {
		if err == nil {
			won++
			continue
		}
		require.ErrorIs(t, err, ErrNameTaken)
	}
	require.Equal(t, 1, won)
	require.Equal(t, 1, count(t, pool, `SELECT count(*) FROM public.customer_list WHERE NOT is_default`))
}

func TestCreateList_RefusesBeyondTheLimit(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	for i := range ListLimit {
		mustCreate(t, r, shopper, fmt.Sprintf("List %d", i), nil)
	}
	_, err := r.CreateList(ctx, shopper, "One too many", nil, ListLimit, AccountCap)
	require.ErrorIs(t, err, ErrListLimit)
	require.Equal(t, ListLimit, count(t, pool, `SELECT count(*) FROM public.customer_list WHERE NOT is_default`),
		"nothing is removed to make room")

	// The default list is not counted against the limit.
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
}

func TestCreateList_WithAProductIsAllOrNothing(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	_, err := r.CreateList(ctx, shopper, "Weekly Items", ptr(noSuchList), ListLimit, AccountCap)
	require.ErrorIs(t, err, ErrProductNotFound)
	require.Zero(t, count(t, pool, `SELECT count(*) FROM public.customer_list`),
		"⚠ a refused product must not leave an empty list behind — to the shopper it was one action")

	id := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))
	rows, err := r.List(ctx, shopper, id)
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, productIDs(rows))
	zeroOrphans(t, pool, shopper)
}

func TestDatabaseRefusesAnOverlongNameWhateverTheServiceDoes(t *testing.T) {
	r, _ := repo(t)
	_, err := r.CreateList(context.Background(), shopper, strings.Repeat("x", ListNameMax+1), nil, ListLimit, AccountCap)
	require.Error(t, err, "the CHECK is the backstop for a writer that is not the service")
	require.False(t, errors.Is(err, ErrNameTaken))
}

// ── Adding (FR-011, FR-016, FR-031, FR-033) ─────────────────────────────────────────────────────

func TestAddEntry_IsIdempotent(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	id := mustCreate(t, r, shopper, "Weekly Items", nil)

	require.NoError(t, r.AddEntry(ctx, shopper, id, pActive, nil, AccountCap))
	require.NoError(t, r.AddEntry(ctx, shopper, id, pActive, nil, AccountCap))
	require.Equal(t, 1, count(t, pool, `SELECT count(*) FROM public.customer_list_entry`))
}

func TestAddEntry_ToADeletedListPlacesTheProductNowhere(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	id := mustCreate(t, r, shopper, "Weekly Items", nil)
	require.NoError(t, r.DeleteList(ctx, shopper, id))

	require.ErrorIs(t, r.AddEntry(ctx, shopper, id, pActive, nil, AccountCap), ErrListNotFound)
	require.Zero(t, count(t, pool, `SELECT count(*) FROM public.customer_saved_item`),
		"⚠ not saved, and not quietly placed in a different list")
	require.Zero(t, count(t, pool, `SELECT count(*) FROM public.customer_list_entry`))
}

func TestCap_CountsDistinctProductsNotEntries(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	id := mustCreate(t, r, shopper, "Weekly Items", nil)

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, 1)) // at a cap of one
	require.NoError(t, r.AddEntry(ctx, shopper, id, pActive, nil, 1),
		"an already-saved product joining another list adds nothing to the cap (FR-033)")
	require.ErrorIs(t, r.AddEntry(ctx, shopper, id, pDraft, nil, 1), ErrCapReached)
}

func TestOneRememberedPricePerProductAcrossLists(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap)) // first saved at 6.50

	_, err := pool.Exec(ctx, `UPDATE public.product SET price_amount = 5.00 WHERE id = $1`, pActive)
	require.NoError(t, err)
	id := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive)) // joins a second list at 5.00

	for _, ref := range []string{DefaultListRef, id} {
		rows, err := r.List(ctx, shopper, ref)
		require.NoError(t, err)
		require.Equal(t, "6.50", rows[0].SavedPriceAmount,
			"⚠ the baseline is the FIRST save; two lists must never show two different 'was' prices")
		require.True(t, rows[0].PriceDropped)
	}
}

// ── Isolation (FR-008, SC-010) ──────────────────────────────────────────────────────────────────

func TestAnotherShopperCannotReachAList(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO public.customer (id) VALUES ($1)`, otherShopper)
	require.NoError(t, err)
	id := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))

	_, err = r.List(ctx, otherShopper, id)
	require.ErrorIs(t, err, ErrListNotFound, "the same answer as an id that does not exist")
	require.ErrorIs(t, r.AddEntry(ctx, otherShopper, id, pDraft, nil, AccountCap), ErrListNotFound)
	require.ErrorIs(t, r.RenameList(ctx, otherShopper, id, "Mine now"), ErrListNotFound)
	require.NoError(t, r.DeleteList(ctx, otherShopper, id), "idempotent — and it deleted nothing")
	require.NoError(t, r.RemoveEntry(ctx, otherShopper, id, pActive))

	rows, err := r.List(ctx, shopper, id)
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, productIDs(rows), "the owner's list is exactly as it was")

	theirs, err := r.Lists(ctx, otherShopper, nil)
	require.NoError(t, err)
	require.Empty(t, theirs)

	// ⚠ And the schema refuses it even if a statement forgot its customer predicate.
	_, err = pool.Exec(ctx, `
		INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency)
		VALUES ($1, $2, 1.00, 'AUD')`, otherShopper, pDraft)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO public.customer_list_entry (list_id, product_id, customer_id) VALUES ($1, $2, $3)`,
		id, pDraft, otherShopper)
	require.Error(t, err, "an entry in someone else's list is unrepresentable (customer_list_entry_list_fk)")
}

// ── The lists read (FR-003, FR-006, FR-027) ─────────────────────────────────────────────────────

func TestLists_TheDefaultIsAlwaysThereAndReadingNeverWrites(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	s := NewService(r, nil)

	lists, err := s.Lists(ctx, shopper, nil)
	require.NoError(t, err)
	require.Len(t, lists, 1)
	require.Equal(t, DefaultListRef, lists[0].ID)
	require.True(t, lists[0].IsDefault)
	require.Nil(t, lists[0].Name)
	require.Zero(t, lists[0].Count)
	require.Zero(t, count(t, pool, `SELECT count(*) FROM public.customer_list`), "a read must not create the row")

	rows, err := r.List(ctx, shopper, DefaultListRef)
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestLists_CountsAndContains(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	s := NewService(r, nil)

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	require.NoError(t, r.Save(ctx, shopper, pDraft, nil, AccountCap))
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pOtherShop, nil, AccountCap))
	mustCreate(t, r, shopper, "Daily Items", nil)

	lists, err := s.Lists(ctx, shopper, ptr(pActive))
	require.NoError(t, err)
	require.Len(t, lists, 3)

	require.Equal(t, DefaultListRef, lists[0].ID, "the default first")
	require.Equal(t, 2, lists[0].Count)
	require.Equal(t, 1, lists[0].OnlyHereCount, "pDraft is only in Saved; pActive is also in Weekly")
	require.True(t, *lists[0].ContainsProduct)

	require.Equal(t, "Weekly Items", *lists[1].Name, "then by creation, oldest first")
	require.Equal(t, 2, lists[1].Count)
	require.Equal(t, 1, lists[1].OnlyHereCount, "pOtherShop is only here")
	require.True(t, *lists[1].ContainsProduct)

	require.Equal(t, "Daily Items", *lists[2].Name)
	require.Zero(t, lists[2].Count)
	require.False(t, *lists[2].ContainsProduct)

	plain, err := s.Lists(ctx, shopper, nil)
	require.NoError(t, err)
	require.Nil(t, plain[0].ContainsProduct, "absent, not false, when no product was asked about")
}

// ── The weekly shop (FR-028, FR-029, SC-002) ────────────────────────────────────────────────────

func TestAddAll_TakesOnlyTheNamedListAndLeavesItIntact(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	cart := &fakeCart{}
	s := NewService(r, nil).WithCart(cart)

	require.NoError(t, r.Save(ctx, shopper, pOtherShop, nil, AccountCap)) // in "Saved" only
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pDraft, nil, AccountCap)) // unavailable

	res, err := s.AddAllToCart(ctx, shopper, weekly, "0b000000-0000-0000-0000-00000000000b")
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, res.Added)
	require.Equal(t, []Skip{{ProductID: pDraft, Reason: VerdictTemporarilyOut}}, res.Skipped,
		"nothing is silently omitted: the skipped product is named with the reason the list shows")
	require.NotContains(t, cart.added, pOtherShop, "⚠ nothing from another list goes in")

	require.Equal(t, 2, count(t, pool, `SELECT count(*) FROM public.customer_list_entry WHERE list_id = $1`, weekly),
		"adding to the cart removes nothing from the list")

	_, err = s.AddAllToCart(ctx, shopper, noSuchList, "0b000000-0000-0000-0000-00000000000b")
	require.ErrorIs(t, err, ErrListNotFound)
}

// ── Tidying (FR-004, FR-005, FR-024, SC-007) ────────────────────────────────────────────────────

func TestRename_KeepsContentsAndRefusesATakenName(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pDraft, nil, AccountCap))
	mustCreate(t, r, shopper, "Daily Items", nil)
	before, err := r.List(ctx, shopper, weekly)
	require.NoError(t, err)

	require.NoError(t, r.RenameList(ctx, shopper, weekly, "Weekly Shop"))
	after, err := r.List(ctx, shopper, weekly)
	require.NoError(t, err)
	require.Equal(t, productIDs(before), productIDs(after), "contents and order untouched")

	require.ErrorIs(t, r.RenameList(ctx, shopper, weekly, "daily items"), ErrNameTaken)
	require.NoError(t, r.RenameList(ctx, shopper, weekly, "WEEKLY SHOP"), "its own name in another case is not a clash")

	// The default list, by alias and by its real id.
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	var defaultID string
	require.NoError(t, pool.QueryRow(ctx, `SELECT id::text FROM public.customer_list WHERE is_default`).Scan(&defaultID))
	for _, ref := range []string{DefaultListRef, defaultID} {
		require.ErrorIs(t, r.RenameList(ctx, shopper, ref, "Favourites"), ErrDefaultList)
		require.ErrorIs(t, r.DeleteList(ctx, shopper, ref), ErrDefaultList)
	}
	require.Equal(t, 1, count(t, pool, `SELECT count(*) FROM public.customer_list WHERE is_default`))
}

func TestRemoveEntry_TouchesOneListOnly(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))

	require.NoError(t, r.RemoveEntry(ctx, shopper, weekly, pActive))
	ids, err := r.MembershipIDs(ctx, shopper)
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, ids, "still in Saved, so still saved: the heart stays filled")

	// The last entry: now it stops being saved, and the remembered price goes with it.
	require.NoError(t, r.RemoveEntry(ctx, shopper, DefaultListRef, pActive))
	require.Zero(t, count(t, pool, `SELECT count(*) FROM public.customer_saved_item`))
	require.NoError(t, r.RemoveEntry(ctx, shopper, DefaultListRef, pActive), "idempotent")
	require.NoError(t, r.RemoveEntry(ctx, shopper, noSuchList, pActive), "a gone list is the same end state")
	zeroOrphans(t, pool, shopper)
}

func TestUndo_RestoresThePositionInThatList(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	weekly := mustCreate(t, r, shopper, "Weekly Items", nil)
	t0 := time.Now().Add(-48 * time.Hour).UTC().Truncate(time.Second)

	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pActive, &t0, AccountCap)) // oldest
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pDraft, nil, AccountCap))  // newest

	require.NoError(t, r.RemoveEntry(ctx, shopper, weekly, pActive))
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pActive, &t0, AccountCap)) // undo

	rows, err := r.List(ctx, shopper, weekly)
	require.NoError(t, err)
	require.Equal(t, []string{pDraft, pActive}, productIDs(rows), "back where it was, not promoted to the top")
}

func TestDeleteList_LeavesEveryOtherListAlone(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	s := NewService(r, nil)

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))                // also in Saved
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pDraft, nil, AccountCap))    // only here
	require.NoError(t, r.AddEntry(ctx, shopper, weekly, pArchived, nil, AccountCap)) // also in Daily
	daily := mustCreate(t, r, shopper, "Daily Items", ptr(pArchived))

	lists, err := s.Lists(ctx, shopper, nil)
	require.NoError(t, err)
	promised := lists[1].OnlyHereCount
	saved := count(t, pool, `SELECT count(*) FROM public.customer_saved_item`)

	require.NoError(t, r.DeleteList(ctx, shopper, weekly))

	require.Equal(t, promised, saved-count(t, pool, `SELECT count(*) FROM public.customer_saved_item`),
		"⚠ the confirmation told the shopper how many would stop being saved; the delete must un-save exactly that many")
	ids, err := r.MembershipIDs(ctx, shopper)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{pActive, pArchived}, ids, "products in another list are still saved")

	rows, err := r.List(ctx, shopper, daily)
	require.NoError(t, err)
	require.Equal(t, []string{pArchived}, productIDs(rows))
	rows, err = r.List(ctx, shopper, DefaultListRef)
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, productIDs(rows))

	require.NoError(t, r.DeleteList(ctx, shopper, weekly), "idempotent")
	zeroOrphans(t, pool, shopper)
}

// ── The guest join (FR-038) ─────────────────────────────────────────────────────────────────────

func TestMerge_JoinsSavedAndTouchesNoNamedList(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	weekly := mustCreate(t, r, shopper, "Weekly Items", ptr(pActive)) // saved ONLY through a named list
	at := time.Now().UTC().Truncate(time.Second)

	for range 2 { // …and again: the join is idempotent
		_, _, ids, err := r.Merge(ctx, shopper, []MergeItem{mi(pActive, at, "1.00"), mi(pDraft, at, "5.00")}, AccountCap)
		require.NoError(t, err)
		require.ElementsMatch(t, []string{pActive, pDraft}, ids)
	}
	added, _, _, err := r.Merge(ctx, shopper, nil, AccountCap)
	require.NoError(t, err)
	require.Zero(t, added)

	rows, err := r.List(ctx, shopper, DefaultListRef)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{pActive, pDraft}, productIDs(rows),
		"both are in Saved now — including the one that was so far only in a named list")
	for _, row := range rows {
		if row.ProductID == pActive {
			require.Equal(t, "6.50", row.SavedPriceAmount, "the account's original price outranks the device's copy")
		}
	}

	rows, err = r.List(ctx, shopper, weekly)
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, productIDs(rows), "no named list is changed by a join")
	zeroOrphans(t, pool, shopper)
}

func TestMerge_CountsOnlyNewlySavedProducts(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	mustCreate(t, r, shopper, "Weekly Items", ptr(pActive))
	at := time.Now().UTC()

	added, _, _, err := r.Merge(ctx, shopper, []MergeItem{mi(pActive, at, "1.00"), mi(pDraft, at, "5.00")}, AccountCap)
	require.NoError(t, err)
	require.Equal(t, 1, added, "the disclosed count is new saved products; pActive was already saved")
}
