package delivery

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// Locality is one place row — the customer-facing typeahead shape (name, state, postcode). All three
// identify a place; no two do (030 R2a).
type Locality struct {
	Name     string
	State    string
	Postcode string
}

// SearchLocalities answers the typeahead (030): an all-digits query matches on postcode prefix; anything
// else matches a case-insensitive NAME prefix (index-supported by lower(name) text_pattern_ops). Results
// are alphabetical and bounded — ⚠ NEVER ordered by serviceability (the list must not hint the verdict).
// The caller guarantees len(query) >= 2.
func SearchLocalities(ctx context.Context, q db.DBTX, query string, limit int) ([]Locality, error) {
	var rows pgx.Rows
	var err error
	if isAllDigits(query) {
		rows, err = q.Query(ctx, `
			SELECT name, state, postcode FROM public.locality
			WHERE postcode LIKE $1 || '%'
			ORDER BY name, state, postcode
			LIMIT $2`, query, limit)
	} else {
		rows, err = q.Query(ctx, `
			SELECT name, state, postcode FROM public.locality
			WHERE lower(name) LIKE lower($1) || '%'
			ORDER BY name, state, postcode
			LIMIT $2`, query, limit)
	}
	if err != nil {
		return nil, fmt.Errorf("delivery: locality search: %w", err)
	}
	defer rows.Close()

	out := make([]Locality, 0, limit)
	for rows.Next() {
		var l Locality
		if err := rows.Scan(&l.Name, &l.State, &l.Postcode); err != nil {
			return nil, fmt.Errorf("delivery: scan locality: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
