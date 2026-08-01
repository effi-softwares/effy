package delivery

import "sort"

// Band is one step of a pricing rule: everything up to UpperBound adds AddCents.
//
// ⚠ UPPER BOUND ONLY. Storing both bounds would make a GAP between two bands REPRESENTABLE, and a gap
// is the defect FR-011 exists to prevent — a distance or weight matching no band must never mean "no
// fee". With only an upper bound there is nothing to fall between.
type Band struct {
	UpperBound float64 // kilometres, or kilograms
	AddCents   int64
}

// PricingRule is how one delivery method is priced. Loaded from public.delivery_pricing_rule.
type PricingRule struct {
	Method          Method
	BaseCents       int64
	RoundingStepCts int64
	MaxCents        int64
	DistanceBands   []Band
	WeightBands     []Band
	Active          bool
}

// Price computes the fee for one package, in integer cents.
//
//	fee = min(cap, roundUp(base + distanceBand + weightBand, step))
//
// It returns ok=false only when the method is not offered at all (a disabled rule). ⚠ It NEVER returns
// ok=false because an input was out of range: every distance and every weight has a defined answer,
// because a gap in operator-editable configuration must not refuse a sale or give delivery away.
//
// The rules, each of which is a test in pricing_test.go:
//
//	distance beyond the last band  -> the last band     (not free, not undeliverable)
//	weight beyond the last band    -> the last band
//	distance UNKNOWN               -> the FURTHEST band  (FR-038 — never the nearest)
//	no bands configured at all     -> the base alone
//
// ⚠ The unknown-distance rule is the one that matters. `distanceKnown` is false when either the shop's
// or the shopper's postcode has no centroid. Treating that as 0 km would make the most remote postcode
// in the country — precisely the one whose location we are least likely to have — the cheapest to
// deliver to, with nothing anywhere reporting a fault. Pricing it as the furthest band is the safe
// direction to be wrong in.
func Price(rule PricingRule, distanceKm float64, distanceKnown bool, weightKg float64) (int64, bool) {
	if !rule.Active {
		return 0, false
	}

	cents := rule.BaseCents + bandAdd(rule.DistanceBands, distanceKm, distanceKnown) + bandAdd(rule.WeightBands, weightKg, true)
	cents = roundUpTo(cents, rule.RoundingStepCts)

	// ⚠ The cap rounds DOWN to the step, never up past itself: a ceiling the operator set must not be
	// exceeded by the rounding that was supposed to tidy the number. The schema requires the cap to be
	// a multiple of the step anyway (delivery_pricing_rule_cap_rounded_ck), so this only bites if that
	// constraint is ever relaxed — but a capped fee that is not a round number breaks SC-003 on exactly
	// the most expensive orders, where nobody is looking.
	if rule.MaxCents > 0 && cents > rule.MaxCents {
		cents = roundDownTo(rule.MaxCents, rule.RoundingStepCts)
	}
	return cents, true
}

// bandAdd picks the smallest band whose UpperBound is >= value.
//
// ⚠ `known=false` deliberately skips the search and takes the LAST (largest) band. See Price.
func bandAdd(bands []Band, value float64, known bool) int64 {
	if len(bands) == 0 {
		return 0
	}
	sorted := make([]Band, len(bands))
	copy(sorted, bands)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].UpperBound < sorted[j].UpperBound })

	if !known {
		return sorted[len(sorted)-1].AddCents
	}
	for _, b := range sorted {
		// ⚠ >= , so a value EXACTLY on a bound takes that band. `>` would push every boundary value
		// into the next band up, shifting prices at every band edge in a way an aggregate test would
		// not catch.
		if value <= b.UpperBound {
			return b.AddCents
		}
	}
	// Beyond every band -> the largest. NOT zero: that would be free delivery to the far side of the
	// country, produced by the absence of a row.
	return sorted[len(sorted)-1].AddCents
}

// roundUpTo rounds to the next multiple of step.
//
// ⚠ UP, NEVER NEAREST (FR-005). Nearest-rounding means the platform silently absorbs the difference on
// roughly half of all orders — a revenue decision wearing a formatting choice's clothes.
func roundUpTo(cents, step int64) int64 {
	if step <= 0 {
		return cents
	}
	if r := cents % step; r != 0 {
		cents += step - r
	}
	return cents
}

func roundDownTo(cents, step int64) int64 {
	if step <= 0 {
		return cents
	}
	return cents - cents%step
}
