package storefront

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// ── Facet repository tests, against real PostgreSQL (043) ────────────────────────────────────────
//
// ⚠ WHY THIS FILE EXISTS. The facet count SQL shipped a 42803 ("must appear in the GROUP BY clause")
// that reached dev, because facets_test.go fakes the Reader — a fake cannot catch a GROUP BY that
// references an output alias where Postgres wants the expression. This is 027/028/029/033's recurring
// lesson: raw SQL with no ORM is only proven by running it against a real database. So these queries
// now run against real Postgres.
//
// ⚠ Gated behind `-short` (house convention, matching saveditems). `make core-test` runs these;
// `go test -short` skips them.

func startFacetPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	pgc, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("effy"),
		tcpostgres.WithUsername("effy"),
		tcpostgres.WithPassword("test-only"),
		tcpostgres.BasicWaitStrategies(),
	)
	testcontainers.CleanupContainer(t, pgc)
	require.NoError(t, err)

	dsn, err := pgc.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// seedFacetWorld mirrors only the tables the facet SQL spans (016 catalog subset), then loads a small
// world: 3 active products across 2 brands and 2 categories, plus a single_select, a multi_select and
// a boolean attribute — exactly the three value shapes the attribute-count query switches on.
func seedFacetWorld(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}

	exec(`
		CREATE TABLE public.category (
			id uuid PRIMARY KEY, key text NOT NULL, name text NOT NULL, status text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.product (
			id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			primary_category_id uuid NOT NULL REFERENCES public.category (id),
			name                text NOT NULL,
			brand               text,
			price_amount        numeric(12,2) NOT NULL,
			status              text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.attribute_definition (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, name text NOT NULL,
			data_type text NOT NULL, status text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.attribute_allowed_value (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			attribute_definition_id uuid NOT NULL REFERENCES public.attribute_definition (id),
			value text NOT NULL, label text NOT NULL
		);
		CREATE TABLE public.product_attribute_value (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			product_id uuid NOT NULL REFERENCES public.product (id),
			attribute_definition_id uuid NOT NULL REFERENCES public.attribute_definition (id),
			value_text text, value_number numeric, value_boolean boolean, value_options text[]
		);
	`)

	exec(`INSERT INTO public.category (id, key, name) VALUES
		('c1000000-0000-0000-0000-000000000001', 'dairy', 'Dairy'),
		('c1000000-0000-0000-0000-000000000002', 'bakery', 'Bakery')`)

	// p1/p2 = Acme (dairy), p3 = Beta (bakery). One archived product must never be counted.
	exec(`INSERT INTO public.product (id, primary_category_id, name, brand, price_amount, status) VALUES
		('a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Milk',  'Acme', 3.00, 'active'),
		('a0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Cheese','Acme', 8.00, 'active'),
		('a0000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 'Bread', 'Beta', 5.00, 'active'),
		('a0000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000002', 'Gone',  'Ghost', 1.00, 'archived')`)

	exec(`INSERT INTO public.attribute_definition (id, key, name, data_type) VALUES
		('d0000000-0000-0000-0000-000000000001', 'spice',   'Spice',   'single_select'),
		('d0000000-0000-0000-0000-000000000002', 'diet',    'Dietary', 'multi_select'),
		('d0000000-0000-0000-0000-000000000003', 'organic', 'Organic', 'boolean')`)

	exec(`INSERT INTO public.attribute_allowed_value (attribute_definition_id, value, label) VALUES
		('d0000000-0000-0000-0000-000000000001', 'mild', 'Mild'),
		('d0000000-0000-0000-0000-000000000002', 'vegan', 'Vegan'),
		('d0000000-0000-0000-0000-000000000002', 'gluten_free', 'Gluten Free')`)

	// single_select on p1; multi_select on p1+p3; boolean on p2.
	exec(`INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text) VALUES
		('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'mild')`)
	exec(`INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_options) VALUES
		('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', ARRAY['vegan','gluten_free']),
		('a0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', ARRAY['vegan'])`)
	exec(`INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_boolean) VALUES
		('a0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', true)`)
}

