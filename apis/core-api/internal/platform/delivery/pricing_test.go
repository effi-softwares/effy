package delivery

import "testing"

// A rule with deliberately uneven adds, so a wrong band is visible in the total rather than hidden by
// two bands that happen to cost the same.
//
//	distance:  ≤5km +0.00   ≤15km +3.00   ≤50km +9.00
//	weight:    ≤2kg +0.00   ≤10kg +2.50
//	base 6.00 · step 0.50 · cap 45.00
func testRule() PricingRule {
	return PricingRule{
		Method:          MethodStandard,
		BaseCents:       600,
		RoundingStepCts: 50,
		MaxCents:        4500,
		DistanceBands:   []Band{{UpperBound: 5, AddCents: 0}, {UpperBound: 15, AddCents: 300}, {UpperBound: 50, AddCents: 900}},
		WeightBands:     []Band{{UpperBound: 2, AddCents: 0}, {UpperBound: 10, AddCents: 250}},
		Active:          true,
	}
}

func mustPrice(t *testing.T, r PricingRule, km float64, known bool, kg float64) int64 {
	t.Helper()
	fee, ok := Price(r, km, known, kg)
	if !ok {
		t.Fatalf("want a priced result for km=%v known=%v kg=%v", km, known, kg)
	}
	return fee
}

// ── The ordinary cases ────────────────────────────────────────────────────────────────────────

func TestPrice_FurtherCostsMore(t *testing.T) {
	r := testRule()
	near := mustPrice(t, r, 3, true, 1)
	mid := mustPrice(t, r, 12, true, 1)
	far := mustPrice(t, r, 40, true, 1)
	if !(near < mid && mid < far) {
		t.Errorf("distance must increase the fee: %d, %d, %d", near, mid, far)
	}
	if near != 600 || mid != 900 || far != 1500 {
		t.Errorf("got %d/%d/%d, want 600/900/1500", near, mid, far)
	}
}

func TestPrice_HeavierCostsMore(t *testing.T) {
	r := testRule()
	light := mustPrice(t, r, 3, true, 1)
	heavy := mustPrice(t, r, 3, true, 8)
	if heavy <= light {
		t.Errorf("weight must increase the fee: light=%d heavy=%d", light, heavy)
	}
}

// ⚠ A value EQUAL to an upper bound takes THAT band, not the next one. Bands are matched by
// "smallest upperBound >= value", and getting the boundary wrong shifts every price at a band edge by
// a whole step in a way no aggregate test would notice.
func TestPrice_BandBoundaryIsInclusive(t *testing.T) {
	r := testRule()
	at5 := mustPrice(t, r, 5, true, 1)         // exactly 5 km -> the ≤5 band, +0.00
	justOver := mustPrice(t, r, 5.01, true, 1) // -> the ≤15 band, +3.00
	if at5 != 600 {
		t.Errorf("5km should take the ≤5 band: got %d want 600", at5)
	}
	if justOver != 900 {
		t.Errorf("5.01km should take the ≤15 band: got %d want 900", justOver)
	}
}

// ── The total-function rules: every input has a defined answer (FR-011) ───────────────────────

// ⚠ A distance beyond the last band takes the LAST band. Not "no fee" (free delivery to the far side
// of the country) and not "undeliverable" (a shopper refused for a gap in a config table).
func TestPrice_DistanceBeyondEveryBandTakesTheLast(t *testing.T) {
	r := testRule()
	beyond := mustPrice(t, r, 5000, true, 1)
	last := mustPrice(t, r, 50, true, 1)
	if beyond != last {
		t.Errorf("beyond the last band should price as the last band: got %d want %d", beyond, last)
	}
	if beyond == 600 {
		t.Error("⚠ beyond the last band priced as if no band applied — that is free delivery by omission")
	}
}

func TestPrice_WeightBeyondEveryBandTakesTheLast(t *testing.T) {
	r := testRule()
	beyond := mustPrice(t, r, 3, true, 500)
	last := mustPrice(t, r, 3, true, 10)
	if beyond != last {
		t.Errorf("beyond the last weight band should price as the last: got %d want %d", beyond, last)
	}
}

