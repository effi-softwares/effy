package delivery

import (
	"context"
	"fmt"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// maxDayScan bounds the search for deliverable days. The settings forbid excluding all seven weekdays
// (a CHECK), so a deliverable day always exists within a week; this guards the loop against a long run
// of individually excluded dates rather than against never terminating.
const maxDayScan = 60

// AvailableDays returns the days a standard delivery can arrive, earliest first (069 research R6).
//
//   - The HUB DAY is today while a collection run can still be made, otherwise tomorrow.
//   - The EARLIEST delivery day is the hub day plus the carrier's lead time.
//   - From there, `lookahead` DELIVERABLE days are offered. A non-delivery day is skipped and does not
//     count toward the look-ahead (FR-016): "seven days" means seven days the customer can choose.
//
// ⚠ There is no existing rule to inherit. `promised_from`/`promised_to` were never written before 069
// (research R1), so this is the platform's first statement of when a standard order arrives.
//
// Pure: no clock, no database. Days are yyyy-mm-dd Melbourne dates; noWeekdays are ISO (1 = Monday).
func AvailableDays(now time.Time, runs []CollectionRun, bufferMin, leadDays, lookahead int, noWeekdays []int, noDates map[string]bool) []string {
	nowM := now.In(MelbourneTZ)
	y, m, d := nowM.Date()
	// ⚠ Calendar arithmetic at NOON UTC, never at Melbourne midnight: on the day the clocks change a
	// local midnight plus 24 hours is not the next midnight, and the list would repeat or skip a day.
	day := time.Date(y, m, d, 12, 0, 0, 0, time.UTC)

	if _, makeable := SameDayCutoff(now, runs, bufferMin); !makeable {
		day = day.AddDate(0, 0, 1)
	}
	day = day.AddDate(0, 0, leadDays)

	blocked := map[int]bool{}
	for _, w := range noWeekdays {
		blocked[w] = true
	}

	out := make([]string, 0, lookahead)
	for scanned := 0; scanned < maxDayScan && len(out) < lookahead; scanned++ {
		iso := day.Format("2006-01-02")
		if !blocked[isoWeekday(day)] && !noDates[iso] {
			out = append(out, iso)
		}
		day = day.AddDate(0, 0, 1)
	}
	return out
}

// isoWeekday maps Go's Sunday = 0 onto ISO's Monday = 1 … Sunday = 7.
func isoWeekday(t time.Time) int {
	if w := int(t.Weekday()); w != 0 {
		return w
	}
	return 7
}

// NonDeliveryDates reads the individually excluded dates from `from` (yyyy-mm-dd) onward.
func NonDeliveryDates(ctx context.Context, q db.DBTX, from string) (map[string]bool, error) {
	rows, err := q.Query(ctx, `
		SELECT day::text FROM public.delivery_non_delivery_date WHERE day >= $1::date`, from)
	if err != nil {
		return nil, fmt.Errorf("delivery: non-delivery dates query: %w", err)
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var day string
		if err := rows.Scan(&day); err != nil {
			return nil, fmt.Errorf("delivery: scan non-delivery date: %w", err)
		}
		out[day] = true
	}
	return out, rows.Err()
}
