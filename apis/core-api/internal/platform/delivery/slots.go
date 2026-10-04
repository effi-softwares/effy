package delivery

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// Slot is a same-day delivery window as the back-office defined it (069): wall-clock times of day in
// Australia/Melbourne, a cutoff after which it cannot be chosen, and how many deliveries it takes.
type Slot struct {
	ID       string
	Start    Clock
	End      Clock
	Cutoff   Clock
	Capacity int
}

// Clock is a wall-clock time of day. It names no date and no zone — it describes Effy's working day.
type Clock struct {
	Hour   int
	Minute int
}

// on places the clock on the Melbourne calendar day that `day` falls on.
//
// ⚠ THIS IS THE ONE PLACE A SLOT BECOMES AN INSTANT. The result is stored (the booking, the package)
// and every later reader — the planner, the driver app, the receipt — reads that stored instant. 058
// found two calendar defects that only DST tests caught, both from rebuilding an instant out of
// wall-clock fields in more than one place.
func (c Clock) on(day time.Time) time.Time {
	y, m, d := day.In(MelbourneTZ).Date()
	return time.Date(y, m, d, c.Hour, c.Minute, 0, 0, MelbourneTZ)
}

// OpenSlot is a slot a customer may choose right now, as instants.
type OpenSlot struct {
	ID    string
	Date  string // yyyy-mm-dd, Melbourne
	Start time.Time
	End   time.Time
	// Cutoff is the EFFECTIVE last moment: the slot's own cutoff, or the last collection that can still
	// serve it, whichever comes first.
	Cutoff time.Time
}

// SlotVerdict says why a slot is not open — or that it is.
type SlotVerdict string

const (
	SlotOpen          SlotVerdict = "open"
	SlotPastCutoff    SlotVerdict = "cutoff"
	SlotFull          SlotVerdict = "full"
	SlotUncollectable SlotVerdict = "uncollectable"
)

// JudgeSlot decides whether one slot can be chosen at `now` (069 research R5). It is open when:
//
//  1. its own cutoff has not passed;
//  2. a collection run is still makeable (now ≤ run − prep buffer, the 047 rule) AND that run reaches
//     the hub in time to go out for it (run + turnaround ≤ slot start);
//  3. it has capacity left.
//
// ⚠ ORDER MATTERS FOR THE REASON, NOT THE RESULT: a slot that is both full and past cutoff reports
// the cutoff, because "it has closed" stays true and "it is full" might not.
//
// Pure: no clock, no database. `booked` is what public.delivery_slot_load says.
func JudgeSlot(now time.Time, s Slot, booked int, runs []CollectionRun, bufferMin, turnaroundMin int) (OpenSlot, SlotVerdict) {
	nowM := now.In(MelbourneTZ)
	start := s.Start.on(nowM)
	end := s.End.on(nowM)
	cutoff := s.Cutoff.on(nowM)

	if nowM.After(cutoff) {
		return OpenSlot{}, SlotPastCutoff
	}

	// The latest collection run that can still be made AND still gets the goods out in time.
	var lastOrder time.Time
	collectable := false
	for _, r := range runs {
		run := Clock{Hour: r.Hour, Minute: r.Minute}.on(nowM)
		orderBy := run.Add(-time.Duration(bufferMin) * time.Minute)
		if nowM.After(orderBy) {
			continue // this run can no longer be made
		}
		if run.Add(time.Duration(turnaroundMin) * time.Minute).After(start) {
			continue // made, but it reaches the hub too late for this slot
		}
		if !collectable || orderBy.After(lastOrder) {
			lastOrder, collectable = orderBy, true
		}
	}
	if !collectable {
		return OpenSlot{}, SlotUncollectable
	}
	if booked >= s.Capacity {
		return OpenSlot{}, SlotFull
	}

	effective := cutoff
	if lastOrder.Before(effective) {
		effective = lastOrder
	}
	return OpenSlot{
		ID:     s.ID,
		Date:   nowM.Format("2006-01-02"),
		Start:  start,
		End:    end,
		Cutoff: effective,
	}, SlotOpen
}

// OpenSlots returns every slot that can be chosen at `now`, earliest first.
func OpenSlots(now time.Time, slots []Slot, booked map[string]int, runs []CollectionRun, bufferMin, turnaroundMin int) []OpenSlot {
	out := make([]OpenSlot, 0, len(slots))
	for _, s := range slots {
		if o, v := JudgeSlot(now, s, booked[s.ID], runs, bufferMin, turnaroundMin); v == SlotOpen {
			out = append(out, o)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].Start.Equal(out[j].Start) {
			return out[i].Start.Before(out[j].Start)
		}
		return out[i].End.Before(out[j].End)
	})
	return out
}

// MelbourneDate is the Melbourne calendar date at an instant, as yyyy-mm-dd.
func MelbourneDate(at time.Time) string { return at.In(MelbourneTZ).Format("2006-01-02") }

// ── Settings ────────────────────────────────────────────────────────────────────────────────────────

// SlotSettings are the 069 timings read from the singleton settings row.
type SlotSettings struct {
	HoldMin         int
	TurnaroundMin   int
	LookaheadDays   int
	NoWeekdays      []int // ISO: 1 = Monday … 7 = Sunday
	CarrierLeadDays int
}

