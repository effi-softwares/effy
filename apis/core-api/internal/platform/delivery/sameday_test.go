package delivery

import (
	"testing"
	"time"
)

// at builds an instant at a wall-clock time in Melbourne on a fixed date.
func at(hour, min int) time.Time {
	return time.Date(2026, 8, 24, hour, min, 0, 0, MelbourneTZ)
}

func TestSameDayCutoff_SingleRun(t *testing.T) {
	runs := []CollectionRun{{Hour: 14, Minute: 0}} // 2pm
	buffer := 120                                  // → cutoff 12:00

	// Before the cutoff: offered, and the cutoff is 12:00.
	cutoff, ok := SameDayCutoff(at(11, 30), runs, buffer)
	if !ok {
		t.Fatal("11:30 should be before the 12:00 cutoff")
	}
	if cutoff.Hour() != 12 || cutoff.Minute() != 0 {
		t.Errorf("cutoff = %02d:%02d, want 12:00", cutoff.Hour(), cutoff.Minute())
	}

	// Exactly at the cutoff: still offered (inclusive).
	if _, ok := SameDayCutoff(at(12, 0), runs, buffer); !ok {
		t.Error("12:00 exactly should still be offered")
	}

	// After the cutoff: not offered.
	if _, ok := SameDayCutoff(at(12, 30), runs, buffer); ok {
		t.Error("12:30 should be past the 12:00 cutoff")
	}
}

func TestSameDayCutoff_MultipleRunsExtendAvailability(t *testing.T) {
	runs := []CollectionRun{{Hour: 11, Minute: 0}, {Hour: 17, Minute: 0}} // 11am + 5pm
	buffer := 60                                                          // cutoffs 10:00 and 16:00

	// After the first cutoff but before the second → still offered, against the LATER cutoff (16:00).
	cutoff, ok := SameDayCutoff(at(12, 0), runs, buffer)
	if !ok {
		t.Fatal("12:00 should still be offered against the 5pm run")
	}
	if cutoff.Hour() != 16 {
		t.Errorf("cutoff = %02d:00, want 16:00 (the latest makeable run)", cutoff.Hour())
	}

	// After both cutoffs → not offered.
	if _, ok := SameDayCutoff(at(16, 30), runs, buffer); ok {
		t.Error("16:30 should be past both cutoffs")
	}
}

func TestSameDayCutoff_NoRuns(t *testing.T) {
	if _, ok := SameDayCutoff(at(9, 0), nil, 60); ok {
		t.Error("no runs → same-day never offered")
	}
}

func TestSameDayCutoff_EvaluatedInMelbourne(t *testing.T) {
	runs := []CollectionRun{{Hour: 14, Minute: 0}}
	buffer := 0
	// 03:00 UTC on 2026-08-24 == 13:00 AEST — before the 14:00 cutoff, so it must be offered. A naive UTC
	// comparison would read 03:00 and be wrong only in the evening / only in summer (the daylight trap).
	utc := time.Date(2026, 8, 24, 3, 0, 0, 0, time.UTC)
	if _, ok := SameDayCutoff(utc, runs, buffer); !ok {
		t.Error("03:00 UTC (13:00 AEST) should be before the 14:00 Melbourne cutoff")
	}
}
