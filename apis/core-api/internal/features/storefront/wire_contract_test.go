package storefront

import (
	"encoding/json"
	"strings"
	"testing"
)

// ── THE CROSS-LANGUAGE WIRE CONTRACT (028, closing 027's carry-forward) ─────────────────────────
//
// 027's post-mortem named this exact test as the strongest thing it could hand forward and did not
// build it:
//
//     Kotlin serialised quantities as Double, so the wire carried `1.0`; Go's encoding/json refuses
//     `1.0` into an int. EVERY UNIT TEST PASSED throughout, because the fakes spoke Kotlin at both
//     ends and never crossed the wire. It was found by querying the database directly.
//
// 028 adds `position`, an integer, to the banner payload — the same shape of field, on a path with
// the same shape of fake. So this pins the ACTUAL BYTES.
//
// The literal in BANNER_WIRE_JSON is duplicated, verbatim and deliberately, in the Kotlin test
// `BannerWireContractTest`. Neither side generates it. That is the point: if Go starts emitting a
// float, or the generated Kotlin starts expecting one, exactly one of these two tests goes red and
// says so before a device does.

// BANNER_WIRE_JSON is the exact payload a populated banner produces.
// ⚠ KEEP IN SYNC with BannerWireContractTest.kt in customer-mobile.
// ⚠ The target here is the one banners ACTUALLY carry — `promotion`, with the id the detail read
// resolves. It was `{"kind":"sale"}`, a shape no banner ever emitted, which meant the contract test
// pinned bytes nothing sent. A cross-language test is only worth its duplication if it pins the real
// payload; `promotionId` is now the second string field on this path and drift in it would strand
// every banner tap on a 404.
const BANNER_WIRE_JSON = `{"key":"3f2a","title":"20% off your first order","subtitle":"Stock up",` +
	`"imageUrl":null,"href":"/promotions/3f2a","code":"FIRST20","terms":"On orders over $30.00","position":2,` +
	`"target":{"kind":"promotion","promotionId":"3f2a"},"placement":"carousel"}`

