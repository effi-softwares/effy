package delivery

import (
	"testing"
	"time"
)

func mkCutoff(h, m int) *time.Time {
	t := time.Date(2000, 1, 1, h, m, 0, 0, time.UTC)
	return &t
}

// ⚠ AMENDED BY 032 — THE NAMED, EXPECTED DELTA (research R8).
//
// This test used to assert that a same_day ROW IN THE RATE GRID produced a same-day option. That is
// exactly the rule FR-029 deletes: a grid row only ever meant "these two postcodes share a zone",
// which is how a shop in Bendigo came to serve Ballarat 98 km away, as far as Melbourne. Same-day is
// now decided per SHOP, from an approval an admin granted — see TestSamedayOffered_* below.
//
// What this test still guards is that a stale same_day row CANNOT resurrect the old behaviour.
func TestOptions_IgnoresAnyStaleSameDayRow(t *testing.T) {
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC) // before any cutoff
	offerings := []Offering{
		{Method: MethodStandard, PriceCents: 500, LeadDaysMin: 2, LeadDaysMax: 3},
		{Method: MethodSameDay, PriceCents: 700},
	}
	opts := Options(offerings, now, 7)

	if len(opts) != 1 {
		t.Fatalf("want standard only — a rate-grid row must not grant same-day, got %d: %+v", len(opts), opts)
	}
	if opts[0].Method != MethodStandard {
		t.Fatalf("want standard, got %s", opts[0].Method)
	}
	// ⚠ The window assertion is PRESERVED — only its index moved, because standard is no longer
	// second behind a same-day option. The label and window behaviour are untouched by 032.
	if opts[0].Window != "in 2-3 days" {
		t.Fatalf("standard window: %q", opts[0].Window)
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

// ⚠ Still true, for a different reason after 032: Options never offers same-day at all now. Kept as
// a regression guard — if someone restores grid-driven same-day, this fails alongside the two above.
func TestOptions_SameDayWithdrawnPastCutoff(t *testing.T) {
	now := time.Date(2026, 7, 21, 15, 0, 0, 0, time.UTC) // 15:00, past a 14:00 cutoff
	offerings := []Offering{
		{Method: MethodSameDay, PriceCents: 700},
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

// ⚠ AMENDED BY 032 — the same delta. The cutoff behaviour is PRESERVED, re-expressed against the
// approval that now carries it: see TestSamedayOffered_WithdrawnPastCutoff.
func TestOptions_ProducesNothingFromASameDayRowAlone(t *testing.T) {
	now := time.Date(2026, 7, 21, 13, 59, 0, 0, time.UTC)
	opts := Options([]Offering{{Method: MethodSameDay, PriceCents: 700}}, now, 7)
	if len(opts) != 0 {
		t.Fatalf("a same_day grid row alone must offer nothing, got %+v", opts)
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

// ── Same-day eligibility (032) — the rule that replaced the rate-grid row ──────────────────────
//
// ⚠ THE FEATURE EXISTS BECAUSE THE OLD RULE CARRIED NO INFORMATION. Zone REGIONAL holds Ballarat and
// Bendigo, so "a shop shares your zone" permitted same-day across 98 km — essentially as far as
// Melbourne. Every term below is one the old check did not have.

func approval(cutoffHour int, postcodes ...string) *SamedayApproval {
	set := map[string]bool{}
	for _, p := range postcodes {
		set[p] = true
	}
	return &SamedayApproval{Postcodes: set, Cutoff: mkCutoff(cutoffHour, 0)}
}

// noon in Melbourne, expressed in UTC — deliberately, because a naive implementation reading clock
// fields off a UTC time would see 02:00 and get the cutoff comparison wrong by ten hours.
func melbourneNoon() time.Time {
	return time.Date(2026, 7, 21, 12, 0, 0, 0, Melbourne)
}

func TestSamedayOffered_AllFourTermsHold(t *testing.T) {
	if !SamedayOffered(approval(14, "3550"), "3550", true, melbourneNoon()) {
		t.Fatal("approved shop, area in coverage, before cutoff, area serviced → same-day must be offered")
	}
}

// ⚠ TERM 1. No approval is the DEFAULT state, and it must offer nothing. An empty table offering
// everything would be the worst possible failure direction.
func TestSamedayOffered_NoApprovalOffersNothing(t *testing.T) {
	if SamedayOffered(nil, "3550", true, melbourneNoon()) {
		t.Fatal("a shop with no approval must never offer same-day")
	}
}

// ⚠ TERM 2, AND THE WHOLE POINT (SC-007). A Bendigo shop approved for Bendigo must NOT thereby serve
// Ballarat — even though both postcodes sit in the same delivery zone, which is precisely what the
// old rule keyed on.
func TestSamedayOffered_AreaNotInCoverageIsRefused(t *testing.T) {
	bendigoShop := approval(14, "3550") // approved for Bendigo only
	if SamedayOffered(bendigoShop, "3350", true, melbourneNoon()) {
		t.Fatal("⚠ Ballarat (3350) was served by a Bendigo-only approval — the 031 defect has returned")
	}
	if !SamedayOffered(bendigoShop, "3550", true, melbourneNoon()) {
		t.Fatal("its own approved area must still work")
	}
}

// ⚠ TERM 3 — the cutoff behaviour, preserved from the rate-grid era and re-expressed here.
func TestSamedayOffered_WithdrawnPastCutoff(t *testing.T) {
	past := time.Date(2026, 7, 21, 15, 0, 0, 0, Melbourne)
	if SamedayOffered(approval(14, "3550"), "3550", true, past) {
		t.Fatal("same-day must be withdrawn past the cutoff")
	}
	justBefore := time.Date(2026, 7, 21, 13, 59, 0, 0, Melbourne)
	if !SamedayOffered(approval(14, "3550"), "3550", true, justBefore) {
		t.Fatal("same-day must stand a minute before the cutoff")
	}
}

// ⚠ TERM 4 (FR-030a) — the one a reader will think redundant. An approval is a claim about a SHOP's
// reach, not a grant of serviceability. If the area is later removed from every delivery zone, the
// approval must stop producing offers rather than outliving the service it depends on.
func TestSamedayOffered_UnservicedDestinationIsRefused(t *testing.T) {
	if SamedayOffered(approval(14, "3550"), "3550", false, melbourneNoon()) {
		t.Fatal("⚠ same-day was offered into an area the platform no longer serves at all")
	}
}

// ⚠ THE TIMEZONE. `cutoff_time` is a wall-clock fact about a shop's working day, and evaluating it
// against a UTC container clock puts it 10 hours wrong — a fault that shows up only in the evening,
// and only in summer. These two instants are the SAME MOMENT expressed two ways; the answer must not
// depend on which one is passed in.
func TestSamedayOffered_JudgesTheCutoffInMelbourne(t *testing.T) {
	// 13:00 Melbourne (before a 14:00 cutoff) is 03:00 UTC the same day.
	local := time.Date(2026, 7, 21, 13, 0, 0, 0, Melbourne)
	asUTC := local.UTC()

	if !SamedayOffered(approval(14, "3550"), "3550", true, local) {
		t.Fatal("13:00 Melbourne is before a 14:00 cutoff")
	}
	if !SamedayOffered(approval(14, "3550"), "3550", true, asUTC) {
		t.Fatal("⚠ the same instant expressed in UTC gave a different answer — the cutoff is being read off the wrong clock")
	}

	// And the mirror: 15:00 Melbourne is past it, however it is expressed.
	after := time.Date(2026, 7, 21, 15, 0, 0, 0, Melbourne)
	if SamedayOffered(approval(14, "3550"), "3550", true, after) ||
		SamedayOffered(approval(14, "3550"), "3550", true, after.UTC()) {
		t.Fatal("15:00 Melbourne is past a 14:00 cutoff, in either representation")
	}
}

// ⚠ Unreachable for a stored approval (shop_sameday_cutoff_ck forbids it), but if the guarantee is
// ever broken, failing to OFFER is recoverable and promising something with no end is not.
func TestSamedayOffered_MissingCutoffFailsClosed(t *testing.T) {
	a := &SamedayApproval{Postcodes: map[string]bool{"3550": true}}
	if SamedayOffered(a, "3550", true, melbourneNoon()) {
		t.Fatal("an approval with no cutoff must fail closed, not promise same-day forever")
	}
}
