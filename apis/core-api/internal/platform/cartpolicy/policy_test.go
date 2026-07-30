package cartpolicy

import "testing"

func TestHasMinimum(t *testing.T) {
	if Default().HasMinimum() {
		t.Fatal("a zero minimum must NOT count as a minimum in force — FR-057 says nothing is shown")
	}
	if !(Policy{MinimumSubtotalCents: 1}).HasMinimum() {
		t.Fatal("one cent is a minimum")
	}
}

func TestRemainingAndMeets(t *testing.T) {
	p := Policy{MinimumSubtotalCents: 2500} // $25.00

	tests := []struct {
		name    string
		payable int64
		want    int64
		meets   bool
	}{
		{"well below", 1800, 700, false},
		{"one cent below", 2499, 1, false},
		{"exactly at the minimum is ALLOWED", 2500, 0, true},
		{"above", 9999, 0, true},
		{"empty cart is below", 0, 2500, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := p.Remaining(tc.payable); got != tc.want {
				t.Fatalf("Remaining(%d) = %d, want %d", tc.payable, got, tc.want)
			}
			if got := p.Meets(tc.payable); got != tc.meets {
				t.Fatalf("Meets(%d) = %v, want %v", tc.payable, got, tc.meets)
			}
		})
	}
}

func TestRemainingWithNoMinimumIsAlwaysZero(t *testing.T) {
	p := Default()
	for _, payable := range []int64{0, 1, 999999} {
		if got := p.Remaining(payable); got != 0 {
			t.Fatalf("with no minimum, Remaining(%d) = %d, want 0", payable, got)
		}
		if !p.Meets(payable) {
			t.Fatalf("with no minimum, Meets(%d) must be true — a missing policy must never block checkout", payable)
		}
	}
}

func TestDefaultsMatchThePreviousHardCodedCeiling(t *testing.T) {
	// 019 hard-coded maxQuantity = 99 in features/cart. The fallback must keep that exact value, so a
	// missing policy row degrades to the old behaviour instead of changing it.
	if Default().MaxLineQuantity != 99 {
		t.Fatalf("MaxLineQuantity fallback = %d, want 99 (the pre-027 constant)", Default().MaxLineQuantity)
	}
	if Default().MaxDistinctItems != 100 {
		t.Fatalf("MaxDistinctItems fallback = %d, want 100", Default().MaxDistinctItems)
	}
	if Default().Currency != "AUD" {
		t.Fatalf("Currency fallback = %q, want AUD", Default().Currency)
	}
}
