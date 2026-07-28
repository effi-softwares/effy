package storefront

import (
	"context"
	"errors"
	"testing"
)

// ── Sort selection ──────────────────────────────────────────────────────────────────────────────

// Relevance has nothing to rank by without a query. Falling back is right; falling back SILENTLY is
// not — the client would render a "Best match" control above a list ordered by date (FR-016).
func TestSearch_RelevanceWithoutQueryFallsBackAndSaysSo(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	res, err := svc.Search(context.Background(), SearchQuery{Sort: SortRelevance})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if res.Sort != SortNewest {
		t.Fatalf("reported sort = %q, want newest", res.Sort)
	}
	if repo.lastParams.Sort != SortNewest {
		t.Fatalf("repository was asked for %q, want newest", repo.lastParams.Sort)
	}
}

func TestSearch_RelevanceWithAQueryIsHonoured(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	res, err := svc.Search(context.Background(), SearchQuery{Q: "milk", Sort: SortRelevance})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if res.Sort != SortRelevance || repo.lastParams.Sort != SortRelevance {
		t.Fatalf("relevance with a query must be honoured, got %q", res.Sort)
	}
}

// The default is unchanged from before 025 — no existing result set changes shape.
func TestSearch_DefaultsToNewest(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	res, err := svc.Search(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if res.Sort != SortNewest || repo.lastParams.Sort != SortNewest {
		t.Fatalf("default sort = %q, want newest", res.Sort)
	}
}

// ── FR-016b: a cursor may not cross an ordering ─────────────────────────────────────────────────

// The failure this prevents is silent. Comparing a price against a timestamp produces no error — just
// a result set with products dropped and repeated, which nobody can debug from the outside.
func TestSearch_RejectsACursorFromADifferentSort(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	issuedUnderNewest := Cursor{
		Sort: SortNewest,
		Key:  "2026-07-27T10:00:00Z",
		ID:   "11111111-1111-1111-1111-111111111111",
	}.Encode()

	_, err := svc.Search(context.Background(), SearchQuery{
		Sort:   SortPriceAsc,
		Cursor: issuedUnderNewest,
	})
	if !errors.Is(err, ErrCursorSortMismatch) {
		t.Fatalf("want ErrCursorSortMismatch, got %v", err)
	}
}

func TestSearch_AcceptsACursorFromTheSameSort(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	cur := Cursor{Sort: SortPriceAsc, Key: "12.34", ID: "11111111-1111-1111-1111-111111111111"}.Encode()

	if _, err := svc.Search(context.Background(), SearchQuery{Sort: SortPriceAsc, Cursor: cur}); err != nil {
		t.Fatalf("a matching cursor must be accepted: %v", err)
	}
	if repo.lastParams.Cursor == nil {
		t.Fatal("the decoded cursor never reached the repository")
	}
	if repo.lastParams.Cursor.Key != "12.34" {
		t.Fatalf("cursor key = %q, want 12.34 (money must not round-trip a float)", repo.lastParams.Cursor.Key)
	}
}

// An unreadable cursor is an ephemeral page position, not corrupt state. Starting over is the right
// behaviour and costs the shopper a scroll, not an error page.
func TestSearch_UnreadableCursorStartsFromTheBeginning(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	if _, err := svc.Search(context.Background(), SearchQuery{Cursor: "!!!not-a-cursor!!!"}); err != nil {
		t.Fatalf("an unreadable cursor must not error: %v", err)
	}
	if repo.lastParams.Cursor != nil {
		t.Fatal("an unreadable cursor must not be passed to the repository")
	}
}

// ── FR-016a: the total describes the same set as the list ───────────────────────────────────────

func TestSearch_ReportsTheTotalMatchingTheFilters(t *testing.T) {
	rows := make([]searchRow, 0, 5)
	for i := range 5 {
		rows = append(rows, searchRowOf(card("p"+string(rune('a'+i)), "P", nil, i, nil)))
	}
	// 5 rows on this page, but 137 match the filters overall.
	svc := NewService(&fakeReader{search: rows, count: 137}, fakePresign{})

	res, err := svc.Search(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if res.Total != 137 {
		t.Fatalf("total = %d, want 137 (the full match set, not the page)", res.Total)
	}
	if len(res.Cards) != 5 {
		t.Fatalf("page size = %d, want 5", len(res.Cards))
	}
}

// The count is taken over the SAME filters as the page. This asserts the params reaching the
// repository carry the filters, which is what keeps "48 results" from sitting above a list of 31.
func TestSearch_CountSeesTheSameFiltersAsThePage(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}, count: 1}
	svc := NewService(repo, fakePresign{})

	_, err := svc.Search(context.Background(), SearchQuery{
		Q: "milk", CategoryKey: "dairy", MinPrice: "1.00", MaxPrice: "9.99", SaleOnly: true,
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	p := repo.lastParams
	if p.Q != "milk" || p.CategoryKey != "dairy" || p.MinPrice != "1.00" || p.MaxPrice != "9.99" || !p.SaleOnly {
		t.Fatalf("filters did not reach the repository intact: %+v", p)
	}
}

// A failed count must fail the read rather than silently reporting zero results above a full list.
func TestSearch_CountFailurePropagates(t *testing.T) {
	repo := &countFailingReader{fakeReader: fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}}
	svc := NewService(repo, fakePresign{})

	if _, err := svc.Search(context.Background(), SearchQuery{}); err == nil {
		t.Fatal("a failed count must surface, not be reported as zero")
	}
}

type countFailingReader struct{ fakeReader }

func (r *countFailingReader) CountCards(_ context.Context, _ SearchParams) (int, error) {
	return 0, errors.New("count blew up")
}

// ── Cursor minting picks the right key per ordering ─────────────────────────────────────────────

func TestSearch_MintsTheCursorKeyForTheActiveSort(t *testing.T) {
	// 25 rows for a 24-page → a cursor is minted from row 24.
	rows := make([]searchRow, 0, 25)
	for i := range 25 {
		r := searchRowOf(card("p"+string(rune('a'+i)), "P", nil, i, nil))
		r.PriceAmount = "10.00"
		rows = append(rows, r)
	}

	for _, tc := range []struct {
		sort    ProductSort
		wantKey string
	}{
		{SortPriceAsc, "10.00"},
		{SortPriceDesc, "10.00"},
	} {
		svc := NewService(&fakeReader{search: rows}, fakePresign{})
		res, err := svc.Search(context.Background(), SearchQuery{Sort: tc.sort})
		if err != nil {
			t.Fatalf("%s: %v", tc.sort, err)
		}
		if res.NextCursor == nil {
			t.Fatalf("%s: want a next cursor", tc.sort)
		}
		cur, ok := DecodeCursor(*res.NextCursor)
		if !ok {
			t.Fatalf("%s: cursor does not decode", tc.sort)
		}
		if cur.Sort != tc.sort {
			t.Fatalf("%s: cursor sort = %q", tc.sort, cur.Sort)
		}
		if cur.Key != tc.wantKey {
			t.Fatalf("%s: cursor key = %q, want %q — the key must be the SORT column's value, "+
				"not the timestamp", tc.sort, cur.Key, tc.wantKey)
		}
	}
}
