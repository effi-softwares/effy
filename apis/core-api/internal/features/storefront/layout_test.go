package storefront

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

// The omission rules are the whole of this layer's behaviour, and each one is a SILENT success path:
// the page renders, nothing errors, and a section is simply not there. These tests are the only place
// that behaviour is observable at all.

func rawBody(t *testing.T, blocks ...map[string]any) []byte {
	t.Helper()
	b, err := json.Marshal(blocks)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	return b
}

func TestDecodeLayout_EmptyBodyIsNotAnError(t *testing.T) {
	// A freshly migrated environment, or one whose layout was never seeded, must render the coherent
	// minimal page rather than fail the storefront (SC-013).
	got, err := decodeLayout(nil)
	if err != nil {
		t.Fatalf("empty body should not error, got %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no blocks, got %d", len(got))
	}
}

func TestDecodeLayout_MalformedBodyErrorsRatherThanPanics(t *testing.T) {
	// Defence against a hand-edited row. The column has a CHECK requiring an array, so this is not an
	// expected path — but "the storefront 500s because somebody ran an UPDATE" is not acceptable on
	// the platform's only public surface.
	if _, err := decodeLayout([]byte(`{"not":"an array"}`)); err == nil {
		t.Fatal("expected an error for a non-array body")
	}
}

func TestResolveBlocks_HiddenBlocksNeverReachTheWire(t *testing.T) {
	// ⚠ Dropped SERVER-side. Filtering on the client would ship unpublished merchandising to every
	// shopper and trust the client not to render it.
	raw, err := decodeLayout(rawBody(t,
		map[string]any{"id": "a", "type": "app_promo", "props": map[string]any{}},
		map[string]any{"id": "b", "type": "newsletter", "hidden": true, "props": map[string]any{}},
	))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	blocks, omitted := resolveBlocks(raw, nil)

	if len(blocks) != 1 || blocks[0].ID != "a" {
		t.Fatalf("expected only the visible block, got %+v", blocks)
	}
	// A hidden block is not an omission — it is a deliberate authoring state, and counting it would
	// make the omission metric fire on healthy layouts.
	if len(omitted) != 0 {
		t.Fatalf("hiding a block must not be reported as an omission, got %+v", omitted)
	}
}

func TestResolveBlocks_UnknownTypeIsDroppedNotFatal(t *testing.T) {
	// The case that happens when a layout published by a newer deploy is read by an older one.
	raw, _ := decodeLayout(rawBody(t,
		map[string]any{"id": "a", "type": "from_the_future", "props": map[string]any{}},
		map[string]any{"id": "b", "type": "app_promo", "props": map[string]any{}},
	))

	blocks, omitted := resolveBlocks(raw, nil)

	if len(blocks) != 1 || blocks[0].Type != "app_promo" {
		t.Fatalf("the known block must still render, got %+v", blocks)
	}
	if len(omitted) != 1 || omitted[0].Reason != OmitUnknownType {
		t.Fatalf("expected one unknown_type omission, got %+v", omitted)
	}
}

func TestResolveBlocks_RailWithoutItsReferenceIsDropped(t *testing.T) {
	// Publish-time validation cannot prevent this: the rail existed when it was published.
	raw, _ := decodeLayout(rawBody(t,
		map[string]any{"id": "a", "type": "product_rail", "props": map[string]any{"railKey": "gone"}},
	))

	blocks, omitted := resolveBlocks(raw, map[string]Rail{})

	if len(blocks) != 0 {
		t.Fatalf("a rail with no source must not render, got %+v", blocks)
	}
	if len(omitted) != 1 || omitted[0].Reason != OmitMissingReference {
		t.Fatalf("expected missing_reference, got %+v", omitted)
	}
}

func TestResolveBlocks_EmptyRailSelfHides(t *testing.T) {
	// ⚠ A heading above blank space is exactly the empty frame the degradation rule exists to
	// prevent — and the defect 028 shipped, where four rails rendered four headings over nothing.
	raw, _ := decodeLayout(rawBody(t,
		map[string]any{"id": "a", "type": "product_rail", "props": map[string]any{"railKey": "on_sale"}},
	))

	blocks, omitted := resolveBlocks(raw, map[string]Rail{"on_sale": {Key: "on_sale"}})

	if len(blocks) != 0 {
		t.Fatalf("an empty rail must self-hide, got %+v", blocks)
	}
	if len(omitted) != 1 {
		t.Fatalf("expected the empty rail to be counted, got %+v", omitted)
	}
}