// ⚠ THE ONE THAT MATTERS MOST (FR-038). A postcode with no centroid must price at the FURTHEST band,
// never the nearest. If an unknown location fell through as 0 km, the most remote place in the country
// — precisely the one whose coordinates we are least likely to have — would be the cheapest to deliver
// to, and nothing would report it.
func TestPrice_UnknownDistanceTakesTheFurthestBand(t *testing.T) {
	r := testRule()
	unknown := mustPrice(t, r, 0, false, 1)
	furthest := mustPrice(t, r, 50, true, 1)
	nearest := mustPrice(t, r, 1, true, 1)

	if unknown != furthest {
		t.Errorf("unknown distance must price as the furthest band: got %d want %d", unknown, furthest)
	}
	if unknown == nearest {
		t.Error("⚠ unknown distance priced as the NEAREST band — a missing coordinate became free-ish delivery")
	}
}

// A rule with no bands at all still produces a fee: the base. ⚠ Not zero, and not an error that would
// refuse the sale — an empty band set is a misconfiguration, and the shopper is not the right person
// to discover it.
func TestPrice_NoBandsStillProducesTheBase(t *testing.T) {
	r := testRule()
	r.DistanceBands = nil
	r.WeightBands = nil
	if got := mustPrice(t, r, 40, true, 20); got != 600 {
		t.Errorf("got %d want the base 600", got)
	}
}

// ── Rounding (FR-005) and the cap (FR-012) ────────────────────────────────────────────────────

// ⚠ UPWARD, NEVER NEAREST. Rounding to nearest means the platform absorbs the difference on roughly
// half of all orders — a revenue decision disguised as a formatting choice.
func TestPrice_RoundsUpNeverNearest(t *testing.T) {
	r := testRule()
	r.BaseCents = 701 // 7.01 at a 0.50 step

	got := mustPrice(t, r, 1, true, 1)
	if got != 750 {
		t.Errorf("got %d, want 750 (7.50)", got)
	}
	if got == 700 {
		t.Error("⚠ rounded DOWN to 7.00 — nearest-rounding silently gives away the difference")
	}
}

func TestPrice_AlreadyOnTheStepIsUnchanged(t *testing.T) {
	r := testRule()
	if got := mustPrice(t, r, 1, true, 1); got != 600 {
		t.Errorf("600 is already a multiple of 50; got %d", got)
	}
}

func TestPrice_CapBounds(t *testing.T) {
	r := testRule()
	r.MaxCents = 800
	if got := mustPrice(t, r, 40, true, 8); got != 800 {
		t.Errorf("got %d, want the cap 800", got)
	}
}

// ⚠ A capped fee must STILL be a multiple of the rounding step (SC-003). The cap binds only on the
// most expensive orders, which is exactly where an unrounded figure is least likely to be noticed —
// so the schema requires the cap to be a multiple, and this pins the behaviour if it ever is not.
func TestPrice_CappedFeeIsStillRounded(t *testing.T) {
	r := testRule()
	r.MaxCents = 833 // deliberately not a multiple of 50
	got := mustPrice(t, r, 40, true, 8)
	if got%r.RoundingStepCts != 0 {
		t.Errorf("capped fee %d is not a multiple of the %d step", got, r.RoundingStepCts)
	}
	if got != 800 {
		t.Errorf("got %d, want 800 — a cap must round DOWN to the step, never up past itself", got)
	}
}

// ── Rule status (FR-007) ──────────────────────────────────────────────────────────────────────

// A disabled rule means the method is not offered at all — not offered at zero, and not offered at
// the base.
func TestPrice_DisabledRuleIsNotOffered(t *testing.T) {
	r := testRule()
	r.Active = false
	if fee, ok := Price(r, 3, true, 1); ok {
		t.Errorf("a disabled rule must not price: got %d", fee)
	}
}

// ── Every method prices independently (FR-007) ────────────────────────────────────────────────

func TestPrice_MethodsAreIndependent(t *testing.T) {
	standard := testRule()
	sameDay := testRule()
	sameDay.Method = MethodSameDay
	sameDay.BaseCents = 1200

	s := mustPrice(t, standard, 3, true, 1)
	d := mustPrice(t, sameDay, 3, true, 1)
	if d <= s {
		t.Errorf("same-day should be able to cost more than standard at the same distance/weight: %d vs %d", d, s)
	}
}
