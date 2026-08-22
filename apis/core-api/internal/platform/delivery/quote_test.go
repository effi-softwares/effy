package delivery

import "testing"

func TestParseMilli(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"1", 1000},
		{"1.8", 1800},
		{"2.400", 2400},
		{"1.05", 1050},
		{"0.5", 500},
		{"1.2345", 1234}, // truncated to 3 dp
		{" 1.8 ", 1800},
	}
	for _, c := range cases {
		got, err := parseMilli(c.in)
		if err != nil {
			t.Errorf("parseMilli(%q) error: %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("parseMilli(%q) = %d, want %d", c.in, got, c.want)
		}
	}
	if _, err := parseMilli(""); err == nil {
		t.Error("parseMilli(\"\") should error")
	}
}

func testPlan() Plan {
	return Plan{
		RoundingStepCents:   50,
		FloorCents:          400,
		CapCents:            4000,
		StandardFactorMilli: 1000, // ×1.0
		SameDayFactorMilli:  1800, // ×1.8
		WeightBands:         []WeightBand{{UpperGrams: 2000, AddCents: 0}, {UpperGrams: 5000, AddCents: 200}, {UpperGrams: 10000, AddCents: 550}},
	}
}

func TestFeeInputs_StandardAndSameDay(t *testing.T) {
	plan := testPlan()
	const innerRing = int64(600) // $6.00

	// A 7000g package: 600 + 550 = 1150. Standard ×1.0 → $11.50; same-day ×1.8 → 2070 → snapped UP to the
	// $0.50 grid → $21.00 (this snap-up is exactly the engine's job).
	std := Fee(feeInputs(plan, innerRing, 7000, plan.StandardFactorMilli))
	sd := Fee(feeInputs(plan, innerRing, 7000, plan.SameDayFactorMilli))
	if std != 1150 {
		t.Errorf("standard fee = %d, want 1150", std)
	}
	if sd != 2100 {
		t.Errorf("same-day fee = %d, want 2100 (2070 snapped up to the .50 grid)", sd)
	}
	if sd < std {
		t.Errorf("same-day %d must be ≥ standard %d", sd, std)
	}
}

func TestFeeInputs_FloorApplies(t *testing.T) {
	plan := testPlan()
	// A near-zero ring + lightest slab would price below the floor; the floor ($4.00) must apply — never free.
	if fee := Fee(feeInputs(plan, 0, 100, plan.StandardFactorMilli)); fee != 400 {
		t.Errorf("floor not applied: fee=%d, want 400", fee)
	}
}

func TestDistinctShops(t *testing.T) {
	got := distinctShops([]PackageInput{{ShopID: "a"}, {ShopID: "b"}, {ShopID: "a"}})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Errorf("distinctShops = %v, want [a b] in first-appearance order", got)
	}
}

func TestPackageQuote_FeeFor(t *testing.T) {
	p := PackageQuote{ShopID: "s", Options: []Option{
		{Method: MethodStandard, FeeCents: 600},
		{Method: MethodSameDay, FeeCents: 1100},
	}}
	if m, f := p.FeeFor(MethodSameDay); m != MethodSameDay || f != 1100 {
		t.Errorf("FeeFor(same_day) = %s/%d, want same_day/1100", m, f)
	}
	// A method not offered falls back to standard, never refused.
	stdOnly := PackageQuote{ShopID: "s", Options: []Option{{Method: MethodStandard, FeeCents: 600}}}
	if m, f := stdOnly.FeeFor(MethodSameDay); m != MethodStandard || f != 600 {
		t.Errorf("FeeFor(same_day) with no same-day = %s/%d, want standard/600", m, f)
	}
}

func TestFactorMilli_Selection(t *testing.T) {
	plan := testPlan()
	if plan.FactorMilli(MethodSameDay) != 1800 {
		t.Errorf("same_day factor = %d, want 1800", plan.FactorMilli(MethodSameDay))
	}
	if plan.FactorMilli(MethodStandard) != 1000 {
		t.Errorf("standard factor = %d, want 1000", plan.FactorMilli(MethodStandard))
	}
}
