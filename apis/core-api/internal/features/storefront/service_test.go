package storefront

import (
	"context"
	"testing"
	"time"
)

// fakeReader is a hand-rolled repository fake (the Reader seam) — no DB, no mocks.
type fakeReader struct {
	newest      []cardRow
	onSale      []cardRow
	byCategory  map[string][]cardRow
	candidates  []railCandidate
	byIDs       []cardRow
	cats        []categoryRow
	detail      detailRow
	detailFound bool
	media       []mediaRow
	attrs       []attrRow
	path        []string
	search      []cardRow
}

func (f *fakeReader) NewestCards(_ context.Context, _ int) ([]cardRow, error) { return f.newest, nil }
func (f *fakeReader) OnSaleCards(_ context.Context, _ int) ([]cardRow, error) { return f.onSale, nil }
func (f *fakeReader) CategoryCards(_ context.Context, key string, _ int) ([]cardRow, error) {
	return f.byCategory[key], nil
}
func (f *fakeReader) CardsByIDs(_ context.Context, _ []string) ([]cardRow, error) {
	return f.byIDs, nil
}
func (f *fakeReader) RailCandidates(_ context.Context, _ int) ([]railCandidate, error) {
	return f.candidates, nil
}
func (f *fakeReader) Categories(_ context.Context) ([]categoryRow, error) { return f.cats, nil }
func (f *fakeReader) ProductDetail(_ context.Context, _ string) (detailRow, bool, error) {
	return f.detail, f.detailFound, nil
}
func (f *fakeReader) ProductMedia(_ context.Context, _ string) ([]mediaRow, error) {
	return f.media, nil
}
func (f *fakeReader) ProductAttributes(_ context.Context, _ string) ([]attrRow, error) {
	return f.attrs, nil
}
func (f *fakeReader) CategoryPath(_ context.Context, _ string) ([]string, error) {
	return f.path, nil
}
func (f *fakeReader) SearchCards(_ context.Context, _ SearchParams) ([]cardRow, error) {
	return f.search, nil
}

// fakePresign returns a deterministic signed URL and never errors.
type fakePresign struct{}

func (fakePresign) PresignGet(_ context.Context, key string) (string, error) {
	if key == "" {
		return "", nil
	}
	return "https://signed/" + key, nil
}

func card(id, name string, compareAt *string, ageDays int, key *string) cardRow {
	return cardRow{
		ID:              id,
		Name:            name,
		PriceAmount:     "5.00",
		Currency:        "AUD",
		CompareAtAmount: compareAt,
		StorageKey:      key,
		CreatedAt:       time.Now().Add(-time.Duration(ageDays) * 24 * time.Hour),
	}
}

func strptr(s string) *string { return &s }

func TestHomeComposesNonEmptyRails(t *testing.T) {
	repo := &fakeReader{
		newest:     []cardRow{card("p1", "Milk", nil, 1, strptr("k1"))},
		onSale:     []cardRow{card("p2", "Bread", strptr("3.00"), 40, nil)},
		candidates: []railCandidate{{Key: "dairy", Name: "Dairy"}, {Key: "empty", Name: "Empty"}},
		byCategory: map[string][]cardRow{
			"dairy": {card("p3", "Cheese", nil, 2, strptr("k3"))},
			"empty": {}, // must be omitted
		},
	}
	svc := NewService(repo, fakePresign{})

	home, err := svc.Home(context.Background())
	if err != nil {
		t.Fatalf("Home: %v", err)
	}

	// featured + on_sale + dairy (empty category omitted) = 3 rails.
	if len(home.Rails) != 3 {
		t.Fatalf("want 3 rails, got %d: %+v", len(home.Rails), railKeys(home.Rails))
	}
	if home.Rails[0].Key != "featured" || home.Rails[1].Key != "on_sale" || home.Rails[2].Key != "category:dairy" {
		t.Fatalf("unexpected rail order/keys: %v", railKeys(home.Rails))
	}
	// A welcome banner is present when there is anything to show.
	if len(home.Banners) != 1 || home.Banners[0].Key != "welcome" {
		t.Fatalf("want one welcome banner, got %+v", home.Banners)
	}
	// The featured card's image was presigned.
	if got := home.Rails[0].Products[0].ImageURL; got != "https://signed/k1" {
		t.Fatalf("image not presigned: %q", got)
	}
}

