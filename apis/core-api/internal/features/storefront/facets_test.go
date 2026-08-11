package storefront

import (
	"context"
	"testing"
)

func opt(value, label string, n int) optionCountRow {
	return optionCountRow{Value: value, Label: label, Count: n}
}

// ── Own-selection exclusion (FR-008/FR-010) ─────────────────────────────────────────────────────

// Each facet's options are counted with THAT facet's own selection cleared, but every OTHER applied
// filter intact — so ticking one brand still shows the other brands' counts.
func TestFacets_ExcludesOwnSelectionButKeepsOthers(t *testing.T) {
	repo := &fakeReader{
		facetDefs:      []attrDefRow{{Key: "diet", Name: "Dietary", DataType: "multi_select"}},
		brandCounts:    []optionCountRow{opt("Acme", "Acme", 3)},
		categoryCounts: []optionCountRow{opt("dairy", "Dairy", 5)},
		attrCounts:     map[string][]optionCountRow{"diet": {opt("vegan", "Vegan", 2)}},
	}
	svc := NewService(repo, fakePresign{})

	_, err := svc.Facets(context.Background(), SearchQuery{
		CategoryKey: "dairy",
		Brands:      []string{"Acme"},
		Attributes:  map[string][]string{"diet": {"vegan"}},
	})
	if err != nil {
		t.Fatalf("Facets: %v", err)
	}

	// Brand facet: its own selection cleared, category kept.
	if len(repo.lastBrandParams.Brands) != 0 {
		t.Fatalf("brand counts must exclude brand selection, got %v", repo.lastBrandParams.Brands)
	}
	if repo.lastBrandParams.CategoryKey != "dairy" {
		t.Fatalf("brand counts must keep other filters, categoryKey=%q", repo.lastBrandParams.CategoryKey)
	}
	// Category facet: its own selection cleared, brand kept.
	if repo.lastCategoryParams.CategoryKey != "" {
		t.Fatalf("category counts must exclude category selection, got %q", repo.lastCategoryParams.CategoryKey)
	}
	if len(repo.lastCategoryParams.Brands) != 1 {
		t.Fatalf("category counts must keep brand filter, got %v", repo.lastCategoryParams.Brands)
	}
	// Attribute facet: its own key cleared, brand kept.
	if _, present := repo.lastAttrParams["diet"].Attributes["diet"]; present {
		t.Fatalf("attribute counts must exclude that attribute's own selection")
	}
	if len(repo.lastAttrParams["diet"].Brands) != 1 {
		t.Fatalf("attribute counts must keep brand filter, got %v", repo.lastAttrParams["diet"].Brands)
	}
}

// ── Assembly: fixed order, empty facets and price bounds ─────────────────────────────────────────

func TestFacets_AssemblesInOrderAndOmitsEmpty(t *testing.T) {
	lo, hi := "1.50", "89.00"
	repo := &fakeReader{
		facetDefs:      []attrDefRow{{Key: "diet", Name: "Dietary", DataType: "multi_select"}},
		categoryCounts: nil, // empty → the category facet must be omitted
		brandCounts:    []optionCountRow{opt("Acme", "Acme", 3), opt("Beta", "Beta", 1)},
		attrCounts:     map[string][]optionCountRow{"diet": {opt("vegan", "Vegan", 2)}},
		priceLo:        &lo,
		priceHi:        &hi,
	}
	svc := NewService(repo, fakePresign{})

	fs, err := svc.Facets(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Facets: %v", err)
	}

	if fs.PriceBounds == nil || fs.PriceBounds.Min != "1.50" || fs.PriceBounds.Max != "89.00" {
		t.Fatalf("price bounds = %+v, want 1.50..89.00", fs.PriceBounds)
	}
	if len(fs.Facets) != 2 {
		t.Fatalf("want 2 facets (brand, Dietary; category omitted), got %d: %+v", len(fs.Facets), fs.Facets)
	}
	if fs.Facets[0].Key != "brand" || fs.Facets[0].Type != "multi_select" {
		t.Fatalf("first facet = %+v, want brand/multi_select", fs.Facets[0])
	}
	if fs.Facets[1].Key != "diet" || fs.Facets[1].Label != "Dietary" {
		t.Fatalf("second facet = %+v, want diet/Dietary", fs.Facets[1])
	}
}

