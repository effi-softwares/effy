package delivery

import (
	"math"
	"testing"
)

// Reference points, from public.postcode_centroid's source (G-NAF LOCALITY_POINT).
var (
	melbourne = Point{Lat: -37.8142, Lon: 144.9632} // 3000
	ballarat  = Point{Lat: -37.5622, Lon: 143.8503} // 3350
	bendigo   = Point{Lat: -36.7570, Lon: 144.2794} // 3550
	geelong   = Point{Lat: -38.1499, Lon: 144.3617} // 3220
	sydney    = Point{Lat: -33.8688, Lon: 151.2093} // 2000
	perth     = Point{Lat: -31.9523, Lon: 115.8613} // 6000
)

func nearly(t *testing.T, got, want, tolerance float64, what string) {
	t.Helper()
	if math.Abs(got-want) > tolerance {
		t.Errorf("%s: got %.1f km, want %.1f ± %.1f", what, got, want, tolerance)
	}
}

// ⚠ THE CASE THAT MOTIVATED THIS ENTIRE FEATURE (SC-008).
//
// Zone REGIONAL contains both Ballarat and Bendigo, so 031's same-day guard — "is any shop in this
// area's zone?" — permitted same-day delivery to Ballarat from a shop in Bendigo. The check reported
// "a shop is nearby" and carried no information whatsoever, because Melbourne is barely further.
//
// ⚠ A NOTE ON THE NUMBERS. The spec quotes 98 km and 107 km. The 107 was measured from ALFREDTON
// specifically — one locality on Ballarat's western edge — while this test uses the point that will
// actually be stored for postcode 3350, which is the centroid of all twenty of its localities. From
// there Melbourne is ~102 km. Both figures are right about different points, and the argument gets
// STRONGER with the centroid, not weaker: the gap between "a shop in your zone" and "a shop in
// Melbourne" narrows from 9 km to 4.
func TestDistance_BallaratBendigoIsAsFarAsMelbourne(t *testing.T) {
	ballaratBendigo, ok := Distance(&ballarat, &bendigo)
	if !ok {
		t.Fatal("both points are known; want ok")
	}
	ballaratMelbourne, _ := Distance(&ballarat, &melbourne)

	nearly(t, ballaratBendigo, 98, 3, "Ballarat→Bendigo")
	nearly(t, ballaratMelbourne, 102, 3, "Ballarat→Melbourne")

	// ⚠ The whole point: sharing a zone said nothing, because these are comparable distances.
	if math.Abs(ballaratBendigo-ballaratMelbourne) > 20 {
		t.Errorf("expected Bendigo and Melbourne to be comparably far from Ballarat, got %.1f vs %.1f",
			ballaratBendigo, ballaratMelbourne)
	}
}

func TestDistance_KnownAustralianPairs(t *testing.T) {
	cases := []struct {
		name     string
		a, b     Point
		wantKm   float64
		tolerate float64
	}{
		{"Melbourne→Geelong", melbourne, geelong, 64, 3},
		{"Melbourne→Ballarat", melbourne, ballarat, 105, 4},
		{"Melbourne→Bendigo", melbourne, bendigo, 130, 4},
		{"Melbourne→Sydney", melbourne, sydney, 714, 12},
		{"Melbourne→Perth", melbourne, perth, 2721, 40},
	}
	for _, c := range cases {
		got, ok := Distance(&c.a, &c.b)
		if !ok {
			t.Fatalf("%s: want ok", c.name)
		}
		nearly(t, got, c.wantKm, c.tolerate, c.name)
	}
}

func TestDistance_IsSymmetric(t *testing.T) {
	ab, _ := Distance(&melbourne, &perth)
	ba, _ := Distance(&perth, &melbourne)
	if math.Abs(ab-ba) > 0.001 {
		t.Errorf("distance is not symmetric: %v vs %v", ab, ba)
	}
}

func TestDistance_SamePointIsZero(t *testing.T) {
	got, ok := Distance(&melbourne, &melbourne)
	if !ok || got != 0 {
		t.Errorf("got %v (ok=%v), want 0", got, ok)
	}
}

// ⚠ THE MOST IMPORTANT TEST IN THIS FILE.
//
// A missing coordinate must report itself as UNKNOWN, not as zero distance. If it returned (0, true)
// the most remote postcode in the country — the one whose location we happen not to know — would price
// as the very cheapest to deliver to, and nothing anywhere would report a fault. The bool is what
// forces every caller to decide what "unknown" means, and the pricing core answers "furthest band".
func TestDistance_UnknownPointIsNotZero(t *testing.T) {
	for _, c := range []struct {
		name string
		a, b *Point
	}{
		{"origin unknown", nil, &melbourne},
		{"destination unknown", &melbourne, nil},
		{"both unknown", nil, nil},
	} {
		got, ok := Distance(c.a, c.b)
		if ok {
			t.Errorf("%s: want ok=false, got ok=true (%.1f km)", c.name, got)
		}
		if got != 0 {
			continue // the value is meaningless when ok is false; only the flag matters
		}
	}
}
