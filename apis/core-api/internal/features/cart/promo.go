package cart

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// Promotional-code validation and discount computation — 027 US8.
//
// ⚠ ALL OF IT IS PURE. Given a code definition, a shopper's usage and a payable subtotal, the outcome is a
// decision and an amount, with no database and no clock of its own. That is deliberate: this is the file
// that decides money, and the eight ways a code can be refused (FR-043) are only exhaustively testable if
// nothing here has to be mocked.
//
// ⚠ The client NEVER decides any of this (FR-042). It sends a code string; everything below happens on the
// platform, and the amount that reaches Stripe is recomputed here at intent time rather than carried from
// the cart response.

// The refusal reasons. These are the wire `code` values, and each is distinguishable on purpose: "that
// code doesn't work" tells a shopper nothing about whether to wait, spend more, or give up (FR-043).
var (
	ErrPromoUnknown       = errors.New("promo_unknown")
	ErrPromoNotStarted    = errors.New("promo_not_started")
	ErrPromoExpired       = errors.New("promo_expired")
	ErrPromoDisabled      = errors.New("promo_disabled")
	ErrPromoExhausted     = errors.New("promo_exhausted")
	ErrPromoAlreadyUsed   = errors.New("promo_already_used")
	ErrPromoBelowMinimum  = errors.New("promo_below_minimum")
	ErrPromoNotApplicable = errors.New("promo_not_applicable")
)

// PromoKind is what a code takes off.
const (
	PromoPercentage = "percentage"
	PromoFixed      = "fixed"
)

// PromoCode is a code as the platform holds it. Amounts are integer cents by the time they reach here.
type PromoCode struct {
	ID                   string
	Code                 string
	Kind                 string
	PercentOff           int
	AmountOffCents       int64
	MinimumSubtotalCents int64
	StartsAt             *time.Time
	EndsAt               *time.Time
	MaxRedemptions       *int
	MaxPerCustomer       *int
	Status               string
}

// PromoUsage is how much a code has been used — counted from redemptions, never from a stored counter.
type PromoUsage struct {
	Total         int
	ByThisShopper int
}

// NormalisePromoCode is how a typed code becomes a lookup key. Shoppers type `spring20`; operators create
// `SPRING20`. The unique index is on `upper(code)`, and this must agree with it.
func NormalisePromoCode(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }

// EvaluatePromo decides whether a code applies and what it is worth.
//
// Order matters: a shopper who is under the minimum should be told THAT, not that the code is exhausted,
// because only one of those is something they can act on. So the checks run from "this code is not for you
// at all" outward to "this code needs a bigger basket".
func EvaluatePromo(code PromoCode, usage PromoUsage, payableCents int64, now time.Time) (int64, error) {
	switch {
	case code.Status != "active":
		return 0, ErrPromoDisabled
	case code.StartsAt != nil && now.Before(*code.StartsAt):
		return 0, ErrPromoNotStarted
	case code.EndsAt != nil && !now.Before(*code.EndsAt):
		return 0, ErrPromoExpired
	case code.MaxRedemptions != nil && usage.Total >= *code.MaxRedemptions:
		return 0, ErrPromoExhausted
	case code.MaxPerCustomer != nil && usage.ByThisShopper >= *code.MaxPerCustomer:
		return 0, ErrPromoAlreadyUsed
	case payableCents <= 0:
		// Nothing to discount. Distinct from "below minimum": an empty cart is not a spending problem.
		return 0, ErrPromoNotApplicable
	case payableCents < code.MinimumSubtotalCents:
		return 0, ErrPromoBelowMinimum
	}
	return discountFor(code, payableCents), nil
}

// discountFor computes the reduction, capped at the payable subtotal.
//
// ⚠ The cap is not a nicety. A $999 fixed code on a $20 cart would otherwise produce a negative total, and
// a negative total is a refund the platform never agreed to (FR-044).
func discountFor(code PromoCode, payableCents int64) int64 {
	var cents int64
	switch code.Kind {
	case PromoPercentage:
		// Integer arithmetic throughout; rounding DOWN, so a rounding error can only ever favour the
		// platform by a cent rather than quietly giving money away.
		cents = payableCents * int64(code.PercentOff) / 100
	case PromoFixed:
		cents = code.AmountOffCents
	}
	if cents > payableCents {
		cents = payableCents
	}
	if cents < 0 {
		cents = 0
	}
	return cents
}

// PromoLabel is the shopper-facing description of a code. Display only, and shop-free.
func PromoLabel(code PromoCode) string {
	switch code.Kind {
	case PromoPercentage:
		return strconv.Itoa(code.PercentOff) + "% off"
	case PromoFixed:
		return money.FormatCents(code.AmountOffCents) + " off"
	default:
		return "Discount"
	}
}