func TestResolveBlocks_RailPropsThatDoNotParseAreDropped(t *testing.T) {
	raw, _ := decodeLayout([]byte(`[{"id":"a","type":"product_rail","props":{"railKey":123}}]`))

	blocks, omitted := resolveBlocks(raw, map[string]Rail{})

	if len(blocks) != 0 {
		t.Fatalf("unreadable props must not render, got %+v", blocks)
	}
	if len(omitted) != 1 || omitted[0].Reason != OmitInvalidProps {
		t.Fatalf("expected invalid_props, got %+v", omitted)
	}
}

func TestResolveBlocks_OrderIsArrayOrder(t *testing.T) {
	// ⚠ The correction at the heart of the feature. `banner_position` exists today, is authored,
	// stored and transmitted — and IGNORED by the web surface, which slices by array index. One
	// ordering mechanism cannot disagree with itself.
	raw, _ := decodeLayout(rawBody(t,
		map[string]any{"id": "c", "type": "newsletter", "props": map[string]any{}},
		map[string]any{"id": "a", "type": "app_promo", "props": map[string]any{}},
		map[string]any{"id": "b", "type": "value_strip", "props": map[string]any{}},
	))

	blocks, _ := resolveBlocks(raw, nil)

	got := []string{blocks[0].ID, blocks[1].ID, blocks[2].ID}
	want := []string{"c", "a", "b"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order must be array order: got %v want %v", got, want)
		}
	}
}

func TestKnownBlockTypes_MatchesTheSharedCatalogue(t *testing.T) {
	// ⚠ This list is the ONE place the catalogue is restated in Go, which is a cost recorded rather
	// than hidden (Principle II). Until the generated catalogue exists, this test is what keeps the
	// two in step — so it is written against the TS catalogue's contents, not against this map.
	want := []string{
		"hero", "category_strip", "product_rail", "offers",
		"value_strip", "app_promo", "newsletter", "recently_viewed",
	}
	if len(knownBlockTypes) != len(want) {
		t.Fatalf("catalogue drift: Go knows %d types, shared-types declares %d", len(knownBlockTypes), len(want))
	}
	for _, w := range want {
		if _, ok := knownBlockTypes[w]; !ok {
			t.Fatalf("catalogue drift: Go is missing %q", w)
		}
	}
	// ⚠ `hero` was deliberately absent until 2026-08-09, when T008c concluded the two-hero comparison:
	// the promotions-driven carousel won and both static heroes were deleted. The guard that used to
	// keep it out now keeps it IN, because the storefront has no other hero to fall back to — dropping
	// it from this map would silently blank the top of the home page.
	if _, ok := knownBlockTypes["hero"]; !ok {
		t.Fatal("hero is the storefront's only hero — omitting it here blanks the top of the page")
	}
}

// ── Home() end to end, through the service ──────────────────────────────────────────────────────
//
// The tests above prove the resolution rules in isolation. These prove the rules are actually
// REACHED — that the layout read is wired into the composed page, that a rail block finds the rails
// this same request produced, and that the two states where nothing was published behave as though
// the feature does not exist.

func homeWithLayout(t *testing.T, published string, found bool) Home {
	t.Helper()
	repo := &fakeReader{
		newest: []cardRow{card("p1", "Milk", nil, 1, strptr("k1"))},
		onSale: []cardRow{card("p2", "Bread", strptr("3.00"), 40, nil)},
		// ⚠ A blank layoutFound/layout pair on the fake means "no row", which is what every test
		// written before this feature is implicitly asserting against.
		layout:      homeLayoutRow{Published: []byte(published)},
		layoutFound: found,
	}
	home, err := NewService(repo, fakePresign{}).Home(context.Background())
	if err != nil {
		t.Fatalf("Home: %v", err)
	}
	return home
}

