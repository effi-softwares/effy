package delivery

import (
	"testing"
	"time"
)

func mkCutoff(h, m int) *time.Time {
	t := time.Date(2000, 1, 1, h, m, 0, 0, time.UTC)
	return &t
}

// A metro->metro leg offers same-day + standard; the customer sees both, fastest first.
func TestOptions_MetroOffersSameDayAndStandard(t *testing.T) {
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC) // before any cutoff
	offerings := []Offering{
		{Method: MethodStandard, PriceCents: 500, LeadDaysMin: 2, LeadDaysMax: 3},
		{Method: MethodSameDay, PriceCents: 700, SameDayCutoff: mkCutoff(14, 0)},
	}
	opts := Options(offerings, now, 7)

	if len(opts) != 2 {
		t.Fatalf("want 2 options, got %d", len(opts))
	}
	if opts[0].Method != MethodSameDay {
		t.Fatalf("same-day must sort first, got %s", opts[0].Method)
	}
	if opts[0].FeeCents != 700 || opts[1].FeeCents != 500 {
		t.Fatalf("fees wrong: %+v", opts)
	}
	if opts[1].Window != "in 2-3 days" {
		t.Fatalf("standard window: %q", opts[1].Window)
	}
}

// A leg with only a standard offering (a farther shop) offers multi-day only — no same-day.
func TestOptions_RegionalStandardOnly(t *testing.T) {
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	opts := Options([]Offering{{Method: MethodStandard, PriceCents: 800, LeadDaysMin: 3, LeadDaysMax: 5}}, now, 7)

	if len(opts) != 1 || opts[0].Method != MethodStandard {
		t.Fatalf("want standard-only, got %+v", opts)
	}
	if opts[0].Window != "in 3-5 days" {
		t.Fatalf("window: %q", opts[0].Window)
	}
}

// No offerings for the leg = undeliverable (the caller sets serviceable:false).
func TestOptions_NoOfferings_Empty(t *testing.T) {
	if got := Options(nil, time.Now(), 7); len(got) != 0 {
		t.Fatalf("want no options for an unserviced leg, got %+v", got)
	}
}

// Same-day is withdrawn once now is past its cutoff (the edge case).
func TestOptions_SameDayWithdrawnPastCutoff(t *testing.T) {
	now := time.Date(2026, 7, 21, 15, 0, 0, 0, time.UTC) // 15:00, past a 14:00 cutoff
	offerings := []Offering{
		{Method: MethodSameDay, PriceCents: 700, SameDayCutoff: mkCutoff(14, 0)},
		{Method: MethodStandard, PriceCents: 500, LeadDaysMin: 2, LeadDaysMax: 3},
	}
	opts := Options(offerings, now, 7)

	for _, o := range opts {
		if o.Method == MethodSameDay {
			t.Fatalf("same-day must be withdrawn past cutoff, got %+v", opts)
		}
	}
	if len(opts) != 1 {
		t.Fatalf("want standard only after cutoff, got %d", len(opts))
	}
}

// Before the cutoff, same-day stands.
func TestOptions_SameDayBeforeCutoff(t *testing.T) {
	now := time.Date(2026, 7, 21, 13, 59, 0, 0, time.UTC)
	opts := Options([]Offering{{Method: MethodSameDay, PriceCents: 700, SameDayCutoff: mkCutoff(14, 0)}}, now, 7)
	if len(opts) != 1 || opts[0].Method != MethodSameDay {
		t.Fatalf("same-day should stand before cutoff, got %+v", opts)
	}
}

func TestPromisedReadyAt_StandardUsesMaxLead(t *testing.T) {
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	got := PromisedReadyAt(Offering{Method: MethodStandard, LeadDaysMin: 2, LeadDaysMax: 3}, now, nil)
	want := now.AddDate(0, 0, 3)
	if !got.Equal(want) {
		t.Fatalf("promised ready-by: got %v want %v", got, want)
	}
}

func TestPromisedReadyAt_ScheduledUsesPickedDate(t *testing.T) {
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	picked := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	got := PromisedReadyAt(Offering{Method: MethodScheduled}, now, &picked)
	if !got.Equal(picked) {
		t.Fatalf("scheduled promise must be the picked date: got %v", got)
	}
}

func TestFindOffering(t *testing.T) {
	offs := []Offering{{Method: MethodStandard, PriceCents: 500}}
	if _, ok := FindOffering(offs, MethodStandard); !ok {
		t.Fatal("should find standard")
	}
	if _, ok := FindOffering(offs, MethodSameDay); ok {
		t.Fatal("must not find an un-offered method")
	}
}
