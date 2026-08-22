// Package delivery holds the platform's ONE delivery fee engine and the zone/ring/plan reads that feed
// it (047-delivery-shipping-engine). The engine below is PURE — no I/O, no clock, no DB — so it is the
// single, table-testable home of how a customer delivery fee is computed. The back-office console
// validates a plan's completeness but never reimplements this (research R7; contracts/fee-engine).
//
// All arithmetic is in integer minor units (cents), never floats. The method factor is carried in
// milli-units (numeric(6,3) × 1000) so `factor × base` stays exact, and the result is rounded UP to the
// step by taking the ceiling on milli-cents — so a fractional cent is never shaved off before rounding.
package delivery

// WeightBand is one upper-bound weight slab: a package of `UpperGrams` or less adds `AddCents`. The plan's
// top band is open-ended — a package heavier than every band takes the largest band (FR-028).
type WeightBand struct {
	UpperGrams int
	AddCents   int64
}

// FeeInputs are the pure inputs to a single package's delivery fee, all resolved from the active plan and
// the destination zone's ring by the repository layer (plan.go / zone.go) before the engine runs.
type FeeInputs struct {
	RingPriceCents int64        // the destination ring's price component for the active plan
	PackageGrams   int          // sum of the package's item weights (> 0)
	WeightBands    []WeightBand // the plan's weight slabs; the largest UpperGrams is the open-ended top
	FactorMilli    int64        // the method factor × 1000 (same_day ≥ standard; > 0)
	StepCents      int64        // rounding step (> 0)
	FloorCents     int64        // minimum fee (≥ 0, a multiple of step)
	CapCents       int64        // maximum fee (> 0, a multiple of step, ≥ floor)
}

// Fee computes the GST-inclusive, snapped-up, clamped delivery fee in integer cents:
//
//	fee = clamp( roundUpToStep( factor × (ringPrice + weightAdd) ), floor, cap )
//
// Because floor and cap are themselves multiples of the step, EVERY result is a multiple of the step —
// including a floored or capped one (SC-005). The result is never below what the rule produced (round UP,
// never down — FR-024), never below the floor (never free / never below cost — FR-026), and never above
// the cap (never absurd — FR-027).
func Fee(in FeeInputs) int64 {
	base := in.RingPriceCents + weightAddCents(in.PackageGrams, in.WeightBands)

	// raw × 1000, kept integer so no fractional cent is lost on the downside before rounding UP.
	rawMilli := in.FactorMilli * base
	stepMilli := in.StepCents * 1000

	// ceil(rawMilli / stepMilli) steps of `step` cents.
	steps := (rawMilli + stepMilli - 1) / stepMilli
	snapped := steps * in.StepCents

	return clampCents(snapped, in.FloorCents, in.CapCents)
}

// weightAddCents returns the slab add for `grams`: the smallest band whose UpperGrams is ≥ grams, or — if
// the package is heavier than every band — the band with the largest UpperGrams (the open-ended top,
// FR-028). Order-independent, so a repository that returns bands unsorted still prices correctly.
func weightAddCents(grams int, bands []WeightBand) int64 {
	if len(bands) == 0 {
		return 0
	}
	fit := -1 // index of the smallest UpperGrams ≥ grams
	top := 0  // index of the largest UpperGrams
	for i, b := range bands {
		if b.UpperGrams >= grams && (fit == -1 || b.UpperGrams < bands[fit].UpperGrams) {
			fit = i
		}
		if b.UpperGrams > bands[top].UpperGrams {
			top = i
		}
	}
	if fit != -1 {
		return bands[fit].AddCents
	}
	return bands[top].AddCents
}

func clampCents(v, lo, hi int64) int64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