func TestHome_WithNoPublishedLayoutIsExactlyTheOldPage(t *testing.T) {
	// ⚠ THE MOST IMPORTANT TEST IN THIS FILE, because it is what makes shipping this safe. Until an
	// operator publishes, the storefront must compose the page the way it always has — the switch to
	// a data-composed page is invisible to shoppers rather than a cutover with a moment of risk.
	home := homeWithLayout(t, "", false)
	if len(home.Blocks) != 0 {
		t.Fatalf("no published layout must yield no blocks, got %+v", home.Blocks)
	}
	if len(home.Rails) != 2 {
		t.Fatalf("the rails must be composed exactly as before, got %v", railKeys(home.Rails))
	}
}

func TestHome_ResolvesARailBlockAgainstThisRequestsOwnRails(t *testing.T) {
	home := homeWithLayout(t, `[{"id":"b1","type":"product_rail","props":{"railKey":"on_sale"}}]`, true)
	if len(home.Blocks) != 1 {
		t.Fatalf("want 1 block, got %d: %+v", len(home.Blocks), home.Blocks)
	}
	if home.Blocks[0].Rail == nil {
		t.Fatal("the rail block resolved to no rail — the block would render as a heading over nothing")
	}
	if home.Blocks[0].Rail.Key != "on_sale" || len(home.Blocks[0].Rail.Products) != 1 {
		t.Fatalf("the block carries the wrong rail: %+v", home.Blocks[0].Rail)
	}
}

func TestHome_ARailBlockNamingARailThisStoreCannotFillIsDropped(t *testing.T) {
	// The reference was valid when it was published; the category has since sold out or been
	// delisted. Publish-time validation cannot prevent this, which is why it is a READ-time rule.
	home := homeWithLayout(t, `[{"id":"b1","type":"product_rail","props":{"railKey":"category:gone"}}]`, true)
	if len(home.Blocks) != 0 {
		t.Fatalf("a rail with no content must be dropped, not rendered empty: %+v", home.Blocks)
	}
	if len(home.Rails) != 2 {
		t.Fatal("dropping a block must not disturb the rails themselves")
	}
}

func TestHome_AnUnreadableLayoutServesThePageAnyway(t *testing.T) {
	// ⚠ A hand-edited row must not be able to take down the platform's only public surface. The page
	// loses its operator ordering and keeps everything else — the same degradation rule as a single
	// bad block, applied to the whole body.
	home := homeWithLayout(t, `{"not":"an array"}`, true)
	if len(home.Blocks) != 0 {
		t.Fatalf("an unreadable layout must yield no blocks, got %+v", home.Blocks)
	}
	if len(home.Rails) != 2 {
		t.Fatalf("the rest of the page must still be served, got %v", railKeys(home.Rails))
	}
}

// ── HomeLayout(): the structure-only read the storefront caches ─────────────────────────────────

func layoutOnly(t *testing.T, published string, found bool) HomeLayout {
	t.Helper()
	repo := &fakeReader{layout: homeLayoutRow{Published: []byte(published), Revision: 7}, layoutFound: found}
	got, err := NewService(repo, fakePresign{}).HomeLayout(context.Background())
	if err != nil {
		t.Fatalf("HomeLayout: %v", err)
	}
	return got
}

func TestHomeLayout_KeepsARailBlockThatTheCombinedReadWouldDrop(t *testing.T) {
	// ⚠ THE ONE DIFFERENCE BETWEEN THE TWO ANSWERS, asserted rather than left to be discovered.
	//
	// The structure read knows nothing about stock, so it cannot decide whether a rail can be filled —
	// and it must not try, because the web surface fetches that content separately and the rail
	// component self-hides when it arrives empty. If this read started dropping rail blocks, every
	// rail would vanish from the storefront: this endpoint passes no rails, so every one of them
	// would look like a missing reference.
	got := layoutOnly(t, `[{"id":"b1","type":"product_rail","props":{"railKey":"on_sale"}}]`, true)
	if len(got.Blocks) != 1 {
		t.Fatalf("the structure read must keep rail blocks, got %+v", got.Blocks)
	}
	if got.Blocks[0].Rail != nil {
		t.Fatal("the structure read must attach no content — that is what makes it cacheable")
	}
}