func TestHomeEmptyCatalogHasNoRailsOrBanners(t *testing.T) {
	svc := NewService(&fakeReader{}, fakePresign{})
	home, err := svc.Home(context.Background())
	if err != nil {
		t.Fatalf("Home: %v", err)
	}
	if len(home.Rails) != 0 || len(home.Banners) != 0 {
		t.Fatalf("empty catalog should yield no rails/banners, got %d/%d", len(home.Rails), len(home.Banners))
	}
}

func TestBadgeDerivation(t *testing.T) {
	onSaleNew := deriveBadges(card("a", "A", strptr("9.00"), 1, nil))
	if len(onSaleNew) != 2 || onSaleNew[0] != "on_sale" || onSaleNew[1] != "new" {
		t.Fatalf("want [on_sale new], got %v", onSaleNew)
	}
	oldPlain := deriveBadges(card("b", "B", nil, 90, nil))
	if len(oldPlain) != 0 {
		t.Fatalf("want no badges for an old, full-price product, got %v", oldPlain)
	}
}

func TestCardsByIDsPreservesOrderAndDropsMissing(t *testing.T) {
	repo := &fakeReader{byIDs: []cardRow{
		card("p2", "Two", nil, 1, nil),
		card("p1", "One", nil, 1, nil),
	}}
	svc := NewService(repo, fakePresign{})

	// Ask for p1, p3 (missing), p2 → expect p1, p2 in that order (p3 dropped).
	cards, err := svc.CardsByIDs(context.Background(), []string{"p1", "p3", "p2"})
	if err != nil {
		t.Fatalf("CardsByIDs: %v", err)
	}
	if len(cards) != 2 || cards[0].ID != "p1" || cards[1].ID != "p2" {
		t.Fatalf("want [p1 p2], got %v", cardIDs(cards))
	}
}

func TestSearchPaginatesWithKeysetCursor(t *testing.T) {
	// 25 rows returned for a page size of 24 (limit+1 lookahead) → a nextCursor is minted.
	rows := make([]cardRow, 0, 25)
	for i := range 25 {
		rows = append(rows, card("p"+string(rune('a'+i)), "P", nil, i, nil))
	}
	svc := NewService(&fakeReader{search: rows}, fakePresign{})

	res, err := svc.Search(context.Background(), SearchQuery{Q: "milk"})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(res.Cards) != 24 {
		t.Errorf("want a page of 24, got %d", len(res.Cards))
	}
	if res.NextCursor == nil {
		t.Fatal("want a next cursor when more rows exist")
	}
	// The cursor round-trips.
	if _, _, ok := decodeCursor(*res.NextCursor); !ok {
		t.Errorf("next cursor does not decode: %q", *res.NextCursor)
	}
}

func TestSearchLastPageHasNoCursor(t *testing.T) {
	svc := NewService(&fakeReader{search: []cardRow{card("p1", "One", nil, 1, nil)}}, fakePresign{})
	res, err := svc.Search(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if res.NextCursor != nil {
		t.Errorf("last page should have no cursor, got %q", *res.NextCursor)
	}
}

func railKeys(rails []Rail) []string {
	out := make([]string, len(rails))
	for i, r := range rails {
		out[i] = r.Key
	}
	return out
}

func cardIDs(cards []ProductCard) []string {
	out := make([]string, len(cards))
	for i, c := range cards {
		out[i] = c.ID
	}
	return out
}
