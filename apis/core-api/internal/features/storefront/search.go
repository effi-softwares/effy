// Search / browse (019 US4). GET /v1/storefront/products with a pg_trgm text query, filters
// (category, price range, sale-only, attribute facets) and KEYSET pagination for infinite scroll —
// stable under inserts, unlike OFFSET (research R12). Only status='active' products are visible.
package storefront

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// SearchParams is the repository-level query (cursor already decoded, limit already +1 for lookahead).
type SearchParams struct {
	Q           string
	CategoryKey string
	MinPrice    string
	MaxPrice    string
	SaleOnly    bool
	Attributes  map[string]string
	HasCursor   bool
	CursorTime  time.Time
	CursorID    string
	Limit       int
}

// SearchCards runs the dynamic keyset query. Rows are ordered (created_at DESC, id DESC).
func (r *Repository) SearchCards(ctx context.Context, p SearchParams) ([]cardRow, error) {
	var b strings.Builder
	b.WriteString(cardSelect)
	b.WriteString("\nWHERE p.status = 'active'")

	args := make([]any, 0, 8)
	next := func(v any) string {
		args = append(args, v)
		return "$" + strconv.Itoa(len(args))
	}

	if p.Q != "" {
		q := next("%" + p.Q + "%")
		b.WriteString(fmt.Sprintf("\n  AND (p.name ILIKE %s OR p.brand ILIKE %s OR p.short_description ILIKE %s)", q, q, q))
	}
	if p.CategoryKey != "" {
		b.WriteString("\n  AND p.primary_category_id = (SELECT id FROM public.category WHERE key = " + next(p.CategoryKey) + ")")
	}
	if p.MinPrice != "" {
		b.WriteString("\n  AND p.price_amount >= " + next(p.MinPrice) + "::numeric")
	}
	if p.MaxPrice != "" {
		b.WriteString("\n  AND p.price_amount <= " + next(p.MaxPrice) + "::numeric")
	}
	if p.SaleOnly {
		b.WriteString("\n  AND p.compare_at_amount IS NOT NULL AND p.compare_at_amount > p.price_amount")
	}
	for key, val := range p.Attributes {
		kp := next(key)
		vp := next(val)
		b.WriteString(fmt.Sprintf(`
  AND EXISTS (
      SELECT 1 FROM public.product_attribute_value pav
      JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = p.id AND ad.key = %s
        AND (pav.value_text = %s OR %s = ANY(pav.value_options)))`, kp, vp, vp))
	}
	if p.HasCursor {
		b.WriteString("\n  AND (p.created_at, p.id) < (" + next(p.CursorTime) + ", " + next(p.CursorID) + "::uuid)")
	}
	b.WriteString("\nORDER BY p.created_at DESC, p.id DESC\nLIMIT " + next(p.Limit))

	rows, err := r.db.Query(ctx, b.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("storefront: search query: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[cardRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan search: %w", err)
	}
	return out, nil
}
