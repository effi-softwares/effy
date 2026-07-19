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
var (
	ErrNotFound = errors.New("customeridentity: no customer record")
	ErrBarred   = errors.New("customeridentity: customer is barred")
)

// Customer is the resolved identity handed to commerce services (internal id + status only).
type Customer struct {
	ID     string
	Status string
}

const qBySub = `SELECT id::text AS id, status FROM public.customer WHERE cognito_sub = $1`

type row struct {
	ID     string `db:"id"`
	Status string `db:"status"`
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
		return Customer{ID: found.ID, Status: found.Status}, ErrBarred
	}
	return Customer{ID: found.ID, Status: found.Status}, nil
}
