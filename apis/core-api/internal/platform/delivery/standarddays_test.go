package delivery

import (
	"reflect"
	"testing"
	"time"
)

// 2026-08-24 is a Monday. `at` (sameday_test.go) builds instants on that day.

func TestAvailableDays(t *testing.T) {
	run2pm := []CollectionRun{{Hour: 14, Minute: 0}} // with a 60-minute buffer: makeable until 13:00

	cases := []struct {
		name      string
		now       time.Time
		runs      []CollectionRun
		lead      int
		lookahead int
		weekdays  []int
		dates     map[string]bool
		want      []string
	}{
		{
			name: "before the last run: collected today and delivered after the lead time",
			now:  at(10, 0), runs: run2pm, lead: 1, lookahead: 3,
			want: []string{"2026-08-25", "2026-08-26", "2026-08-27"},
		},
		{
			name: "after the last run: collected tomorrow",
			now:  at(13, 1), runs: run2pm, lead: 1, lookahead: 3,
			want: []string{"2026-08-26", "2026-08-27", "2026-08-28"},
		},
		{
			name: "no collection runs configured: treated as collected tomorrow",
			now:  at(10, 0), runs: nil, lead: 1, lookahead: 2,
			want: []string{"2026-08-26", "2026-08-27"},
		},
		{
			name: "lead time zero: the hub day itself is deliverable",
			now:  at(10, 0), runs: run2pm, lead: 0, lookahead: 2,
			want: []string{"2026-08-24", "2026-08-25"},
		},
		{
			name: "lead time two",
			now:  at(10, 0), runs: run2pm, lead: 2, lookahead: 2,
			want: []string{"2026-08-26", "2026-08-27"},
		},
		{
			// ⚠ FR-016. Sunday (7) is skipped AND does not use up one of the seven: the customer is
			// offered seven days they can actually choose.
			name: "an excluded weekday is skipped and does not count toward the look-ahead",
			now:  at(10, 0), runs: run2pm, lead: 1, lookahead: 7, weekdays: []int{7},
			want: []string{"2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-31", "2026-09-01"},
		},
		{
			name: "an excluded date is skipped and does not count",
			now:  at(10, 0), runs: run2pm, lead: 1, lookahead: 3, dates: map[string]bool{"2026-08-26": true},
			want: []string{"2026-08-25", "2026-08-27", "2026-08-28"},
		},
		{
			name: "a blocked earliest day moves the list forward",
			now:  at(10, 0), runs: run2pm, lead: 1, lookahead: 2, weekdays: []int{2}, // Tuesday
			want: []string{"2026-08-26", "2026-08-27"},
		},
		{
			name: "a whole blocked week still yields days after it",
			now:  at(10, 0), runs: run2pm, lead: 1, lookahead: 2,
			dates: map[string]bool{
				"2026-08-25": true, "2026-08-26": true, "2026-08-27": true, "2026-08-28": true,
				"2026-08-29": true, "2026-08-30": true, "2026-08-31": true,
			},
			want: []string{"2026-09-01", "2026-09-02"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := AvailableDays(c.now, c.runs, 60, c.lead, c.lookahead, c.weekdays, c.dates)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("got  %v\nwant %v", got, c.want)
			}
		})
	}
}

func TestAvailableDays_AcrossTheYearBoundary(t *testing.T) {
	now := time.Date(2026, 12, 30, 10, 0, 0, 0, MelbourneTZ)
	got := AvailableDays(now, []CollectionRun{{Hour: 14}}, 60, 1, 3, nil, nil)
	want := []string{"2026-12-31", "2027-01-01", "2027-01-02"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

// ⚠ DST. A list built by adding 24 hours to a local midnight repeats a day when the clocks go back and
// skips one when they go forward. Every day must appear exactly once across both transitions.
func TestAvailableDays_DaylightSavingTransitions(t *testing.T) {
	for _, c := range []struct {
		name string
		now  time.Time
		want []string
	}{
		{
			"across the start of daylight saving (4 Oct 2026)",
			time.Date(2026, 10, 2, 10, 0, 0, 0, MelbourneTZ),
			[]string{"2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"},
		},
		{
			"across the end of daylight saving (4 Apr 2027)",
			time.Date(2027, 4, 2, 10, 0, 0, 0, MelbourneTZ),
			[]string{"2027-04-03", "2027-04-04", "2027-04-05", "2027-04-06"},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := AvailableDays(c.now, []CollectionRun{{Hour: 14}}, 60, 1, 4, nil, nil)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("got %v, want %v", got, c.want)
			}
		})
	}
}

// Late on a Melbourne evening is already the next day in UTC+… no: it is still the PREVIOUS day in
// UTC. The hub day must be the Melbourne one.
func TestAvailableDays_UsesTheMelbourneDay(t *testing.T) {
	// 22:00 UTC on the 23rd is 08:00 on Monday the 24th in Melbourne — before the run.
	now := time.Date(2026, 8, 23, 22, 0, 0, 0, time.UTC)
	got := AvailableDays(now, []CollectionRun{{Hour: 14}}, 60, 1, 1, nil, nil)
	if len(got) != 1 || got[0] != "2026-08-25" {
		t.Errorf("got %v, want [2026-08-25]", got)
	}
}

func TestAvailableDays_NeverMoreThanTheLookahead(t *testing.T) {
	got := AvailableDays(at(10, 0), nil, 60, 1, 30, nil, nil)
	if len(got) != 30 {
		t.Errorf("got %d days, want 30", len(got))
	}
}
