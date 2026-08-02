package delivery

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// ── 033 R2: the storefront and checkout must give one answer ────────────────────────────────────
//
// These tests exist because a comment claimed something that was not true. storefront's Serviceable()
// called ZoneForPostcode and its doc asserted that this made the storefront and checkout answers
// impossible to drift apart. Checkout requires three further terms, so they had already drifted — and
// the visible symptom was zone REGIONAL answering {"serviced":true} for Ballarat while checkout could
// quote nothing.
//
// ⚠ THE MOST IMPORTANT TEST IN THIS FILE IS TestServiceablePostcode_ZoneWithNoLiveLegIsNotServiced.
// It is the defect, in one assertion. Everything else guards against over-correcting.
//
// ⚠ These need real PostgreSQL, so they are gated behind `-short` (house convention — see
// platformstatus/repository_test.go). `make core-test` runs them; a `-short` run skips them. Stated
// so nobody later assumes they have been running all along.
//
// ⚠ With raw SQL and no ORM, a fake cannot catch a syntax error, a wrong column name, or a join that
// silently returns nothing. That is the whole reason this is container-backed rather than mocked.

func startDeliveryPostgres(t *testing.T) *pgxpool.Pool {
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

// seedPredicateSchema mirrors only the five tables the predicate spans. Deliberately minimal — these
// tests are about one boolean, not about any table's full shape.
func seedPredicateSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		CREATE TABLE public.shop (
			id       uuid PRIMARY KEY,
			postcode text
		);
		CREATE TABLE public.product (
			id      uuid PRIMARY KEY,
			shop_id uuid NOT NULL REFERENCES public.shop (id)
		);
		CREATE TABLE public.delivery_zone_postcode (
			id       serial PRIMARY KEY,
			zone_id  uuid NOT NULL,
			postcode text NOT NULL UNIQUE
		);
		CREATE TABLE public.delivery_offering (
			id                  serial PRIMARY KEY,
			origin_zone_id      uuid NOT NULL,
			destination_zone_id uuid NOT NULL,
			method              text NOT NULL,
			status              text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.delivery_pricing_rule (
			id     serial PRIMARY KEY,
			method text NOT NULL UNIQUE,
			status text NOT NULL DEFAULT 'active'
		);
	`)
	require.NoError(t, err)
}

// Fixed ids so a failure names something a human recognises.
const (
	zoneMetro      = "11111111-1111-1111-1111-111111111111"
	zoneRegional   = "22222222-2222-2222-2222-222222222222"
	shopMetro      = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	shopNoPostcode = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	prodMetro      = "cccccccc-cccc-cccc-cccc-cccccccccccc"
	prodNoPostcode = "dddddddd-dddd-dddd-dddd-dddddddddddd"
	pcRichmond     = "3121" // in MEL-METRO, with a live priced leg
	pcBallarat     = "3350" // in REGIONAL, which has NO inbound offering — the live defect
	pcNowhere      = "9999" // in no zone at all
)

// seedLiveWorld builds the world the platform actually had when this defect was found: a metro zone
// that works, and a regional zone whose postcodes are "serviced" by membership and reachable by
// nothing.
func seedLiveWorld(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	// ⚠ One statement per Exec. pgx sends a parameterised query as a prepared statement, and Postgres
	// refuses multiple commands in one of those (SQLSTATE 42601) — a multi-statement string only works
	// when it carries no parameters.
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}

	exec(`INSERT INTO public.shop (id, postcode) VALUES ($1, $2), ($3, NULL)`,
		shopMetro, pcRichmond, shopNoPostcode)
	exec(`INSERT INTO public.product (id, shop_id) VALUES ($1, $2), ($3, $4)`,
		prodMetro, shopMetro, prodNoPostcode, shopNoPostcode)
	exec(`INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES ($1, $2), ($3, $4)`,
		zoneMetro, pcRichmond, zoneRegional, pcBallarat)
	// MEL-METRO → MEL-METRO, live and priced.
	exec(`INSERT INTO public.delivery_offering (origin_zone_id, destination_zone_id, method, status)
	      VALUES ($1, $1, 'standard', 'active')`, zoneMetro)
	exec(`INSERT INTO public.delivery_pricing_rule (method, status) VALUES ('standard', 'active')`)
	// ⚠ NOTHING inbound to REGIONAL. That absence IS the defect.
}

func setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("-short: container-backed delivery predicate test skipped")
	}
	pool := startDeliveryPostgres(t)
	seedPredicateSchema(t, pool)
	seedLiveWorld(t, pool)
	return pool
}

// ── The defect itself ───────────────────────────────────────────────────────────────────────────

func TestServiceablePostcode_ZoneWithNoLiveLegIsNotServiced(t *testing.T) {
	pool := setup(t)

	ok, err := ServiceablePostcode(context.Background(), pool, pcBallarat)
	require.NoError(t, err)
	require.False(t, ok,
		"3350 is in zone REGIONAL but nothing delivers there. Answering true is the exact defect this "+
			"predicate exists to remove — the storefront promising a delivery checkout cannot quote.")
}

// ── The over-correction guard: only the first test proves the fix; this proves it did not shut the
// platform off. Both halves matter. ─────────────────────────────────────────────────────────────

func TestServiceablePostcode_ZoneWithALiveLegIsServiced(t *testing.T) {
	pool := setup(t)

	ok, err := ServiceablePostcode(context.Background(), pool, pcRichmond)
	require.NoError(t, err)
	require.True(t, ok, "3121 has an active, priced inbound leg — refusing it would take the storefront down")
}

func TestServiceablePostcode_PostcodeInNoZoneIsNotServiced(t *testing.T) {
	pool := setup(t)

	ok, err := ServiceablePostcode(context.Background(), pool, pcNowhere)
	require.NoError(t, err)
	require.False(t, ok, "a postcode in no zone is undeliverable (FR-017) — the pre-existing rule still holds")
}

// ── Per-product reach ───────────────────────────────────────────────────────────────────────────

func TestPurchasable_AllFourTermsHold(t *testing.T) {
	pool := setup(t)

	ok, err := Purchasable(context.Background(), pool, prodMetro, zoneMetro)
	require.NoError(t, err)
	require.True(t, ok)
}

func TestPurchasable_NoOfferingOnTheLeg(t *testing.T) {
	pool := setup(t)

	// The Melbourne product, asked to reach REGIONAL. The shop resolves, the destination zone exists,
	// and there is still no leg between them.
	ok, err := Purchasable(context.Background(), pool, prodMetro, zoneRegional)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestPurchasable_ShopWithNoPostcodeCannotReachAnywhere(t *testing.T) {
	pool := setup(t)

	// FR: a shop with a NULL postcode has no origin zone, so its packages are undeliverable. The join
	// drops it, which is the behaviour checkout already has (leg.OriginOK).
	ok, err := Purchasable(context.Background(), pool, prodNoPostcode, zoneMetro)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestPurchasable_DisabledOfferingWithdrawsTheLeg(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx, `UPDATE public.delivery_offering SET status = 'disabled'`)
	require.NoError(t, err)

	ok, err := Purchasable(ctx, pool, prodMetro, zoneMetro)
	require.NoError(t, err)
	require.False(t, ok, "a disabled offering withdraws the leg")
}

func TestPurchasable_UnpricedMethodIsNotOffered(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()

	// ⚠ This is checkout's rule (quote.go): a method with no configured, ACTIVE pricing rule is NOT
	// OFFERED, rather than offered at nothing. An unpriced method cannot be sold, and refusing to show
	// it is recoverable in a way that charging nothing for it is not.
	_, err := pool.Exec(ctx, `UPDATE public.delivery_pricing_rule SET status = 'disabled'`)
	require.NoError(t, err)

	ok, err := Purchasable(ctx, pool, prodMetro, zoneMetro)
	require.NoError(t, err)
	require.False(t, ok, "an unpriced method is not offered — omitting this term gives a false 'purchasable'")
}

// ── The test that proves these tests can fail ───────────────────────────────────────────────────

func TestPredicate_CanDistinguishAtAll(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()

	// A predicate that returned a constant would pass several assertions above. This one pins that the
	// SAME product gives DIFFERENT answers for two destinations, so a constant cannot satisfy it.
	reachable, err := Purchasable(ctx, pool, prodMetro, zoneMetro)
	require.NoError(t, err)
	unreachable, err := Purchasable(ctx, pool, prodMetro, zoneRegional)
	require.NoError(t, err)

	require.NotEqual(t, reachable, unreachable,
		"the predicate must actually depend on its inputs — if these agree it is measuring nothing")
}