func TestFacets_NilPriceBoundsWhenEmpty(t *testing.T) {
	repo := &fakeReader{facetDefs: nil} // nothing staged, no price
	svc := NewService(repo, fakePresign{})

	fs, err := svc.Facets(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Facets: %v", err)
	}
	if fs.PriceBounds != nil {
		t.Fatalf("empty set must have nil price bounds, got %+v", fs.PriceBounds)
	}
	if len(fs.Facets) != 0 {
		t.Fatalf("empty set must have no facets, got %+v", fs.Facets)
	}
}

// ── FR-009: no offered option leads to an empty page ────────────────────────────────────────────

// A zero-count option must be dropped from the response, and a facet left with no non-zero options
// must be omitted entirely — the UI-facing guarantee that no offered option is a dead end.
func TestFacets_OmitsZeroCountOptionsAndEmptyFacets(t *testing.T) {
	repo := &fakeReader{
		facetDefs: []attrDefRow{
			{Key: "diet", Name: "Dietary", DataType: "multi_select"},
			{Key: "size", Name: "Size", DataType: "single_select"},
		},
		// Brand: one live option, one that (defensively) arrived with a zero count — it must not ship.
		brandCounts: []optionCountRow{opt("Acme", "Acme", 5), opt("Ghost", "Ghost", 0)},
		attrCounts: map[string][]optionCountRow{
			"diet": {opt("vegan", "Vegan", 3)},
			// Size's only option is zero-count → the whole Size facet must be omitted.
			"size": {opt("xl", "XL", 0)},
		},
	}
	svc := NewService(repo, fakePresign{})

	fs, err := svc.Facets(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Facets: %v", err)
	}

	byKey := map[string]Facet{}
	for _, f := range fs.Facets {
		byKey[f.Key] = f
	}
	brand, ok := byKey["brand"]
	if !ok {
		t.Fatal("brand facet missing")
	}
	for _, o := range brand.Options {
		if o.Value == "Ghost" || o.Count == 0 {
			t.Fatalf("a zero-count option was offered: %+v", o)
		}
	}
	if len(brand.Options) != 1 {
		t.Fatalf("brand should have exactly its one live option, got %+v", brand.Options)
	}
	if _, present := byKey["size"]; present {
		t.Fatal("a facet whose only option is zero-count must be omitted")
	}
	if _, present := byKey["diet"]; !present {
		t.Fatal("the Dietary facet with a live option must be present")
	}
}

// A boolean facet's 'true'/'false' values render as Yes/No.
func TestFacets_BooleanValuesRenderYesNo(t *testing.T) {
	repo := &fakeReader{
		facetDefs:  []attrDefRow{{Key: "organic", Name: "Organic", DataType: "boolean"}},
		attrCounts: map[string][]optionCountRow{"organic": {opt("true", "true", 4), opt("false", "false", 9)}},
	}
	svc := NewService(repo, fakePresign{})

	fs, err := svc.Facets(context.Background(), SearchQuery{})
	if err != nil {
		t.Fatalf("Facets: %v", err)
	}
	if len(fs.Facets) != 1 {
		t.Fatalf("want 1 facet, got %d", len(fs.Facets))
	}
	labels := map[string]string{}
	for _, o := range fs.Facets[0].Options {
		labels[o.Value] = o.Label
	}
	if labels["true"] != "Yes" || labels["false"] != "No" {
		t.Fatalf("boolean labels = %v, want true→Yes false→No", labels)
	}
}

// ── Multi-value facets reach the repository intact (043 FR-003) ──────────────────────────────────

func TestSearch_MultiValueFacetsReachRepository(t *testing.T) {
	repo := &fakeReader{search: []searchRow{searchRowOf(card("p1", "One", nil, 1, nil))}}
	svc := NewService(repo, fakePresign{})

	_, err := svc.Search(context.Background(), SearchQuery{
		Brands:     []string{"Acme", "Beta"},
		Attributes: map[string][]string{"diet": {"vegan", "gluten_free"}},
	})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(repo.lastParams.Brands) != 2 {
		t.Fatalf("brands did not reach the repository: %v", repo.lastParams.Brands)
	}
	if got := repo.lastParams.Attributes["diet"]; len(got) != 2 {
		t.Fatalf("multi-value attribute did not reach the repository: %v", got)
	}
}
