package delivery

import (
	"testing"
	"time"
)

// ⚠⚠ THE CROSS-LANGUAGE CONTRACT (063). This file and
// `apis/edge-api/shared/src/lib/collection-deadline.contract.test.ts` consume BYTE-IDENTICAL
// fixtures, duplicated by hand.
//
// WHY A DUPLICATE EXISTS AT ALL. The wave planner is a TypeScript Lambda; SameDayCutoff is Go on the
// hot path. Principle II's shared-package mechanism does not span the two runtimes, and the
// alternative — the planner calling core-api for the deadline — would make wave planning depend on
// the hot path being up, where a missed wave is SILENT: no error, no alarm, just packages that do not
// move (research R2, and 053's "unconfigured FCM halted the whole drain").
//
// ⚠ 054 SPENT A WHOLE SLICE DELETING A RULE WRITTEN IN 14 PLACES. This one is written in two on
// purpose, and is defensible ONLY while these fixtures agree with the TypeScript ones. If this test
// is ever weakened, delete one implementation rather than keeping both.
//
// ⚠ THE DST ROWS ARE THE POINT. 058 found two real calendar bugs that only DST tests caught, one of
// which silently skipped an entire trading hour — both from rebuilding an instant out of wall-clock
// fields, which is exactly what both implementations do. Melbourne 2026: DST ENDS Sun 5 April
// (03:00 -> 02:00, so 02:30 happens twice) and STARTS Sun 4 October (02:00 -> 03:00, so 02:30 never
// happens).
//
// Precedent: 028 closed 027's biggest carry-forward this way — a Go test and a Kotlin test sharing
// one hand-duplicated literal, proven by breaking it two ways.

// ─── FIXTURES — keep byte-identical with the TypeScript side ──────────────────────────────────────
var deadlineContractFixtures = []struct {
	name      string
	onDate    string
	runHour   int
	runMinute int
	bufferMin int
	expect    string
}{
	{
		name:      "summer, AEDT +11",
		onDate:    "2026-01-15T00:00:00Z",
		runHour:   14,
		runMinute: 0,
		bufferMin: 60,
		expect:    "2026-01-15T02:00:00.000Z",
	},
	{
		name:      "winter, AEST +10",
		onDate:    "2026-07-15T00:00:00Z",
		runHour:   14,
		runMinute: 0,
		bufferMin: 60,
		expect:    "2026-07-15T03:00:00.000Z",
	},
	{
		name:      "the day DST ENDS, run after the transition",
		onDate:    "2026-04-05T00:00:00Z",
		runHour:   14,
		runMinute: 0,
		bufferMin: 60,
		expect:    "2026-04-05T03:00:00.000Z",
	},
	{
		name:      "the day DST STARTS, run after the transition",
		onDate:    "2026-10-04T00:00:00Z",
		runHour:   14,
		runMinute: 0,
		bufferMin: 60,
		expect:    "2026-10-04T02:00:00.000Z",
	},
	{
		// ⚠ 02:30 occurs TWICE. The earlier instant wins — a deadline may be strict, never loose.
		name:      "AMBIGUOUS local time — 02:30 on the day DST ends",
		onDate:    "2026-04-05T00:00:00Z",
		runHour:   2,
		runMinute: 30,
		bufferMin: 0,
		expect:    "2026-04-04T15:30:00.000Z",
	},
	{
		// ⚠ 02:30 NEVER HAPPENS. The instant just before the gap wins, by the same rule.
		name:      "NON-EXISTENT local time — 02:30 on the day DST starts",
		onDate:    "2026-10-04T00:00:00Z",
		runHour:   2,
		runMinute: 30,
		bufferMin: 0,
		expect:    "2026-10-03T15:30:00.000Z",
	},
	{
		name:      "zero buffer is the run time itself",
		onDate:    "2026-06-01T00:00:00Z",
		runHour:   9,
		runMinute: 15,
		bufferMin: 0,
		expect:    "2026-05-31T23:15:00.000Z",
	},
	{
		name:      "a buffer that crosses back over local midnight",
		onDate:    "2026-06-01T00:00:00Z",
		runHour:   0,
		runMinute: 30,
		bufferMin: 60,
		expect:    "2026-05-31T13:30:00.000Z",
	},
}

