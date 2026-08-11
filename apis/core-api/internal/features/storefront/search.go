// Search / browse (019 US4, extended by 025 US1). GET /v1/storefront/products with a pg_trgm text
// query, filters (category, price range, sale-only, attribute facets), a caller-chosen ORDERING, a
// total count, and KEYSET pagination for infinite scroll — stable under inserts, unlike OFFSET
// (research R12). Only status='active' products are visible.
package storefront

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// SearchParams is the repository-level query (cursor already decoded, limit already +1 for lookahead).
type SearchParams struct {
	Q           string
	CategoryKey string
	MinPrice    string
	MaxPrice    string
	SaleOnly    bool
	// Brands selected in the brand facet — OR within (043 FR-003). Empty means "any brand".
	Brands []string
	// Attributes keyed by attribute-definition key → selected value(s). OR within a key, AND across
	// keys (043 FR-003).
	Attributes map[string][]string
	Sort       ProductSort
	// Cursor is the decoded keyset position, or nil for the first page. Its Sort has already been
	// checked against this query's Sort by the service — the repository trusts that.
	Cursor *Cursor
	Limit  int
}

// trigramExpr is the text this search scores and matches against.
//
// ⚠ It MUST stay character-identical to the expression the GIN trigram index is built on
// (db/migrations/20260716092105_product_catalog.sql:125). Postgres matches an expression index by the
// expression, so a stray space or a reordered column here silently drops the index and turns every
// relevance search into a sequential scan — with no error and no visible symptom until the catalogue
// grows.
const trigramExpr = `lower(p.name || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.brand, '') || ' ' || p.short_description)`

// orderClause returns the ORDER BY for a sort. `id` is in every one of them because none of the sort
// keys is unique — two products can share a price, or a created_at to the nanosecond — and a keyset
// without a unique tiebreak skips and repeats rows at every page boundary.
func orderClause(sort ProductSort) string {
	switch sort {
	case SortPriceAsc:
		return "\nORDER BY p.price_amount ASC, p.id ASC"
	case SortPriceDesc:
		return "\nORDER BY p.price_amount DESC, p.id DESC"
	case SortRelevance:
		return "\nORDER BY score DESC, p.id DESC"
	default: // SortNewest — byte-for-byte the pre-025 ordering
		return "\nORDER BY p.created_at DESC, p.id DESC"
	}
}

// cursorPredicate returns the keyset WHERE fragment for a sort, appending its bind values via `next`.
//
// The comparison direction mirrors the ORDER BY exactly: descending orders walk "less than" the
// cursor, ascending orders walk "greater than". Row-value comparison ((a,b) < (x,y)) is used rather
// than the expanded OR form because Postgres can drive an index with it directly.
func cursorPredicate(p SearchParams, next func(any) string) string {
	cur := p.Cursor
	switch p.Sort {
	case SortPriceAsc:
		return "\n  AND (p.price_amount, p.id) > (" + next(cur.Key) + "::numeric, " + next(cur.ID) + "::uuid)"
	case SortPriceDesc:
		return "\n  AND (p.price_amount, p.id) < (" + next(cur.Key) + "::numeric, " + next(cur.ID) + "::uuid)"
	case SortRelevance:
		// `score` is a select-list alias, and SQL will not let WHERE reference one — so the
		// expression is repeated here. Both occurrences are built from the same trigramExpr constant
		// and the same bound query text, so they cannot drift apart.
		return "\n  AND (similarity(" + trigramExpr + ", " + next(p.Q) + "), p.id) < (" +
			next(cur.Key) + "::real, " + next(cur.ID) + "::uuid)"
	default: // SortNewest
		return "\n  AND (p.created_at, p.id) < (" + next(cur.Key) + "::timestamptz, " + next(cur.ID) + "::uuid)"
	}
}

// filters builds the WHERE shared by the page query and the count query.
//
// ⚠ ONE builder, deliberately. If the count used its own copy of these predicates, the two would
// drift the first time a filter was added to one of them, and the shopper would see "48 results" above
// a list of 31 — a number that is wrong in a way nobody can debug from the outside (FR-016a).
func (r *Repository) filters(b *strings.Builder, p SearchParams, next func(any) string) {
	b.WriteString("\nWHERE p.status = 'active'")

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
	if len(p.Brands) > 0 {
		b.WriteString("\n  AND p.brand = ANY(" + next(p.Brands) + ")")
	}
	// Iterating a map is unordered, so the generated SQL is not byte-stable across calls — harmless
	// here (each build is self-contained and its binds match its text), and the count/page share this
	// same builder so they cannot disagree regardless of order.
	for key, vals := range p.Attributes {
		if len(vals) == 0 {
			continue
		}
		kp := next(key)
		vp := next(vals) // one text[] bind, reused three times below
		// value_text covers single_select; value_options (overlap) covers multi_select;
		// value_boolean::text covers boolean facets ('true'/'false'). One predicate, all three types.
		b.WriteString(fmt.Sprintf(`
  AND EXISTS (
      SELECT 1 FROM public.product_attribute_value pav
      JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = p.id AND ad.key = %s
        AND (pav.value_text = ANY(%s) OR pav.value_options && %s OR pav.value_boolean::text = ANY(%s)))`,
			kp, vp, vp, vp))
	}
}

// binder returns a placeholder-minting closure over an argument slice.
func binder(args *[]any) func(any) string {
	return func(v any) string {
		*args = append(*args, v)
		return "$" + strconv.Itoa(len(*args))
	}
}

// SearchCards runs the dynamic keyset query in the requested order.
func (r *Repository) SearchCards(ctx context.Context, p SearchParams) ([]searchRow, error) {
	args := make([]any, 0, 12)
	next := binder(&args)

	var b strings.Builder
	b.WriteString("SELECT ")
	b.WriteString(cardColumns)
	// The score column exists for every sort so one row type serves them all; it is only meaningful
	// under SortRelevance, where the ORDER BY reads it.
	if p.Sort == SortRelevance && p.Q != "" {
		b.WriteString(",\n       similarity(" + trigramExpr + ", " + next(p.Q) + ") AS score")
	} else {
		b.WriteString(",\n       0::real AS score")
	}
	b.WriteString(cardFrom)
	r.filters(&b, p, next)
	if p.Cursor != nil {
		b.WriteString(cursorPredicate(p, next))
	}
	b.WriteString(orderClause(p.Sort))
	b.WriteString("\nLIMIT " + next(p.Limit))

	rows, err := r.db.Query(ctx, b.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("storefront: search query: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[searchRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan search: %w", err)
	}
	return out, nil
}

// CountCards returns how many products match the filters, ignoring ordering and pagination (FR-016a).
//
// It shares `filters` with SearchCards, which is what keeps the headline number and the list beneath
// it describing the same result set.
func (r *Repository) CountCards(ctx context.Context, p SearchParams) (int, error) {
	args := make([]any, 0, 10)
	next := binder(&args)

	var b strings.Builder
	b.WriteString("SELECT count(*) FROM public.product p")
	r.filters(&b, p, next)

	var n int
	if err := r.db.QueryRow(ctx, b.String(), args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("storefront: count search: %w", err)
	}
	return n, nil
}
