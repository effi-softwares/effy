package storefront

import (
	"context"
	"errors"
	"testing"
)

// 028 T037/T037a — what Home says about promotions, and what it promises about rails.
//
// ⚠ The VISIBILITY predicate itself (window, exhaustion, status, opt-in) lives in ONE SQL statement in
// the repository and is proved live in quickstart §4, not here: a fake cannot evaluate `now()` or count
// promo_redemption rows. What these tests pin is everything the SERVICE does with what it is handed —
// the composition, the terms sentence, the ordering, and the failure behaviour — plus the two rail
// guarantees this feature inherits and would otherwise leave unasserted.

func advertised(id, title string, position int, minimum string) advertisedPromoRow {
	return advertisedPromoRow{
		ID:              id,
		Code:            "CODE" + id,
		Title:           title,
		Position:        position,
		MinimumSubtotal: minimum,
		Currency:        "AUD",
	}
}

func TestBannersComposeFromAdvertisedPromotions(t *testing.T) {
	repo := &fakeReader{
		newest: []cardRow{card("p1", "Milk", nil, 1, strptr("k1"))},
		promos: []advertisedPromoRow{advertised("a", "20% off your first order", 1, "30.00")},
	}
	home, err := NewService(repo, fakePresign{}).Home(context.Background())
	if err != nil {
		t.Fatalf("Home: %v", err)
	}

	if len(home.Banners) != 1 {
		t.Fatalf("want 1 banner, got %d", len(home.Banners))
	}
	b := home.Banners[0]
	if b.Key != "a" {
		t.Errorf("banner key must be the promotion id (clients use it as a list key), got %q", b.Key)
	}
	if b.Title != "20% off your first order" {
		t.Errorf("title = %q", b.Title)
	}
	if b.Code == nil || *b.Code != "CODEa" {
		t.Errorf("the code must reach the shopper — a banner they cannot act on is decoration")
	}
	if b.Position != 1 {
		t.Errorf("position = %d, want 1", b.Position)
	}
	if b.Target == nil || b.Target.Kind != "search" {
		t.Errorf("every banner needs a target reachable elsewhere in the app (FR-034)")
	}
}

func TestBannerTermsStateAMinimumAndOmitWhenThereIsNone(t *testing.T) {
	cases := []struct {
		name    string
		minimum string
		want    string // "" means the terms line must be absent
	}{
		{"a real minimum becomes a sentence", "30.00", "On orders over $30.00"},
		{"zero is not a condition", "0.00", ""},
		{"an unparseable amount states nothing rather than something wrong", "not-a-number", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeReader{
				newest: []cardRow{card("p1", "Milk", nil, 1, nil)},
				promos: []advertisedPromoRow{advertised("a", "Save now", 0, tc.minimum)},
			}
			home, err := NewService(repo, fakePresign{}).Home(context.Background())
			if err != nil {
				t.Fatalf("Home: %v", err)
			}
			got := home.Banners[0].Terms
			if tc.want == "" {
				if got != nil {
					// An empty or bogus terms line reads as a rule the shopper failed to understand.
					t.Fatalf("want no terms sentence, got %q", *got)
				}
				return
			}
			if got == nil || *got != tc.want {
				t.Fatalf("terms = %v, want %q", got, tc.want)
			}
		})
	}
}

func TestBannersPreserveRepositoryOrder(t *testing.T) {
	repo := &fakeReader{
		newest: []cardRow{card("p1", "Milk", nil, 1, nil)},
		promos: []advertisedPromoRow{
			advertised("first", "First", 0, "0"),
			advertised("second", "Second", 2, "0"),
		},
	}
	home, _ := NewService(repo, fakePresign{}).Home(context.Background())

	// The repository ORDER BY is the operator's declared order. Re-sorting here would mean two places
	// decide banner order and they would eventually disagree.
	if home.Banners[0].Key != "first" || home.Banners[1].Key != "second" {
		t.Fatalf("banner order not preserved: %+v", home.Banners)
	}
}

func TestBannerSurvivesAPresignFailure(t *testing.T) {
	promo := advertised("a", "Save now", 0, "0")
	key := "banner-key"
	promo.ImageKey = &key

	repo := &fakeReader{
		newest: []cardRow{card("p1", "Milk", nil, 1, nil)},
		promos: []advertisedPromoRow{promo},
	}
	home, err := NewService(repo, failingPresign{}).Home(context.Background())
	if err != nil {
		t.Fatalf("Home: %v", err)
	}

	// A promotion the shopper could have used must not vanish because an image could not be signed.
	if len(home.Banners) != 1 {
		t.Fatalf("want the banner to survive a presign failure, got %d", len(home.Banners))
	}
	if home.Banners[0].ImageURL != nil {
		t.Errorf("a failed presign must drop the artwork, not emit a broken URL")
	}
}

func TestHomeFailsWhenPromotionsCannotBeRead(t *testing.T) {
	repo := &fakeReader{
		newest:   []cardRow{card("p1", "Milk", nil, 1, nil)},
		promoErr: errors.New("db down"),
	}
	if _, err := NewService(repo, fakePresign{}).Home(context.Background()); err == nil {
		// Silently returning a bannerless Home would hide a broken database behind a page that looks
		// merely unpromoted — the operator would have no signal at all.
		t.Fatal("a promotion read failure must surface, not degrade into an empty banner list")
	}
}

// ── Rail guarantees this feature INHERITS (028 T037a) ───────────────────────────────────────────
//
// FR-021 and FR-023 are properties of the existing Home composition rather than anything 028 adds.
// That is exactly why they are pinned here: an inherited guarantee that nothing asserts is one that
// can be removed later without a single test going red.

func TestNoProductAppearsTwiceWithinOneRail(t *testing.T) {
	repo := &fakeReader{
		newest: []cardRow{
			card("p1", "Milk", nil, 1, nil),
			card("p2", "Bread", nil, 2, nil),
		},
	}
	home, _ := NewService(repo, fakePresign{}).Home(context.Background())

	for _, rail := range home.Rails {
		seen := map[string]bool{}
		for _, p := range rail.Products {
			if seen[p.ID] {
				t.Fatalf("rail %q shows product %q twice (FR-021)", rail.Key, p.ID)
			}
			seen[p.ID] = true
		}
	}
}

func TestRailsCarryOnlyAvailableProducts(t *testing.T) {
	repo := &fakeReader{
		newest: []cardRow{card("p1", "Milk", nil, 1, nil)},
		onSale: []cardRow{card("p2", "Bread", strptr("4.00"), 2, nil)},
	}
	home, _ := NewService(repo, fakePresign{}).Home(context.Background())

	for _, rail := range home.Rails {
		for _, p := range rail.Products {
			if !p.Available {
				t.Fatalf("rail %q offers unavailable product %q (FR-023)", rail.Key, p.ID)
			}
		}
	}
}

// failingPresign stands in for an S3 signer that is having a bad day.
type failingPresign struct{}

func (failingPresign) PresignGet(_ context.Context, _ string) (string, error) {
	return "", errors.New("presign unavailable")
}
