package delivery

import "testing"

// The plan used across the fixtures (contracts/fee-engine.contract.md):
// step 0.50, floor 4.00, cap 40.00; standard ×1.0, same_day ×1.8.
// Rings: INNER 6.00, OUTER 12.00. Weight bands: ≤2000g +0.00, ≤5000g +2.00, ≤10000g +5.50.
const (
	step  = int64(50)   // $0.50
	floor = int64(400)  // $4.00
	cap40 = int64(4000) // $40.00
	std   = int64(1000) // ×1.0
	same  = int64(1800) // ×1.8
	inner = int64(600)  // $6.00
	outer = int64(1200) // $12.00
)

func bands() []WeightBand {
	return []WeightBand{
		{UpperGrams: 2000, AddCents: 0},
		{UpperGrams: 5000, AddCents: 200},
		{UpperGrams: 10000, AddCents: 550},
	}
}

func base(ring, factor int64, grams int) FeeInputs {
	return FeeInputs{
		RingPriceCents: ring, PackageGrams: grams, WeightBands: bands(),
		FactorMilli: factor, StepCents: step, FloorCents: floor, CapCents: cap40,
	}
}

func TestFee_Fixtures(t *testing.T) {
	cases := []struct {
		name string
		in   FeeInputs
		want int64
	}{
		{"standard inner 1500g", base(inner, std, 1500), 600},
		{"standard outer 7000g", base(outer, std, 7000), 1750},
		{"same_day inner 1500g", base(inner, same, 1500), 1100},
		{"same_day outer 30000g (top band)", base(outer, same, 30000), 3150},
		{"standard inner 100g", base(inner, std, 100), 600},
	}
	for _, c := range cases {
		if got := Fee(c.in); got != c.want {
			t.Errorf("%s: Fee = %d, want %d", c.name, got, c.want)
		}
	}
}

// SC-005: the cap binds and the result is still a clean multiple of the step (the cap is a multiple).
func TestFee_CappedIsStillOnGrid(t *testing.T) {
	in := base(outer, 2400, 50000) // ×2.4: base 1750 → 4200 → capped 4000
	got := Fee(in)
	if got != cap40 {
		t.Fatalf("capped fee = %d, want cap %d", got, cap40)
	}
	if got%step != 0 {
		t.Fatalf("capped fee %d is not a multiple of step %d", got, step)
	}
}

// Invariant 1: every output is a multiple of the step (incl. floored/capped).
func TestFee_AlwaysMultipleOfStep(t *testing.T) {
	for _, ring := range []int64{0, inner, outer, 9999} {
		for _, f := range []int64{std, same, 2400} {
			for _, g := range []int{1, 1500, 5000, 5001, 10000, 99999} {
				if fee := Fee(base(ring, f, g)); fee%step != 0 {
					t.Errorf("ring=%d factor=%d grams=%d: fee %d not a multiple of step %d", ring, f, g, fee, step)
				}
			}
		}
	}
}

// Invariants 2 & 3: floor ≤ fee ≤ cap always.
func TestFee_WithinFloorAndCap(t *testing.T) {
	for _, ring := range []int64{0, inner, outer, 100000} {
		for _, f := range []int64{std, same, 5000} {
			for _, g := range []int{1, 3000, 200000} {
				fee := Fee(base(ring, f, g))
				if fee < floor {
					t.Errorf("fee %d below floor %d (ring=%d factor=%d grams=%d)", fee, floor, ring, f, g)
				}
				if fee > cap40 {
					t.Errorf("fee %d above cap %d (ring=%d factor=%d grams=%d)", fee, cap40, ring, f, g)
				}
			}
		}
	}
}

// Invariant 4: rounds UP, never down — the fee is never below the exact raw value.
func TestFee_NeverRoundsDown(t *testing.T) {
	for _, ring := range []int64{inner, outer, 733} {
		for _, f := range []int64{std, same, 1333} {
			for _, g := range []int{1500, 7000} {
				in := base(ring, f, g)
				fee := Fee(in)
				exactMilli := f * (ring + weightAddCents(g, in.WeightBands)) // raw × 1000
				// Only meaningful below the cap (a capped fee may sit below raw by design).
				if fee < cap40 && int64(fee)*1000 < exactMilli {
					t.Errorf("fee %d rounded DOWN below raw %.3f (ring=%d factor=%d grams=%d)",
						fee, float64(exactMilli)/1000, ring, f, g)
				}
			}
		}
	}
}

// Invariant 5: monotonic non-decreasing in weight and in ring price.
func TestFee_Monotonic(t *testing.T) {
	gramsSteps := []int{1, 2000, 2001, 5000, 5001, 10000, 20000}
	var prev int64 = -1
	for _, g := range gramsSteps {
		fee := Fee(base(outer, std, g))
		if fee < prev {
			t.Errorf("weight non-monotonic: grams=%d fee=%d < prev=%d", g, fee, prev)
		}
		prev = fee
	}
	prev = -1
	for _, ring := range []int64{0, 300, 600, 1200, 5000} {
		fee := Fee(base(ring, std, 3000))
		if fee < prev {
			t.Errorf("ring non-monotonic: ring=%d fee=%d < prev=%d", ring, fee, prev)
		}
		prev = fee
	}
}

// Invariant 6: same_day ≥ standard for identical ring+weight when same_day_factor ≥ standard_factor.
func TestFee_SameDayNeverCheaperThanStandard(t *testing.T) {
	for _, ring := range []int64{0, inner, outer} {
		for _, g := range []int{1, 3000, 8000, 50000} {
			s := Fee(base(ring, std, g))
			d := Fee(base(ring, same, g))
			if d < s {
				t.Errorf("same_day %d cheaper than standard %d (ring=%d grams=%d)", d, s, ring, g)
			}
		}
	}
}

// Invariant 7: a package heavier than every band is priced at the top band, never zero, never error.
func TestFee_HeavierThanTopBandUsesTopBand(t *testing.T) {
	atTop := Fee(base(inner, std, 10000))   // exactly the top band
	beyond := Fee(base(inner, std, 999999)) // far beyond every band
	if beyond != atTop {
		t.Errorf("beyond-top fee %d != top-band fee %d", beyond, atTop)
	}
}

// Invariant 8: deterministic — same inputs, same output.
func TestFee_Deterministic(t *testing.T) {
	in := base(outer, same, 7000)
	first := Fee(in)
	for i := range 100 {
		if Fee(in) != first {
			t.Fatalf("non-deterministic at iteration %d", i)
		}
	}
}

// Order-independence: unsorted bands still price correctly.
func TestWeightAddCents_OrderIndependent(t *testing.T) {
	unsorted := []WeightBand{
		{UpperGrams: 10000, AddCents: 550},
		{UpperGrams: 2000, AddCents: 0},
		{UpperGrams: 5000, AddCents: 200},
	}
	if got := weightAddCents(7000, unsorted); got != 550 {
		t.Errorf("7000g add = %d, want 550", got)
	}
	if got := weightAddCents(1, unsorted); got != 0 {
		t.Errorf("1g add = %d, want 0", got)
	}
	if got := weightAddCents(999999, unsorted); got != 550 {
		t.Errorf("beyond-top add = %d, want top band 550", got)
	}
}
