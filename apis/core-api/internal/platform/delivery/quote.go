package delivery

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// ErrServedZoneUnpriced is the INVARIANT breach (FR-029): a served zone whose ring the active plan does
// not price. Activation guarantees it cannot happen; if it ever does, the quote fails LOUD (never free
// delivery) and the caller raises the alarm metric. Wrapped, so callers use errors.Is.
var ErrServedZoneUnpriced = errors.New("delivery: served zone could not be priced")

// PackageInput is one per-shop package to price: its fulfilling shop and its total weight.
type PackageInput struct {
	ShopID string
	Grams  int
}

// Option is one offered delivery method for a package, at its GST-inclusive, snapped-up fee.
type Option struct {
	Method   string
	FeeCents int64
}

// PackageQuote is a package's offered options. A served package ALWAYS carries a standard option
// (FR-029); it carries a same_day option only when the fulfilling shop does same-day in this zone and it
// is before the cutoff (FR-044).
type PackageQuote struct {
	ShopID  string
	Options []Option
}

// StandardFeeCents returns the package's standard fee (always present when serviced).
func (p PackageQuote) StandardFeeCents() int64 {
	for _, o := range p.Options {
		if o.Method == MethodStandard {
			return o.FeeCents
		}
	}
	if len(p.Options) > 0 {
		return p.Options[0].FeeCents
	}
	return 0
}

// FeeFor returns the fee for a chosen method, falling back to standard if that method is not offered on
// this package (so a client that asks for same_day where it is unavailable is charged standard, never
// refused).
func (p PackageQuote) FeeFor(method string) (string, int64) {
	for _, o := range p.Options {
		if o.Method == method {
			return o.Method, o.FeeCents
		}
	}
	return MethodStandard, p.StandardFeeCents()
}

// Why same-day is not on offer (069 FR-004). The two are different sentences to a customer: "not in your
// area" will still be true tomorrow, "today's times are taken" will not.
const (
	SameDayNotEligible = "not_eligible"
	SameDaySlotsClosed = "slots_closed"
)

// QuoteResult is a delivery quote for a destination. When Serviced is false there are no packages and one
// reason — the postcode is in no active zone (FR-002). SameDayUntil is the latest cutoff among the open
// slots (nil when no same-day today anywhere in the basket).
type QuoteResult struct {
	Serviced           bool
	ZoneID             string
	RingID             string
	SameDayUntil       *time.Time
	Packages           []PackageQuote
	StandardTotalCents int64

	// 069. SameDaySlots are the windows still open for this order, earliest first; a package carries a
	// same_day option ONLY when this is non-empty. SameDayUnavailable says why it is empty.
	// StandardDays are the days a standard delivery can arrive — never empty when serviced (FR-020).
	SameDaySlots       []OpenSlot
	SameDayUnavailable string
	StandardDays       []string
}

// HasStandardDay reports whether `day` is one of the days currently offered.
func (q QuoteResult) HasStandardDay(day string) bool {
	for _, d := range q.StandardDays {
		if d == day {
			return true
		}
	}
	return false
}

// SlotByID returns the open slot with this id.
func (q QuoteResult) SlotByID(id string) (OpenSlot, bool) {
	for _, s := range q.SameDaySlots {
		if s.ID == id {
			return s, true
		}
	}
	return OpenSlot{}, false
}

// OffersSameDay reports whether this package was offered same-day at all.
func (p PackageQuote) OffersSameDay() bool {
	for _, o := range p.Options {
		if o.Method == MethodSameDay {
			return true
		}
	}
	return false
}

// Quoter computes delivery quotes against the active plan, the zone map, the same-day schedule and the
// per-shop exceptions. It holds the DB seam; the arithmetic itself is the pure Fee engine.
type Quoter struct {
	q db.DBTX
}

// NewQuoter wires a quoter to the connection pool.
func NewQuoter(q db.DBTX) *Quoter { return &Quoter{q: q} }