// ─── END FIXTURES ────────────────────────────────────────────────────────────────────────────────

// CollectionDeadline is the Go reading of the same schedule the planner reads: given a run and the
// prep buffer, when must collection be complete on the local date containing `onDate`?
//
// ⚠ AMBIGUOUS AND NON-EXISTENT LOCAL TIMES BOTH RESOLVE TO THE EARLIER INSTANT — one rule, matching
// the TypeScript side exactly. Go's time.Date resolves a skipped time forward by default, so the
// ambiguity is handled explicitly rather than inherited from the standard library.
func CollectionDeadline(run CollectionRun, bufferMin int, onDate time.Time) time.Time {
	local := onDate.In(MelbourneTZ)
	y, mo, d := local.Date()

	// The two offsets that can be in force around this local time; a day either side catches one
	// transition without catching two.
	_, offBefore := time.Date(y, mo, d, run.Hour, run.Minute, 0, 0, time.UTC).Add(-24 * time.Hour).In(MelbourneTZ).Zone()
	_, offAfter := time.Date(y, mo, d, run.Hour, run.Minute, 0, 0, time.UTC).Add(24 * time.Hour).In(MelbourneTZ).Zone()

	naive := time.Date(y, mo, d, run.Hour, run.Minute, 0, 0, time.UTC)
	seen := map[int]bool{}
	var candidates []time.Time
	for _, off := range []int{offBefore, offAfter} {
		if seen[off] {
			continue
		}
		seen[off] = true
		candidates = append(candidates, naive.Add(-time.Duration(off)*time.Second))
	}
	// Earliest first.
	if len(candidates) == 2 && candidates[1].Before(candidates[0]) {
		candidates[0], candidates[1] = candidates[1], candidates[0]
	}

	// Normally one candidate reads back as the requested wall time; two do when ambiguous, none when
	// the time was skipped. Earliest wins in every case.
	var valid []time.Time
	for _, c := range candidates {
		lc := c.In(MelbourneTZ)
		if lc.Year() == y && lc.Month() == mo && lc.Day() == d && lc.Hour() == run.Hour && lc.Minute() == run.Minute {
			valid = append(valid, c)
		}
	}
	chosen := candidates[0]
	if len(valid) > 0 {
		chosen = valid[0]
	}
	return chosen.Add(-time.Duration(bufferMin) * time.Minute)
}

func TestCollectionDeadlineContract(t *testing.T) {
	for _, f := range deadlineContractFixtures {
		t.Run(f.name, func(t *testing.T) {
			onDate, err := time.Parse(time.RFC3339, f.onDate)
			if err != nil {
				t.Fatalf("bad fixture date %q: %v", f.onDate, err)
			}
			got := CollectionDeadline(CollectionRun{Hour: f.runHour, Minute: f.runMinute}, f.bufferMin, onDate)
			want := got.UTC().Format("2006-01-02T15:04:05.000Z")
			if want != f.expect {
				t.Fatalf("deadline mismatch\n  run:      %02d:%02d, buffer %d\n  onDate:   %s\n  got:      %s\n  expected: %s\n\n"+
					"⚠ This is the CROSS-LANGUAGE CONTRACT. Either Go and TypeScript now disagree about when\n"+
					"  collection must finish — which means the planner and checkout disagree about the same\n"+
					"  schedule — or a fixture was changed on one side only. Fix the implementation, not the\n"+
					"  fixture, unless you have changed both sides deliberately.",
					f.runHour, f.runMinute, f.bufferMin, f.onDate, want, f.expect)
			}
		})
	}
}

// ⚠ A fixture set without the transitions proves nothing at all — it would pass with the arithmetic
// done in UTC, which is the defect this whole test exists to prevent.
func TestCollectionDeadlineContractCoversBothTransitions(t *testing.T) {
	var ambiguous, nonExistent bool
	for _, f := range deadlineContractFixtures {
		if f.name == "AMBIGUOUS local time — 02:30 on the day DST ends" {
			ambiguous = true
		}
		if f.name == "NON-EXISTENT local time — 02:30 on the day DST starts" {
			nonExistent = true
		}
	}
	if !ambiguous || !nonExistent {
		t.Fatal("the contract fixtures must cover BOTH DST transitions (058 found two real calendar bugs that only DST tests caught)")
	}
}
