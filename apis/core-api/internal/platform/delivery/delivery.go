// Package delivery is the PURE per-package delivery-pricing core (021). No DB, no HTTP — it turns a
// package's (origin zone, destination zone) and the offerings for that leg into the customer's
// selectable options, and prices a chosen method. The checkout feature does the DB reads and hands the
// results here, so this logic is exhaustively unit-testable without a database (the money path's core).
//
// It says NOTHING about who delivers (FR-020) or which shop (FR-019) — it works in zones and money only.
package delivery

import (
	"sort"
	"time"
)

// Method is a delivery service level. The customer-facing label is derived, not stored here.
type Method string

const (
	MethodSameDay   Method = "same_day"
	MethodScheduled Method = "scheduled"
	MethodStandard  Method = "standard"
)

// Offering is one row of the rate table for a leg (a (origin zone -> destination zone) pair): a method,
// its price, its window, and — for same-day — the daily cutoff after which it is withdrawn.
type Offering struct {
	Method        Method
	PriceCents    int64
	LeadDaysMin   int
	LeadDaysMax   int
	SameDayCutoff *time.Time // wall-clock time-of-day (only the H:M:S matter); nil = no cutoff
}

// Option is a selectable delivery option presented to the customer for one package.
type Option struct {
	Method        Method
	ServiceLevel  string // customer-facing label
	FeeCents      int64
	Window        string   // derived, e.g. "Today by 6pm" / "in 2-3 days"; empty for scheduled
	ScheduleDates []string // ISO dates for scheduled; nil otherwise
}

// serviceLevelLabel is the single place method -> customer label lives.
func serviceLevelLabel(m Method) string {
	switch m {
	case MethodSameDay:
		return "Same-day"
	case MethodScheduled:
		return "Scheduled"
	case MethodStandard:
		return "Standard"
	default:
		return string(m)
	}
}

// Options returns the selectable options for a package, given the offerings for its leg and the current
// time. Same-day is withdrawn when now is past its cutoff (the edge case). Options are ordered fastest
// first (same_day, scheduled, standard) so a "fastest" default preference is the first serviceable one.
//
// An empty result means the package is undeliverable to this destination (no active offering) — the
// caller marks it serviceable:false and auto-sets-aside its items (FR-006b).
func Options(offerings []Offering, now time.Time, scheduleHorizonDays int) []Option {
	out := make([]Option, 0, len(offerings))
	for _, o := range offerings {
		if o.Method == MethodSameDay && pastCutoff(o.SameDayCutoff, now) {
			continue // same-day no longer offerable today
		}
		opt := Option{
			Method:       o.Method,
			ServiceLevel: serviceLevelLabel(o.Method),
			FeeCents:     o.PriceCents,
		}
		switch o.Method {
		case MethodScheduled:
			opt.ScheduleDates = scheduleDates(now, o.LeadDaysMin, scheduleHorizonDays)
		default:
			opt.Window = window(o)
		}
		out = append(out, opt)
	}
	sort.SliceStable(out, func(i, j int) bool { return methodRank(out[i].Method) < methodRank(out[j].Method) })
	return out
}

func methodRank(m Method) int {
	switch m {
	case MethodSameDay:
		return 0
	case MethodScheduled:
		return 1
	case MethodStandard:
		return 2
	default:
		return 3
	}
}

// pastCutoff reports whether now's time-of-day is at/after the cutoff's time-of-day (same-day withdrawn).
func pastCutoff(cutoff *time.Time, now time.Time) bool {
	if cutoff == nil {
		return false
	}
	nowMins := now.Hour()*60 + now.Minute()
	cutMins := cutoff.Hour()*60 + cutoff.Minute()
	return nowMins >= cutMins
}

// window renders a human window from the lead days. 0/0 => same-day language; else "in N-M days".
func window(o Offering) string {
	if o.Method == MethodSameDay || (o.LeadDaysMin == 0 && o.LeadDaysMax == 0) {
		return "Today"
	}
	if o.LeadDaysMin == o.LeadDaysMax {
		return "in " + days(o.LeadDaysMin)
	}
	return "in " + itoa(o.LeadDaysMin) + "-" + days(o.LeadDaysMax)
}

func scheduleDates(now time.Time, leadMin, horizon int) []string {
	if horizon < leadMin {
		horizon = leadMin + 1
	}
	dates := make([]string, 0, horizon-leadMin+1)
	for d := leadMin; d <= horizon; d++ {
		if d == 0 {
			d = 1 // never "schedule" for today
		}
		dates = append(dates, now.AddDate(0, 0, d).Format("2006-01-02"))
	}
	return dates
}

// PromisedReadyAt computes the promised ready-by for a chosen offering. For a scheduled method with a
// picked date, the promise is that date; otherwise now + the offering's max lead (the conservative end
// of the window), which is what a shop must be ready by and what 020's queue orders on.
func PromisedReadyAt(o Offering, now time.Time, scheduledDate *time.Time) time.Time {
	if o.Method == MethodScheduled && scheduledDate != nil {
		return *scheduledDate
	}
	if o.Method == MethodSameDay {
		return now.AddDate(0, 0, 0).Add(pastEndOfDay(now)) // end of today
	}
	return now.AddDate(0, 0, maxInt(o.LeadDaysMax, o.LeadDaysMin))
}

// FindOffering returns the offering for a method within a leg's offerings, or false if not offered.
func FindOffering(offerings []Offering, m Method) (Offering, bool) {
	for _, o := range offerings {
		if o.Method == m {
			return o, true
		}
	}
	return Offering{}, false
}

func pastEndOfDay(now time.Time) time.Duration {
	end := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 0, 0, now.Location())
	return end.Sub(now)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func days(n int) string {
	if n == 1 {
		return "1 day"
	}
	return itoa(n) + " days"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