// Quote prices delivery per package for a destination postcode at time `now` (047 US1+US2+US3). Every
// served package gets a standard option; a same_day option is added where the fulfilling shop does
// same-day in this zone AND a delivery slot is still open today (069). serviced=false ⇒ no active zone.
// ⚠ A served zone whose ring the active plan does not price is a fail-loud error, never free delivery
// (FR-029) — activation guarantees it cannot happen; this is the alarm path if it ever does.
//
// customerID is whose checkout this is: their own unpaid hold is not counted against them (see
// OwnLiveHolds). Empty is allowed and simply subtracts nothing.
func (qr *Quoter) Quote(ctx context.Context, customerID, postcode string, pkgs []PackageInput, now time.Time) (QuoteResult, error) {
	zone, serviced, err := ZoneForPostcode(ctx, qr.q, postcode)
	if err != nil {
		return QuoteResult{}, err
	}
	if !serviced {
		return QuoteResult{Serviced: false}, nil
	}

	plan, err := LoadActivePlan(ctx, qr.q)
	if err != nil {
		return QuoteResult{}, err
	}
	ringPrice, ok := plan.RingPriceCents[zone.RingID]
	if !ok {
		return QuoteResult{}, fmt.Errorf("%w (plan %s, ring %s)", ErrServedZoneUnpriced, plan.ID, zone.RingID)
	}

	// Same-day availability: the zone must be eligible for the shop AND a run must still be makeable.
	shopIDs := distinctShops(pkgs)
	sameDayShops, err := SameDayForShops(ctx, qr.q, zone.ID, zone.SameDayEligible, shopIDs)
	if err != nil {
		return QuoteResult{}, err
	}
	runs, buffer, err := SameDaySchedule(ctx, qr.q)
	if err != nil {
		return QuoteResult{}, err
	}

	// 069 — what a customer can CHOOSE. Slots and days are facts about the order, not about a package:
	// every run collects from every shop, so a slot that is open is open for all of them, and one
	// choice covers every same-day package (FR-005).
	settings, err := LoadSlotSettings(ctx, qr.q)
	if err != nil {
		return QuoteResult{}, err
	}
	today := MelbourneDate(now)
	noDates, err := NonDeliveryDates(ctx, qr.q, today)
	if err != nil {
		return QuoteResult{}, err
	}

	res := QuoteResult{Serviced: true, ZoneID: zone.ID, RingID: zone.RingID}
	res.StandardDays = AvailableDays(now, runs, buffer, settings.CarrierLeadDays, settings.LookaheadDays,
		settings.NoWeekdays, noDates)

	anyShopSameDay := false
	for _, p := range pkgs {
		if sameDayShops[p.ShopID] {
			anyShopSameDay = true
			break
		}
	}
	if !anyShopSameDay {
		res.SameDayUnavailable = SameDayNotEligible
	} else {
		slots, err := LoadSlots(ctx, qr.q)
		if err != nil {
			return QuoteResult{}, err
		}
		load, err := SlotLoad(ctx, qr.q, today)
		if err != nil {
			return QuoteResult{}, err
		}
		own, err := OwnLiveHolds(ctx, qr.q, customerID, today)
		if err != nil {
			return QuoteResult{}, err
		}
		for id, n := range own {
			load[id] -= n
		}
		res.SameDaySlots = OpenSlots(now, slots, load, runs, buffer, settings.TurnaroundMin)
		if len(res.SameDaySlots) == 0 {
			res.SameDayUnavailable = SameDaySlotsClosed
		}
	}
	sameDayOpen := len(res.SameDaySlots) > 0

	var sameDayUntil *time.Time
	for _, s := range res.SameDaySlots {
		if sameDayUntil == nil || s.Cutoff.After(*sameDayUntil) {
			c := s.Cutoff
			sameDayUntil = &c
		}
	}
	for _, p := range pkgs {
		std := Fee(feeInputs(plan, ringPrice, p.Grams, plan.StandardFactorMilli))
		opts := []Option{{Method: MethodStandard, FeeCents: std}}
		res.StandardTotalCents += std

		// Same-day is a strictly additive offer (FR-038): its absence never removes standard.
		// ⚠ 069: only while a slot is open. Same-day without a window is no longer something the
		// platform sells, so there is no "same-day, time to be confirmed" option to fall into.
		if sameDayOpen && sameDayShops[p.ShopID] {
			sd := Fee(feeInputs(plan, ringPrice, p.Grams, plan.SameDayFactorMilli))
			opts = append(opts, Option{Method: MethodSameDay, FeeCents: sd})
		}
		res.Packages = append(res.Packages, PackageQuote{ShopID: p.ShopID, Options: opts})
	}
	res.SameDayUntil = sameDayUntil
	return res, nil
}

func feeInputs(plan Plan, ringPriceCents int64, grams int, factorMilli int64) FeeInputs {
	return FeeInputs{
		RingPriceCents: ringPriceCents,
		PackageGrams:   grams,
		WeightBands:    plan.WeightBands,
		FactorMilli:    factorMilli,
		StepCents:      plan.RoundingStepCents,
		FloorCents:     plan.FloorCents,
		CapCents:       plan.CapCents,
	}
}

func distinctShops(pkgs []PackageInput) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(pkgs))
	for _, p := range pkgs {
		if !seen[p.ShopID] {
			seen[p.ShopID] = true
			out = append(out, p.ShopID)
		}
	}
	return out
}
