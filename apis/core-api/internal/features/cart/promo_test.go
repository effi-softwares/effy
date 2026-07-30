package cart

import (
	"testing"
	"time"
)

// The eight refusals of FR-043, and the money. SC-012 requires each to be distinguishable — "that code
// doesn't work" tells a shopper nothing about whether to wait, spend more, or give up.

var (
	now       = time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	yesterday = now.Add(-24 * time.Hour)
	tomorrow  = now.Add(24 * time.Hour)
)

func percentCode(pct int) PromoCode {
	return PromoCode{ID: "p1", Code: "SPRING20", Kind: PromoPercentage, PercentOff: pct, Status: "active"}
}

func fixedCode(cents int64) PromoCode {
	return PromoCode{ID: "p2", Code: "TENOFF", Kind: PromoFixed, AmountOffCents: cents, Status: "active"}
}

func intp(n int) *int { return &n }

func TestEveryRefusalIsDistinguishable(t *testing.T) {
	tests := []struct {
		name    string
		code    PromoCode
		usage   PromoUsage
		payable int64
		want    error
	}{
		{"disabled", func() PromoCode { c := percentCode(20); c.Status = "disabled"; return c }(), PromoUsage{}, 5000, ErrPromoDisabled},
		{"not started", func() PromoCode { c := percentCode(20); c.StartsAt = &tomorrow; return c }(), PromoUsage{}, 5000, ErrPromoNotStarted},
		{"expired", func() PromoCode { c := percentCode(20); c.EndsAt = &yesterday; return c }(), PromoUsage{}, 5000, ErrPromoExpired},
		{"exhausted overall", func() PromoCode { c := percentCode(20); c.MaxRedemptions = intp(1); return c }(), PromoUsage{Total: 1}, 5000, ErrPromoExhausted},
		{"already used by this shopper", func() PromoCode { c := percentCode(20); c.MaxPerCustomer = intp(1); return c }(), PromoUsage{ByThisShopper: 1}, 5000, ErrPromoAlreadyUsed},
		{"nothing payable", percentCode(20), PromoUsage{}, 0, ErrPromoNotApplicable},
		{"below the code's minimum", func() PromoCode { c := fixedCode(1000); c.MinimumSubtotalCents = 5000; return c }(), PromoUsage{}, 4999, ErrPromoBelowMinimum},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := EvaluatePromo(tc.code, tc.usage, tc.payable, now)
			if err != tc.want {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestAValidPercentageCodeDiscounts(t *testing.T) {
	got, err := EvaluatePromo(percentCode(20), PromoUsage{}, 5000, now)
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if got != 1000 {
		t.Errorf("discount = %d, want 1000 (20%% of $50)", got)
	}
}

// Rounding goes DOWN, so a rounding error can only favour the platform by a cent — never give money away.
func TestPercentageRoundsDown(t *testing.T) {
	got, _ := EvaluatePromo(percentCode(33), PromoUsage{}, 1000, now) // 3.33 → 333 cents, not 334
	if got != 330 {
		t.Errorf("discount = %d, want 330 (33%% of $10.00, rounded down)", got)
	}
}

// ⚠ FR-044: without the cap this is a negative total, which is a refund the platform never agreed to.
func TestAFixedCodeIsCappedAtTheCartValue(t *testing.T) {
	got, err := EvaluatePromo(fixedCode(99900), PromoUsage{}, 2000, now)
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if got != 2000 {
		t.Errorf("discount = %d, want 2000 — capped so the payable total never goes below zero", got)
	}
}

// The boundaries, because "expired" and "starts now" are exactly where an off-by-one lives.
func TestWindowBoundaries(t *testing.T) {
	started := percentCode(10)
	started.StartsAt = &now
	if _, err := EvaluatePromo(started, PromoUsage{}, 5000, now); err != nil {
		t.Errorf("a code starting exactly now must be usable, got %v", err)
	}

	ending := percentCode(10)
	ending.EndsAt = &now
	if _, err := EvaluatePromo(ending, PromoUsage{}, 5000, now); err != ErrPromoExpired {
		t.Errorf("a code ending exactly now must be expired, got %v", err)
	}
}

func TestExactlyAtTheCodeMinimumApplies(t *testing.T) {
	c := fixedCode(1000)
	c.MinimumSubtotalCents = 5000
	if _, err := EvaluatePromo(c, PromoUsage{}, 5000, now); err != nil {
		t.Errorf("exactly at the minimum must apply, got %v", err)
	}
}

func TestUncappedCodesNeverExhaust(t *testing.T) {
	if _, err := EvaluatePromo(percentCode(10), PromoUsage{Total: 9999, ByThisShopper: 50}, 5000, now); err != nil {
		t.Errorf("a code with no caps must never exhaust, got %v", err)
	}
}

// A shopper types what they type; the unique index is on upper(code) and this must agree with it.
func TestCodeNormalisation(t *testing.T) {
	for _, in := range []string{"spring20", " SPRING20 ", "Spring20"} {
		if got := NormalisePromoCode(in); got != "SPRING20" {
			t.Errorf("NormalisePromoCode(%q) = %q, want SPRING20", in, got)
		}
	}
}

func TestLabelsAreShopFreeAndReadable(t *testing.T) {
	if got := PromoLabel(percentCode(20)); got != "20% off" {
		t.Errorf("label = %q, want '20%% off'", got)
	}
	if got := PromoLabel(fixedCode(1050)); got != "10.50 off" {
		t.Errorf("label = %q, want '10.50 off'", got)
	}
}
