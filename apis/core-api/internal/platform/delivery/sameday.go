package delivery

import (
	"context"
	"fmt"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// MelbourneTZ is the platform's operating timezone. Same-day cutoffs are wall-clock facts about Effy's
// working day and MUST be judged here, never in UTC or the shopper's device clock (FR-041). ⚠ Falls back
// to a fixed +10:00 if the tzdata is unavailable in the runtime (a slim container), so the comparison is
// never silently done in UTC.
var MelbourneTZ = mustLoadMelbourne()

func mustLoadMelbourne() *time.Location {
	if loc, err := time.LoadLocation("Australia/Melbourne"); err == nil {
		return loc
	}
	return time.FixedZone("AEST", 10*60*60)
}

// CollectionRun is one daily driver collection, as a wall-clock time-of-day (Australia/Melbourne).
type CollectionRun struct {
	Hour   int
	Minute int
}

// SameDayCutoff returns the LATEST still-makeable same-day cutoff instant for `now`, given the active
// collection runs and the shop prep buffer. A run is makeable when now ≤ run_time − buffer. With one run
// this is a single daily cutoff; with several, availability extends run-by-run through the day (the
// hybrid, research R6). ok=false when no run today can still be made (same-day is simply not offered).
func SameDayCutoff(now time.Time, runs []CollectionRun, bufferMin int) (time.Time, bool) {
	nowM := now.In(MelbourneTZ)
	y, mo, d := nowM.Date()
	var best time.Time
	found := false
	for _, r := range runs {
		cutoff := time.Date(y, mo, d, r.Hour, r.Minute, 0, 0, MelbourneTZ).
			Add(-time.Duration(bufferMin) * time.Minute)
		if nowM.After(cutoff) {
			continue // this run's cutoff has passed
		}
		if !found || cutoff.After(best) {
			best, found = cutoff, true
		}
	}
	return best, found
}

// SameDaySchedule reads the active collection runs + the prep buffer (settings). Missing settings mean no
// hub/buffer configured → no same-day (buffer 0, no runs handled by the caller). A zone/plan can exist
// before the schedule does, so this returns empty rather than erroring on absence.
func SameDaySchedule(ctx context.Context, q db.DBTX) (runs []CollectionRun, bufferMin int, err error) {
	if err := q.QueryRow(ctx,
		`SELECT sameday_prep_buffer_min FROM public.delivery_settings WHERE id = 1`).Scan(&bufferMin); err != nil {
		// No settings row yet → treat buffer as 0; runs below decide availability.
		bufferMin = 0
	}
	rows, qerr := q.Query(ctx, `
		SELECT EXTRACT(HOUR FROM run_time)::int, EXTRACT(MINUTE FROM run_time)::int
		FROM public.delivery_collection_run WHERE status = 'active' ORDER BY run_time`)
	if qerr != nil {
		return nil, 0, fmt.Errorf("delivery: collection runs query: %w", qerr)
	}
	defer rows.Close()
	for rows.Next() {
		var r CollectionRun
		if err := rows.Scan(&r.Hour, &r.Minute); err != nil {
			return nil, 0, fmt.Errorf("delivery: scan collection run: %w", err)
		}
		runs = append(runs, r)
	}
	return runs, bufferMin, rows.Err()
}