// defaultSlotSettings mirror the column defaults in the 069 migration. Used only when the settings row
// does not exist yet — a zone and a plan can exist before a hub is configured (the SameDaySchedule rule).
var defaultSlotSettings = SlotSettings{HoldMin: 10, TurnaroundMin: 60, LookaheadDays: 7, CarrierLeadDays: 1}

// LoadSlotSettings reads the 069 settings.
func LoadSlotSettings(ctx context.Context, q db.DBTX) (SlotSettings, error) {
	var s SlotSettings
	var weekdays []int16
	err := q.QueryRow(ctx, `
		SELECT slot_hold_min, sameday_hub_turnaround_min, standard_lookahead_days,
		       standard_no_delivery_weekdays, carrier_lead_days
		FROM public.delivery_settings WHERE id = 1`).
		Scan(&s.HoldMin, &s.TurnaroundMin, &s.LookaheadDays, &weekdays, &s.CarrierLeadDays)
	if errors.Is(err, pgx.ErrNoRows) {
		return defaultSlotSettings, nil
	}
	if err != nil {
		return SlotSettings{}, fmt.Errorf("delivery: slot settings query: %w", err)
	}
	for _, w := range weekdays {
		s.NoWeekdays = append(s.NoWeekdays, int(w))
	}
	return s, nil
}

// ── Slots and their load ────────────────────────────────────────────────────────────────────────────

const slotColumns = `id::text,
		       EXTRACT(HOUR FROM start_time)::int,  EXTRACT(MINUTE FROM start_time)::int,
		       EXTRACT(HOUR FROM end_time)::int,    EXTRACT(MINUTE FROM end_time)::int,
		       EXTRACT(HOUR FROM cutoff_time)::int, EXTRACT(MINUTE FROM cutoff_time)::int,
		       capacity`

func scanSlot(row pgx.Row) (Slot, error) {
	var s Slot
	err := row.Scan(&s.ID, &s.Start.Hour, &s.Start.Minute, &s.End.Hour, &s.End.Minute,
		&s.Cutoff.Hour, &s.Cutoff.Minute, &s.Capacity)
	return s, err
}

// LoadSlots reads the active slots.
func LoadSlots(ctx context.Context, q db.DBTX) ([]Slot, error) {
	rows, err := q.Query(ctx, `
		SELECT `+slotColumns+`
		-- availability-exempt: public.delivery_slot — a delivery window's lifecycle.
		FROM public.delivery_slot WHERE status = 'active' ORDER BY start_time, end_time`)
	if err != nil {
		return nil, fmt.Errorf("delivery: slots query: %w", err)
	}
	defer rows.Close()
	var out []Slot
	for rows.Next() {
		s, err := scanSlot(rows)
		if err != nil {
			return nil, fmt.Errorf("delivery: scan slot: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// LockSlot reads one ACTIVE slot and takes its row lock for the rest of the transaction.
//
// ⚠ THE LOCK IS THE CAPACITY GUARANTEE (research R4). "At most N" cannot be a unique index, so two
// customers taking the last place are serialised here: the second waits, then counts the first's hold.
// Remove `FOR UPDATE` and both read "one place left" and both take it. ok=false when the slot does not
// exist or is disabled.
func LockSlot(ctx context.Context, tx db.DBTX, slotID string) (Slot, bool, error) {
	s, err := scanSlot(tx.QueryRow(ctx, `
		SELECT `+slotColumns+`
		-- availability-exempt: public.delivery_slot — a delivery window's lifecycle.
		FROM public.delivery_slot WHERE id = $1 AND status = 'active'
		FOR UPDATE`, slotID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Slot{}, false, nil
	}
	if err != nil {
		return Slot{}, false, fmt.Errorf("delivery: lock slot: %w", err)
	}
	return s, true, nil
}

// SlotLoad reads how many places are taken in each slot on a Melbourne date.
//
// ⚠ It reads public.delivery_slot_load and nothing else. That view is the ONE definition of "a booking
// counts" (confirmed, or held and not lapsed); the back-office console reads the same view.
func SlotLoad(ctx context.Context, q db.DBTX, date string) (map[string]int, error) {
	rows, err := q.Query(ctx, `
		SELECT slot_id::text, booked FROM public.delivery_slot_load WHERE delivery_date = $1::date`, date)
	if err != nil {
		return nil, fmt.Errorf("delivery: slot load query: %w", err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("delivery: scan slot load: %w", err)
		}
		out[id] = n
	}
	return out, rows.Err()
}

// OwnLiveHolds reads the places this customer's OWN unpaid checkout is holding on a date.
//
// A quote subtracts these: without it a customer who reached the payment step in a capacity-1 slot and
// went back would be told the slot they are holding is full — by their own hold.
func OwnLiveHolds(ctx context.Context, q db.DBTX, customerID, date string) (map[string]int, error) {
	out := map[string]int{}
	if customerID == "" {
		return out, nil
	}
	rows, err := q.Query(ctx, `
		SELECT b.slot_id::text, count(*)::int
		FROM public.delivery_slot_booking b
		JOIN public."order" o ON o.id = b.order_id
		WHERE o.customer_id = $1 AND o.status = 'pending_payment'
		  AND b.delivery_date = $2::date AND b.state = 'held' AND b.held_until > now()
		GROUP BY b.slot_id`, customerID, date)
	if err != nil {
		return nil, fmt.Errorf("delivery: own holds query: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("delivery: scan own holds: %w", err)
		}
		out[id] = n
	}
	return out, rows.Err()
}