func facetRepo(t *testing.T) *Repository {
	t.Helper()
	if testing.Short() {
		t.Skip("-short: container-backed facet repository test skipped")
	}
	pool := startFacetPostgres(t)
	seedFacetWorld(t, pool)
	return NewRepository(pool)
}

func optionMap(rows []optionCountRow) map[string]int {
	m := map[string]int{}
	for _, r := range rows {
		m[r.Value] = r.Count
	}
	return m
}

// BrandCounts groups the active set by brand — the archived Ghost product must never appear.
func TestRepo_BrandCounts(t *testing.T) {
	r := facetRepo(t)
	got, err := r.BrandCounts(context.Background(), SearchParams{})
	require.NoError(t, err)
	m := optionMap(got)
	require.Equal(t, 2, m["Acme"])
	require.Equal(t, 1, m["Beta"])
	require.NotContains(t, m, "Ghost", "an archived product's brand must not be counted")
}

// CategoryCounts groups the active set by primary category.
func TestRepo_CategoryCounts(t *testing.T) {
	r := facetRepo(t)
	got, err := r.CategoryCounts(context.Background(), SearchParams{})
	require.NoError(t, err)
	m := optionMap(got)
	require.Equal(t, 2, m["dairy"])
	require.Equal(t, 1, m["bakery"])
}

// AttributeCounts must run for ALL THREE value shapes — this is the query that shipped 42803, so each
// data-type branch (single_select / multi_select / boolean) is exercised against real Postgres.
func TestRepo_AttributeCounts_AllShapes(t *testing.T) {
	r := facetRepo(t)
	ctx := context.Background()

	single, err := r.AttributeCounts(ctx, SearchParams{}, attrDefRow{Key: "spice", Name: "Spice", DataType: "single_select"})
	require.NoError(t, err)
	require.Equal(t, map[string]int{"mild": 1}, optionMap(single))

	multi, err := r.AttributeCounts(ctx, SearchParams{}, attrDefRow{Key: "diet", Name: "Dietary", DataType: "multi_select"})
	require.NoError(t, err)
	mm := optionMap(multi)
	require.Equal(t, 2, mm["vegan"], "two products carry vegan")
	require.Equal(t, 1, mm["gluten_free"])

	boolean, err := r.AttributeCounts(ctx, SearchParams{}, attrDefRow{Key: "organic", Name: "Organic", DataType: "boolean"})
	require.NoError(t, err)
	require.Equal(t, map[string]int{"true": 1}, optionMap(boolean))
}

// Own-selection exclusion end to end: counting brands with a brand filter applied still counts every
// brand (the filter is cleared for the brand facet by the service), while a category filter DOES narrow
// the brand counts.
func TestRepo_BrandCounts_RespectOtherFilters(t *testing.T) {
	r := facetRepo(t)
	// Only dairy → Acme has 2, Beta drops out.
	got, err := r.BrandCounts(context.Background(), SearchParams{CategoryKey: "dairy"})
	require.NoError(t, err)
	m := optionMap(got)
	require.Equal(t, 2, m["Acme"])
	require.NotContains(t, m, "Beta")
}

// Multi-value attribute filtering (OR within) reaches the page/count query correctly.
func TestRepo_CountCards_MultiValueAttributes(t *testing.T) {
	r := facetRepo(t)
	// diet=vegan → p1 and p3 (2 products).
	n, err := r.CountCards(context.Background(), SearchParams{Attributes: map[string][]string{"diet": {"vegan"}}})
	require.NoError(t, err)
	require.Equal(t, 2, n)

	// brand=Acme AND diet=vegan → only p1.
	n, err = r.CountCards(context.Background(), SearchParams{
		Brands:     []string{"Acme"},
		Attributes: map[string][]string{"diet": {"vegan"}},
	})
	require.NoError(t, err)
	require.Equal(t, 1, n)
}

// FacetPriceBounds over the active set.
func TestRepo_FacetPriceBounds(t *testing.T) {
	r := facetRepo(t)
	lo, hi, err := r.FacetPriceBounds(context.Background(), SearchParams{})
	require.NoError(t, err)
	require.NotNil(t, lo)
	require.NotNil(t, hi)
	require.Equal(t, "3.00", *lo)
	require.Equal(t, "8.00", *hi)
}
