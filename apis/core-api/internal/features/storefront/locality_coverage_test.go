package storefront

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// ── SC-002: every postcode Effy delivers to is reachable by typing a suburb name ────────────────
//
// This is the one assertion that turns FR-002 ("the locality record covers Australia, not only served
// areas") from a stated intention into a gate. If a served postcode has no locality row, a shopper in
// that postcode can be delivered to but cannot NAME where they live — the feature silently does not
// work for them, and no other test in this repo would notice.
//
// ⚠ IT DOES NOT RUN BY DEFAULT. Like every repository test here it needs real PostgreSQL, so it is
// gated behind `-short` (the house convention — see platformstatus/repository_test.go). `make
// core-test` runs it; a `-short` run skips it. Recorded explicitly so nobody later assumes it has been
// running all along.
//
// ⚠ It also does NOT assert against the real dataset — it builds the fixture below. The real coverage
// check against real rows is an operator query in quickstart.md §1, because only a loaded database can
// answer it. This test proves the ASSERTION is correct; the operator proves the DATA is.

func startLocalityPostgres(t *testing.T) *pgxpool.Pool {
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

// schema mirrors the two tables the coverage rule spans. Deliberately minimal — this test is about
// one join, not about either table's full shape.
func seedCoverageSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		CREATE TABLE public.locality (
			id       serial PRIMARY KEY,
			name     text NOT NULL,
			state    text NOT NULL,
			postcode text NOT NULL,
			CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode)
		);
		CREATE INDEX locality_name_prefix_idx ON public.locality (lower(name) text_pattern_ops);
		CREATE TABLE public.delivery_zone_postcode (
			id       serial PRIMARY KEY,
			postcode text NOT NULL UNIQUE
		);
	`)
	require.NoError(t, err)
}

// uncoveredPostcodes is the SC-002 rule itself, in one query. The operator runs the identical SQL
// against the real database in quickstart.md §1.
func uncoveredPostcodes(t *testing.T, pool *pgxpool.Pool) []string {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		SELECT dzp.postcode
		FROM public.delivery_zone_postcode dzp
		LEFT JOIN public.locality l ON l.postcode = dzp.postcode
		WHERE l.id IS NULL
		ORDER BY dzp.postcode`)
	require.NoError(t, err)
	defer rows.Close()

	var out []string
	for rows.Next() {
		var p string
		require.NoError(t, rows.Scan(&p))
		out = append(out, p)
	}
	require.NoError(t, rows.Err())
	return out
}

func TestSC002_EveryServedPostcodeIsReachableByName(t *testing.T) {
	if testing.Short() {
		t.Skip("requires Docker (real PostgreSQL); skipped under -short")
	}
	pool := startLocalityPostgres(t)
	seedCoverageSchema(t, pool)

	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO public.locality (name, state, postcode) VALUES
			('Melbourne','VIC','3000'), ('Richmond','VIC','3121'), ('Richmond East','VIC','3121'),
			('Darwin','NT','0800');
		INSERT INTO public.delivery_zone_postcode (postcode) VALUES ('3000'), ('3121'), ('0800');
	`)
	require.NoError(t, err)

	if missing := uncoveredPostcodes(t, pool); len(missing) != 0 {
		t.Errorf("SC-002 violated — Effy delivers to these postcodes but no locality names them: %s",
			strings.Join(missing, ", "))
	}
}

// ⚠ The assertion has to be able to FAIL, and to say WHICH postcode is unreachable. A coverage test
// that cannot name the gap sends an operator to grep 18 000 rows by hand.
func TestSC002_NamesTheUncoveredPostcodes(t *testing.T) {
	if testing.Short() {
		t.Skip("requires Docker (real PostgreSQL); skipped under -short")
	}
	pool := startLocalityPostgres(t)
	seedCoverageSchema(t, pool)

	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO public.locality (name, state, postcode) VALUES ('Melbourne','VIC','3000');
		INSERT INTO public.delivery_zone_postcode (postcode) VALUES ('3000'), ('3121'), ('0800');
	`)
	require.NoError(t, err)

	missing := uncoveredPostcodes(t, pool)
	require.Equal(t, []string{"0800", "3121"}, missing,
		"the coverage query must report exactly the served postcodes with no locality")
}

// ⚠ A postcode covering several localities is covered by ANY of them — the join must not require a
// one-to-one relationship. Getting this wrong would report false gaps for every multi-suburb postcode,
// which is most of them.
func TestSC002_AMultiLocalityPostcodeCountsAsCovered(t *testing.T) {
	if testing.Short() {
		t.Skip("requires Docker (real PostgreSQL); skipped under -short")
	}
	pool := startLocalityPostgres(t)
	seedCoverageSchema(t, pool)

	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO public.locality (name, state, postcode) VALUES
			('Richmond','VIC','3121'), ('Richmond East','VIC','3121'), ('Richmond North','VIC','3121');
		INSERT INTO public.delivery_zone_postcode (postcode) VALUES ('3121');
	`)
	require.NoError(t, err)

	require.Empty(t, uncoveredPostcodes(t, pool))
}

// ⚠ And the converse, which is the whole point of FR-002: a locality Effy does NOT deliver to is
// perfectly normal and must never be treated as a problem. The table holds all of Australia; the zone
// table holds where we deliver. If this ever fails, someone has made `locality` a subset of the served
// postcodes and collapsed "unrecognised place" into "we don't deliver there".
func TestSC002_UnservedLocalitiesAreExpectedNotErrors(t *testing.T) {
	if testing.Short() {
		t.Skip("requires Docker (real PostgreSQL); skipped under -short")
	}
	pool := startLocalityPostgres(t)
	seedCoverageSchema(t, pool)

	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO public.locality (name, state, postcode) VALUES
			('Melbourne','VIC','3000'), ('Broome','WA','6725'), ('Darwin','NT','0800');
		INSERT INTO public.delivery_zone_postcode (postcode) VALUES ('3000');
	`)
	require.NoError(t, err)

	require.Empty(t, uncoveredPostcodes(t, pool),
		"localities outside the delivery footprint are ordinary — the rule is one-directional")
}