func TestHomeLayout_StillDropsHiddenAndUnknownBlocks(t *testing.T) {
	got := layoutOnly(t, `[
		{"id":"a","type":"newsletter","hidden":true,"props":{}},
		{"id":"b","type":"from_a_newer_deploy","props":{}},
		{"id":"c","type":"app_promo","props":{}}
	]`, true)
	if len(got.Blocks) != 1 || got.Blocks[0].ID != "c" {
		t.Fatalf("want only the app_promo block, got %+v", got.Blocks)
	}
}

func TestHomeLayout_NothingPublishedIsAnEmptyAnswerNotAFailure(t *testing.T) {
	got := layoutOnly(t, "", false)
	if len(got.Blocks) != 0 || got.Revision != 0 {
		t.Fatalf("want an empty layout at revision 0, got %+v", got)
	}
}

func TestHomeLayout_ReportsTheRevisionSoCallersCanTellStatesApart(t *testing.T) {
	got := layoutOnly(t, `[{"id":"c","type":"app_promo","props":{}}]`, true)
	if got.Revision != 7 {
		t.Fatalf("revision = %d, want 7", got.Revision)
	}
}

func TestHomeLayout_AnUnreadableBodyYieldsAnEmptyStructureRatherThanAnError(t *testing.T) {
	got := layoutOnly(t, `{"not":"an array"}`, true)
	if len(got.Blocks) != 0 {
		t.Fatalf("want no blocks from an unreadable body, got %+v", got.Blocks)
	}
	if got.Revision != 7 {
		t.Fatal("the revision is still known even when the body is not — the caller needs it to " +
			"recognise that a later publish has replaced the bad row")
	}
}

// ⚠ THE TEST FOR THE WINDOW THIS FEATURE OPENS ON ITSELF.
//
// 042's migration is an operator step. Between the code deploying and `make db-up` running,
// `public.home_layout` does not exist and Postgres answers 42P01 to every read of it. If that error
// propagated, the platform's ONLY PUBLIC SURFACE would 503 for the whole of that window — a feature
// taking down the storefront on the way in, before it has rendered a single block.
//
// It is also the shape of failure that looks least like itself in production: the storefront is down,
// and the change that broke it did not touch the storefront.

type layoutFailingReader struct{ fakeReader }

func (f *layoutFailingReader) PublishedLayout(_ context.Context) (homeLayoutRow, bool, error) {
	return homeLayoutRow{}, false, errors.New(`ERROR: relation "public.home_layout" does not exist (SQLSTATE 42P01)`)
}

func TestHome_SurvivesTheLayoutTableNotExistingYet(t *testing.T) {
	repo := &layoutFailingReader{fakeReader{
		newest: []cardRow{card("p1", "Milk", nil, 1, strptr("k1"))},
		onSale: []cardRow{card("p2", "Bread", strptr("3.00"), 40, nil)},
	}}

	home, err := NewService(repo, fakePresign{}).Home(context.Background())
	if err != nil {
		t.Fatalf("a failed layout read must never fail the home page: %v", err)
	}
	if len(home.Rails) != 2 {
		t.Fatalf("the page must be served in full without its ordering, got %v", railKeys(home.Rails))
	}
	if len(home.Blocks) != 0 {
		t.Fatalf("want no blocks when the layout could not be read, got %+v", home.Blocks)
	}
}

func TestHomeLayout_SurvivesTheLayoutTableNotExistingYet(t *testing.T) {
	// ⚠ Worse here than in Home(). This endpoint feeds the storefront's CACHED read, so an error does
	// not lose one section — it throws inside the page's cached render and takes the page with it.
	got, err := NewService(&layoutFailingReader{}, fakePresign{}).HomeLayout(context.Background())
	if err != nil {
		t.Fatalf("a failed layout read must never fail the structure endpoint: %v", err)
	}
	if len(got.Blocks) != 0 {
		t.Fatalf("want an empty structure, got %+v", got.Blocks)
	}
}
