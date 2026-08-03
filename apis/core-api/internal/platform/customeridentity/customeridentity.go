// Package customeridentity resolves a verified Cognito subject to a platform customer record on the
// hot path (research R2). Every customer-scoped commerce service needs the internal customer.id to
// scope its queries, and public.customer.status stays the authoritative access gate (Principle IV):
// a `barred` customer is refused uniformly regardless of a valid token.
//
// The customer row is JIT-upserted on the COLD path at sign-in, so it exists for any authenticated
// customer; a missing row means the customer never completed the cold-path bootstrap → refuse.
package customeridentity

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// ErrNotFound = no customer row for this subject (never bootstrapped on the cold path).
// ErrBarred   = the customer exists but is barred (access denied).
// ErrClosing  = the customer asked to be deleted and is inside the grace window (034 FR-041).
var (
	ErrNotFound = errors.New("customeridentity: no customer record")
	ErrBarred   = errors.New("customeridentity: customer is barred")
	ErrClosing  = errors.New("customeridentity: customer account is closing")
)

// Customer is the resolved identity handed to commerce services (internal id + status only).
type Customer struct {
	ID           string
	Status       string
	ClosureState string
}

const qBySub = `SELECT id::text AS id, status, closure_state FROM public.customer WHERE cognito_sub = $1`

type row struct {
	ID           string `db:"id"`
	Status       string `db:"status"`
	ClosureState string `db:"closure_state"`
}

// Resolver looks up customers by verified subject. One instance is wired in main and shared.
type Resolver struct {
	db db.DBTX
}

func NewResolver(dbtx db.DBTX) *Resolver {
	return &Resolver{db: dbtx}
}

// Resolve returns the customer for a verified subject, or ErrNotFound / ErrBarred. Callers map those
// to 401 (re-auth/bootstrap) and 403 (barred) respectively; any other error is a 500.
func (r *Resolver) Resolve(ctx context.Context, subject string) (Customer, error) {
	rows, err := r.db.Query(ctx, qBySub, subject)
	if err != nil {
		return Customer{}, fmt.Errorf("customeridentity: query: %w", err)
	}
	found, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[row])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Customer{}, ErrNotFound
		}
		return Customer{}, fmt.Errorf("customeridentity: scan: %w", err)
	}
	if found.Status == "barred" {
		return Customer{ID: found.ID, Status: found.Status, ClosureState: found.ClosureState}, ErrBarred
	}
	// 034 FR-041 — closure MUST be enforced HERE as well as on the cold path, and this is the single
	// easiest thing in that feature to miss. The account screens live on the cold path, but commerce
	// (cart, checkout, orders) is gated only by this resolver: a closure enforced in one place would
	// leave a "deleted" customer able to browse, fill a cart and place an order.
	if found.ClosureState == "closing" {
		return Customer{ID: found.ID, Status: found.Status, ClosureState: found.ClosureState}, ErrClosing
	}
	return Customer{ID: found.ID, Status: found.Status, ClosureState: found.ClosureState}, nil
}