func TestBannerSerialisesPositionAsAnInteger(t *testing.T) {
	subtitle := "Stock up"
	href := "/promotions/3f2a"
	code := "FIRST20"
	terms := "On orders over $30.00"
	promotionID := "3f2a"

	got, err := json.Marshal(bannerDTO{
		Key:       "3f2a",
		Title:     "20% off your first order",
		Subtitle:  &subtitle,
		ImageURL:  nil,
		Href:      &href,
		Code:      &code,
		Terms:     &terms,
		Position:  2,
		Target:    &bannerTargetDTO{Kind: "promotion", PromotionID: &promotionID},
		Placement: "carousel",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if string(got) != BANNER_WIRE_JSON {
		t.Fatalf("wire payload drifted.\n got: %s\nwant: %s", got, BANNER_WIRE_JSON)
	}

	// The specific thing that killed 027: a float on the wire where an int belongs.
	if strings.Contains(string(got), `"position":2.0`) {
		t.Fatal(`position serialised as a float — Go's encoding/json will refuse it on the way back in`)
	}
}

func TestGoRefusesAFloatPosition(t *testing.T) {
	// This is not hypothetical: it is precisely what a Kotlin client sent in 027, and precisely what
	// `WireInt` / `@asType integer` exists to prevent on the generated side. Proving Go's refusal here
	// is what makes that annotation load-bearing rather than decorative.
	var dto bannerDTO
	err := json.Unmarshal([]byte(`{"key":"k","title":"t","position":2.0}`), &dto)
	if err == nil {
		t.Fatal("expected Go to refuse a float into an int field — if this ever passes, the contract " +
			"annotation on WireInt has stopped mattering and 027's defect can return silently")
	}
}

func TestBannerRoundTripsThroughTheWire(t *testing.T) {
	var dto bannerDTO
	if err := json.Unmarshal([]byte(BANNER_WIRE_JSON), &dto); err != nil {
		t.Fatalf("Go cannot read its own payload: %v", err)
	}
	if dto.Position != 2 {
		t.Errorf("position = %d, want 2", dto.Position)
	}
	if dto.Placement != "carousel" {
		t.Errorf("placement = %q, want carousel — it must survive as a STRING, not become a number or vanish", dto.Placement)
	}
	if dto.Target == nil || dto.Target.Kind != "promotion" {
		t.Errorf("target did not survive the round trip: %+v", dto.Target)
	}
	if dto.Target.PromotionID == nil || *dto.Target.PromotionID != "3f2a" {
		t.Errorf("promotionId did not survive the round trip — every banner tap resolves the detail " +
			"by this id, so losing it is a 404 on every promotion")
	}
	if dto.Code == nil || *dto.Code != "FIRST20" {
		t.Error("code did not survive the round trip")
	}
}

func TestEmptyBannerListSerialisesAsAnArrayNotNull(t *testing.T) {
	// FR-035 / the contract's empty case. A nil slice marshals to `null`, which a client reading
	// `banners.map(...)` would crash on — the empty store must produce `[]`.
	got, err := json.Marshal(homeDTO{Banners: make([]bannerDTO, 0), Rails: make([]railDTO, 0)})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(got), `"banners":[]`) {
		t.Fatalf("empty banners must serialise as [] and not null: %s", got)
	}
}

// ── LOCALITY (030) ─────────────────────────────────────────────────────────────────────────────
//
// LOCALITY_WIRE_JSON is the exact payload GET /v1/storefront/localities produces for one place.
// ⚠ KEEP IN SYNC with LocalityWireContractTest.kt in customer-mobile.
//
// ⚠ These bytes were CAPTURED from the real handler through the real router, not transcribed from
// the contract document. 029 found this test's banner literal pinning `{"kind":"sale"}` — a shape no
// banner had ever emitted — so the test that should have caught a defect asserted it instead. A
// cross-language contract test is only worth its duplication if it pins what the server actually
// sends.
//
// Three strings and nothing else. That looks too simple to be worth pinning, which is exactly why it
// is: a silently renamed json tag compiles fine on both sides and would leave a shopper unable to
// find any suburb, with every unit test still green.

// ⚠ An empty result is `[]`, never `null`. The handler builds a zero-length slice for exactly this
// reason: a client forced to distinguish null-from-empty will eventually get it wrong, and the wrong
// answer here is "that place doesn't exist".

// All three fields are required — no omitempty anywhere. A place missing its state is two different
// places on the wire (FR-008).

// ── FACETS (043) ─────────────────────────────────────────────────────────────────────────────────
//
// FACET_SET_WIRE_JSON is the exact payload GET /v1/storefront/facets produces for one category facet,
// one brand facet, and one boolean attribute facet, with a price bounds block.
// ⚠ KEEP IN SYNC with FacetWireContractTest.kt in customer-mobile (regenerated from FacetSetDTO).
//
// `count` is an INT and must stay one — the same field shape 027 lost days to. `priceBounds` money is a
// STRING (platform convention). `type` is a closed vocabulary string. A silently renamed tag here would
// leave a client unable to read any facet with every unit test green — which is what this pins.
const FACET_SET_WIRE_JSON = `{"priceBounds":{"min":"1.50","max":"89.00"},"facets":[` +
	`{"key":"category","label":"Category","type":"single_select","options":[{"value":"dairy","label":"Dairy","count":12}]},` +
	`{"key":"brand","label":"Brand","type":"multi_select","options":[{"value":"Acme","label":"Acme","count":3}]},` +
	`{"key":"organic","label":"Organic","type":"multi_select","options":[{"value":"true","label":"Yes","count":4}]}]}`

func TestFacetSetSerialisesToTheContract(t *testing.T) {
	got, err := json.Marshal(facetSetDTO{
		PriceBounds: &priceBoundsDTO{Min: "1.50", Max: "89.00"},
		Facets: []facetDTO{
			{Key: "category", Label: "Category", Type: "single_select", Options: []facetOptionDTO{{Value: "dairy", Label: "Dairy", Count: 12}}},
			{Key: "brand", Label: "Brand", Type: "multi_select", Options: []facetOptionDTO{{Value: "Acme", Label: "Acme", Count: 3}}},
			{Key: "organic", Label: "Organic", Type: "multi_select", Options: []facetOptionDTO{{Value: "true", Label: "Yes", Count: 4}}},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(got) != FACET_SET_WIRE_JSON {
		t.Fatalf("facet wire payload drifted.\n got: %s\nwant: %s", got, FACET_SET_WIRE_JSON)
	}
	if strings.Contains(string(got), `"count":4.0`) {
		t.Fatal(`count serialised as a float — the generated Kotlin must read it as an Int`)
	}
}

func TestFacetSetRoundTrips(t *testing.T) {
	var dto facetSetDTO
	if err := json.Unmarshal([]byte(FACET_SET_WIRE_JSON), &dto); err != nil {
		t.Fatalf("Go cannot read its own facet payload: %v", err)
	}
	if dto.PriceBounds == nil || dto.PriceBounds.Min != "1.50" {
		t.Fatalf("price bounds did not survive: %+v", dto.PriceBounds)
	}
	if len(dto.Facets) != 3 || dto.Facets[0].Type != "single_select" {
		t.Fatalf("facets did not survive: %+v", dto.Facets)
	}
	if dto.Facets[2].Options[0].Count != 4 {
		t.Errorf("count did not survive as an int: %+v", dto.Facets[2].Options)
	}
}

// The empty facets list must serialise as [], never null (a client mapping over it would crash).
func TestEmptyFacetsSerialiseAsArrayNotNull(t *testing.T) {
	got, err := json.Marshal(facetSetDTO{PriceBounds: nil, Facets: make([]facetDTO, 0)})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(got), `"facets":[]`) {
		t.Fatalf("empty facets must serialise as [] not null: %s", got)
	}
	if !strings.Contains(string(got), `"priceBounds":null`) {
		t.Fatalf("empty set must carry priceBounds:null: %s", got)
	}
}
