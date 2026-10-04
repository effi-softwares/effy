package delivery

import (
	"testing"
	"time"
)

// evening is the slot most of these cases judge: 17:00–19:00, choosable until 15:00, capacity 2.
var evening = Slot{ID: "evening", Start: Clock{17, 0}, End: Clock{19, 0}, Cutoff: Clock{15, 0}, Capacity: 2}

// One collection run at 14:00 with a 60-minute prep buffer: it can be made until 13:00, and with a
// 60-minute hub turnaround the goods are ready to leave at 15:00.
var oneRun = []CollectionRun{{Hour: 14, Minute: 0}}

func TestJudgeSlot(t *testing.T) {
	cases := []struct {
		name       string
		now        time.Time
		slot       Slot
		booked     int
		runs       []CollectionRun
		buffer     int
		turnaround int
		want       SlotVerdict
	}{
		{"open well before everything", at(10, 0), evening, 0, oneRun, 60, 60, SlotOpen},
		{"open with one place left", at(10, 0), evening, 1, oneRun, 60, 60, SlotOpen},
		{"full at capacity", at(10, 0), evening, 2, oneRun, 60, 60, SlotFull},
		{"full above capacity (a late payer was honoured)", at(10, 0), evening, 3, oneRun, 60, 60, SlotFull},
		{"open exactly at the last order time for the run", at(13, 0), evening, 0, oneRun, 60, 60, SlotOpen},
		{"uncollectable once the only run cannot be made", at(13, 1), evening, 0, oneRun, 60, 60, SlotUncollectable},
		{"past the slot's own cutoff", at(15, 1), evening, 0, []CollectionRun{{Hour: 16, Minute: 30}}, 0, 0, SlotPastCutoff},
		{"open exactly at the slot's cutoff", at(15, 0), evening, 0, []CollectionRun{{Hour: 16, Minute: 30}}, 0, 0, SlotOpen},
		{"past cutoff wins over full", at(15, 1), evening, 2, []CollectionRun{{Hour: 16, Minute: 30}}, 0, 0, SlotPastCutoff},
		{"uncollectable when the run reaches the hub after the slot starts", at(10, 0), evening, 0, []CollectionRun{{Hour: 16, Minute: 30}}, 60, 60, SlotUncollectable},
		{"collectable when the run lands exactly at the slot's start", at(10, 0), evening, 0, []CollectionRun{{Hour: 16, Minute: 0}}, 60, 60, SlotOpen},
		{"uncollectable with no runs configured", at(10, 0), evening, 0, nil, 60, 60, SlotUncollectable},
		{"a later run that still serves the slot keeps it open", at(13, 30), evening, 0, []CollectionRun{{Hour: 14, Minute: 0}, {Hour: 15, Minute: 30}}, 60, 60, SlotOpen},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, got := JudgeSlot(c.now, c.slot, c.booked, c.runs, c.buffer, c.turnaround)
			if got != c.want {
				t.Errorf("verdict = %q, want %q", got, c.want)
			}
		})
	}
}

func TestJudgeSlot_WindowAndEffectiveCutoff(t *testing.T) {
	o, v := JudgeSlot(at(10, 0), evening, 0, oneRun, 60, 60)
	if v != SlotOpen {
		t.Fatalf("verdict = %q, want open", v)
	}
	if o.Date != "2026-08-24" {
		t.Errorf("date = %s, want 2026-08-24", o.Date)
	}
	if !o.Start.Equal(at(17, 0)) || !o.End.Equal(at(19, 0)) {
		t.Errorf("window = %s – %s, want 17:00 – 19:00", o.Start, o.End)
	}
	// ⚠ The slot says 15:00, but the only run that serves it must be ordered by 13:00. Telling the
	// customer "until 3 pm" would be telling them something the collection schedule cannot honour.
	if !o.Cutoff.Equal(at(13, 0)) {
		t.Errorf("effective cutoff = %s, want 13:00 (the run's last order time)", o.Cutoff)
	}

	// With a run that leaves more room than the slot's own cutoff, the slot's cutoff is the limit.
	o, _ = JudgeSlot(at(10, 0), evening, 0, []CollectionRun{{Hour: 16, Minute: 0}}, 0, 60)
	if !o.Cutoff.Equal(at(15, 0)) {
		t.Errorf("effective cutoff = %s, want the slot's own 15:00", o.Cutoff)
	}
}

func TestOpenSlots_EarliestFirstAndOnlyOpen(t *testing.T) {
	late := Slot{ID: "late", Start: Clock{19, 0}, End: Clock{21, 0}, Cutoff: Clock{17, 0}, Capacity: 5}
	full := Slot{ID: "full", Start: Clock{18, 0}, End: Clock{20, 0}, Cutoff: Clock{16, 0}, Capacity: 1}

	got := OpenSlots(at(10, 0), []Slot{late, full, evening}, map[string]int{"full": 1}, oneRun, 60, 60)
	if len(got) != 2 || got[0].ID != "evening" || got[1].ID != "late" {
		t.Fatalf("got %+v, want [evening late]", got)
	}
}

// ⚠ DST. On both transition days a slot must still mean the wall-clock times the operator typed, and
// its instants must be two real hours apart. 058 found two calendar defects that only tests like this
// caught, one of which silently skipped a trading hour.
func TestJudgeSlot_DaylightSavingDays(t *testing.T) {
	for _, day := range []struct {
		name       string
		y          int
		m          time.Month
		d          int
		wantOffset int // seconds east of UTC in the evening of that day
	}{
		{"the day daylight saving starts", 2026, time.October, 4, 11 * 3600},
		{"the day daylight saving ends", 2027, time.April, 4, 10 * 3600},
	} {
		t.Run(day.name, func(t *testing.T) {
			now := time.Date(day.y, day.m, day.d, 10, 0, 0, 0, MelbourneTZ)
			o, v := JudgeSlot(now, evening, 0, oneRun, 60, 60)
			if v != SlotOpen {
				t.Fatalf("verdict = %q, want open", v)
			}
			if o.Start.Hour() != 17 || o.End.Hour() != 19 {
				t.Errorf("wall clock = %02d–%02d, want 17–19", o.Start.Hour(), o.End.Hour())
			}
			if got := o.End.Sub(o.Start); got != 2*time.Hour {
				t.Errorf("window is %s long, want 2h", got)
			}
			if _, off := o.Start.Zone(); off != day.wantOffset {
				t.Errorf("offset = %ds, want %ds", off, day.wantOffset)
			}
			if o.Date != now.Format("2006-01-02") {
				t.Errorf("date = %s, want %s", o.Date, now.Format("2006-01-02"))
			}
		})
	}
}

// A request arriving as a UTC instant is judged on the Melbourne day it falls on, not the UTC one.
func TestJudgeSlot_JudgedOnTheMelbourneDay(t *testing.T) {
	// 23:30 UTC on the 23rd is 09:30 on the 24th in Melbourne.
	now := time.Date(2026, 8, 23, 23, 30, 0, 0, time.UTC)
	o, v := JudgeSlot(now, evening, 0, oneRun, 60, 60)
	if v != SlotOpen || o.Date != "2026-08-24" {
		t.Errorf("verdict %q date %s, want open on 2026-08-24", v, o.Date)
	}
}
