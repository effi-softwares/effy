// Package cartpolicy reads the platform's order rules — the minimum spend a cart must reach before
// checkout is allowed, and the two ceilings a cart is held to (027 FR-053, FR-037, FR-038).
//
// ── Why this is a table read and not a constant ─────────────────────────────────────────────────
//
// Before 027 the per-line ceiling was a Go constant (`maxQuantity = 99` in features/cart). A constant
// cannot satisfy FR-037/FR-038, which require the shopper to be TOLD the ceiling when they hit it: the
// number has to reach the client. Serving the limit from the same row the platform enforces it from
// removes the one failure that matters here — a message and a rule that disagree.
//
// The minimum spend has a second requirement on top: FR-056 says it must be enforced at checkout too,
// inside the transaction that decides the amount, so a client that ignores the cart's `checkout.allowed`
// cannot bypass it. That is why this is a row in `public` and not an SSM parameter: SSM would add an AWS
// call to the cart's hot read path and could not participate in the checkout transaction at all.
//
// The row is written by the COLD path (back-office promotions/order-rules screen) and read here — the
// same cross-path shape `public.shop` already has, and legal under Principle III, which is about where a
// REQUEST is served, not about table ownership.
package cartpolicy

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/pricing"
)

// Fallback values used only when the policy row is missing, which the migration makes impossible (it
// seeds the row, and the table's `singleton` primary key means there can never be a second one). They
// exist so a cart read degrades to the pre-027 behaviour rather than failing: 99 was the hard-coded
// constant, and a zero minimum means "no minimum in force", which is the safe direction — a missing
// policy must never block a shopper from checking out.
const (
	DefaultMaxLineQuantity  = 99
	DefaultMaxDistinctItems = 100
)

// Policy is the resolved order rules. Money is carried as integer cents (the money package's rule) and
// formatted only at the wire.
type Policy struct {
	MinimumSubtotalCents int64
	Currency             string
	MaxLineQuantity      int
	MaxDistinctItems     int
}

// HasMinimum reports whether a minimum is in force at all. When it is not, the cart shows nothing about
// a minimum — not "minimum $0.00" (FR-057).
func (p Policy) HasMinimum() bool { return p.MinimumSubtotalCents > 0 }

// Remaining is how much more a payable subtotal needs to reach the minimum, in cents; 0 once met.
func (p Policy) Remaining(payableCents int64) int64 {
	if !p.HasMinimum() || payableCents >= p.MinimumSubtotalCents {
		return 0
	}
	return p.MinimumSubtotalCents - payableCents
}

// Meets reports whether a payable subtotal satisfies the minimum.
func (p Policy) Meets(payableCents int64) bool { return p.Remaining(payableCents) == 0 }

// Default is the policy used when the row cannot be read (see the constants above).
func Default() Policy {
	return Policy{
		MinimumSubtotalCents: 0,
		Currency:             pricing.Currency,
		MaxLineQuantity:      DefaultMaxLineQuantity,
		MaxDistinctItems:     DefaultMaxDistinctItems,
	}
}

// Reader reads the policy. An interface so the cart service can be unit-tested with a fake, in the same
// style as its repository seam.
type Reader interface {
	Policy(ctx context.Context) (Policy, error)
}

// Store is the Postgres-backed Reader.
type Store struct {
	db db.DBTX
}

func NewStore(dbtx db.DBTX) *Store { return &Store{db: dbtx} }

type policyRow struct {
	MinimumSubtotalAmount string `db:"minimum_subtotal_amount"`
	Currency              string `db:"currency"`
	MaxLineQuantity       int    `db:"max_line_quantity"`
	MaxDistinctItems      int    `db:"max_distinct_items"`
}

// Policy reads the single order-rules row. A missing row falls back to Default() rather than erroring:
// the cart must stay readable, and the fallback is the permissive direction for the minimum and the
// pre-027 value for the ceilings.
func (s *Store) Policy(ctx context.Context) (Policy, error) {
	rows, err := s.db.Query(ctx, `
SELECT minimum_subtotal_amount::text AS minimum_subtotal_amount,
       currency                      AS currency,
       max_line_quantity             AS max_line_quantity,
       max_distinct_items            AS max_distinct_items
FROM public.order_policy
WHERE singleton`)
	if err != nil {
		return Default(), fmt.Errorf("cartpolicy: query policy: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[policyRow])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Default(), nil
		}
		return Default(), fmt.Errorf("cartpolicy: scan policy: %w", err)
	}

	cents, err := money.ParseCents(row.MinimumSubtotalAmount)
	if err != nil {
		return Default(), fmt.Errorf("cartpolicy: parse minimum: %w", err)
	}
	p := Policy{
		MinimumSubtotalCents: cents,
		Currency:             row.Currency,
		MaxLineQuantity:      row.MaxLineQuantity,
		MaxDistinctItems:     row.MaxDistinctItems,
	}
	// Defensive: the table's CHECKs already bound these, but a nonsensical ceiling read from the
	// database would clamp every quantity to 0 and silently empty carts. Refuse to believe it.
	if p.MaxLineQuantity < 1 {
		p.MaxLineQuantity = DefaultMaxLineQuantity
	}
	if p.MaxDistinctItems < 1 {
		p.MaxDistinctItems = DefaultMaxDistinctItems
	}
	return p, nil
}
