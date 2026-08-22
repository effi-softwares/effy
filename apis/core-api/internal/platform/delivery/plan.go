package delivery

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// Plan is the active shipping-fee plan resolved to the engine's integer forms (cents, and factors in
// milli-units). Loaded once per quote; the engine then runs purely in memory.
type Plan struct {
	ID                  string
	RoundingStepCents   int64
	FloorCents          int64
	CapCents            int64
	SameDayFactorMilli  int64
	StandardFactorMilli int64
	RingPriceCents      map[string]int64 // ring_id → distance-slab price
	WeightBands         []WeightBand     // ascending by UpperGrams; the largest is the open-ended top
}

// FactorMilli returns the method's factor in milli-units. Any method other than same_day is standard.
func (p Plan) FactorMilli(method string) int64 {
	if method == MethodSameDay {
		return p.SameDayFactorMilli
	}
	return p.StandardFactorMilli
}

// The two delivery methods (mirrors @effy/shared-types DeliveryMethod).
const (
	MethodSameDay  = "same_day"
	MethodStandard = "standard"
)

// ErrNoActivePlan means no fee plan is active — checkout cannot quote a delivery fee and must refuse
// rather than deliver for free. (Activation guarantees exactly one active, complete plan; this is the
// defensive path for a misconfigured environment.)
var ErrNoActivePlan = errors.New("delivery: no active fee plan")

// LoadActivePlan reads the single active plan with its ring prices and weight bands, parsed to engine
// integer forms. Returns ErrNoActivePlan if none is active.
func LoadActivePlan(ctx context.Context, q db.DBTX) (Plan, error) {
	var p Plan
	var stepS, floorS, capS, sameS, stdS string
	err := q.QueryRow(ctx, `
		SELECT id::text, rounding_step::text, floor_amount::text, cap_amount::text,
		       same_day_factor::text, standard_factor::text
		FROM public.delivery_fee_plan WHERE is_active = true`).
		Scan(&p.ID, &stepS, &floorS, &capS, &sameS, &stdS)
	if errors.Is(err, pgx.ErrNoRows) {
		return Plan{}, ErrNoActivePlan
	}
	if err != nil {
		return Plan{}, fmt.Errorf("delivery: load active plan: %w", err)
	}

	for _, c := range []struct {
		dst *int64
		src string
	}{{&p.RoundingStepCents, stepS}, {&p.FloorCents, floorS}, {&p.CapCents, capS}} {
		cents, perr := money.ParseCents(c.src)
		if perr != nil {
			return Plan{}, fmt.Errorf("delivery: plan amount %q: %w", c.src, perr)
		}
		*c.dst = cents
	}
	if p.SameDayFactorMilli, err = parseMilli(sameS); err != nil {
		return Plan{}, fmt.Errorf("delivery: same_day_factor %q: %w", sameS, err)
	}
	if p.StandardFactorMilli, err = parseMilli(stdS); err != nil {
		return Plan{}, fmt.Errorf("delivery: standard_factor %q: %w", stdS, err)
	}

	if p.RingPriceCents, err = loadRingPrices(ctx, q, p.ID); err != nil {
		return Plan{}, err
	}
	if p.WeightBands, err = loadWeightBands(ctx, q, p.ID); err != nil {
		return Plan{}, err
	}
	return p, nil
}

func loadRingPrices(ctx context.Context, q db.DBTX, planID string) (map[string]int64, error) {
	rows, err := q.Query(ctx,
		`SELECT ring_id::text, price_amount::text FROM public.delivery_ring_price WHERE plan_id = $1`, planID)
	if err != nil {
		return nil, fmt.Errorf("delivery: load ring prices: %w", err)
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var ringID, amt string
		if err := rows.Scan(&ringID, &amt); err != nil {
			return nil, fmt.Errorf("delivery: scan ring price: %w", err)
		}
		cents, perr := money.ParseCents(amt)
		if perr != nil {
			return nil, fmt.Errorf("delivery: ring price %q: %w", amt, perr)
		}
		out[ringID] = cents
	}
	return out, rows.Err()
}

func loadWeightBands(ctx context.Context, q db.DBTX, planID string) ([]WeightBand, error) {
	rows, err := q.Query(ctx,
		`SELECT upper_grams, add_amount::text FROM public.delivery_weight_band WHERE plan_id = $1 ORDER BY upper_grams`, planID)
	if err != nil {
		return nil, fmt.Errorf("delivery: load weight bands: %w", err)
	}
	defer rows.Close()
	var out []WeightBand
	for rows.Next() {
		var upper int
		var amt string
		if err := rows.Scan(&upper, &amt); err != nil {
			return nil, fmt.Errorf("delivery: scan weight band: %w", err)
		}
		cents, perr := money.ParseCents(amt)
		if perr != nil {
			return nil, fmt.Errorf("delivery: weight band %q: %w", amt, perr)
		}
		out = append(out, WeightBand{UpperGrams: upper, AddCents: cents})
	}
	return out, rows.Err()
}

// parseMilli parses a numeric(_,3) decimal string to integer milli-units: "1.8" → 1800, "1" → 1000,
// "2.400" → 2400. Extra fractional digits beyond 3 are truncated (the DB column is 3-dp).
func parseMilli(s string) (int64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("empty factor")
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" {
		whole = "0"
	}
	w, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("bad factor %q: %w", s, err)
	}
	if len(frac) > 3 {
		frac = frac[:3]
	}
	for len(frac) < 3 {
		frac += "0"
	}
	f, err := strconv.ParseInt(frac, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("bad factor fraction in %q: %w", s, err)
	}
	m := w*1000 + f
	if neg {
		m = -m
	}
	return m, nil
}
