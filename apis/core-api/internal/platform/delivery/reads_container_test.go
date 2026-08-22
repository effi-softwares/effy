package delivery

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// Container-backed tests for the delivery reads + loader. With raw SQL and no ORM, only a real database
// catches SQL, constraint, and scan errors (research B9). Gated behind -short so `go test -short ./...`
// stays Docker-free (the platformstatus precedent).

func startPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping container-backed test in -short mode")
	}
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

// minimalSchema stands up just the tables the reads + loader touch — the subset of the 047 migration
// under test here. (The full migration is exercised by `make db-up`; this proves the SQL these functions
// issue is correct against a real engine.)
func minimalSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		CREATE TABLE public.locality (
			id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			name          text NOT NULL,
			state         text NOT NULL CHECK (state IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
			postcode      text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
			latitude      numeric(9,6),
			longitude     numeric(9,6),
			address_count int NOT NULL DEFAULT 0 CHECK (address_count >= 0),
			CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode)
		);
		CREATE INDEX locality_name_prefix_idx ON public.locality (lower(name) text_pattern_ops);

		CREATE TABLE public.delivery_ring (
			id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			status text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.delivery_zone (
			id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			ring_id uuid NOT NULL REFERENCES public.delivery_ring (id),
			status  text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))
		);
		CREATE TABLE public.delivery_zone_postcode (
			id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			zone_id  uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
			postcode text NOT NULL UNIQUE CHECK (postcode ~ '^[0-9]{4}$')
		);

		CREATE TABLE public.delivery_fee_plan (
			id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			name            text NOT NULL UNIQUE,
			is_active       boolean NOT NULL DEFAULT false,
			rounding_step   numeric(12,2) NOT NULL DEFAULT 0.50,
			floor_amount    numeric(12,2) NOT NULL,
			cap_amount      numeric(12,2) NOT NULL,
			same_day_factor numeric(6,3)  NOT NULL,
			standard_factor numeric(6,3)  NOT NULL
		);
		CREATE UNIQUE INDEX delivery_fee_plan_one_active_uq ON public.delivery_fee_plan (is_active) WHERE is_active = true;
		CREATE TABLE public.delivery_ring_price (
			id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			plan_id      uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
			ring_id      uuid NOT NULL REFERENCES public.delivery_ring (id),
			price_amount numeric(12,2) NOT NULL,
			UNIQUE (plan_id, ring_id)
		);
		CREATE TABLE public.delivery_weight_band (
			id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			plan_id     uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
			upper_grams int NOT NULL,
			add_amount  numeric(12,2) NOT NULL,
			UNIQUE (plan_id, upper_grams)
		);

		CREATE TABLE public.delivery_settings (
			id int PRIMARY KEY DEFAULT 1,
			hub_latitude numeric(9,6), hub_longitude numeric(9,6),
			sameday_prep_buffer_min int NOT NULL DEFAULT 60
		);
		CREATE TABLE public.delivery_collection_run (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			run_time time NOT NULL,
			status text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.shop_sameday_exception (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			shop_id uuid NOT NULL,
			zone_id uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
			mode text NOT NULL CHECK (mode IN ('on','off')),
			UNIQUE (shop_id, zone_id)
		);`)
	require.NoError(t, err)
}

// two uuid-shaped shop ids for the quote tests (shop_id columns are uuid).
const (
	shopA = "00000000-0000-0000-0000-00000000aaaa"
	shopB = "00000000-0000-0000-0000-00000000bbbb"
)

// seedZoneAndPlan installs one active zone (3121 → INNER ring) and one active plan priced for INNER,
// returning nothing — the tests read it back through the delivery functions.
func seedZoneAndPlan(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		INSERT INTO public.delivery_ring (id) VALUES
			('00000000-0000-0000-0000-0000000000f1'),   -- INNER
			('00000000-0000-0000-0000-0000000000f2');   -- OUTER (priced too)
		INSERT INTO public.delivery_zone (id, ring_id, status) VALUES
			('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'active');
		INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES
			('00000000-0000-0000-0000-0000000000e1', '3121');
		INSERT INTO public.delivery_fee_plan (id, name, is_active, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor)
			VALUES ('00000000-0000-0000-0000-0000000000d1', 'Launch', true, 0.50, 4.00, 40.00, 1.800, 1.000);
		INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount) VALUES
			('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f1', 6.00),
			('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f2', 12.00);
		INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
			('00000000-0000-0000-0000-0000000000d1', 2000, 0.00),
			('00000000-0000-0000-0000-0000000000d1', 5000, 2.00),
			('00000000-0000-0000-0000-0000000000d1', 10000, 5.50);`)
	require.NoError(t, err)
}

func TestLoadActivePlan_Container(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	seedZoneAndPlan(t, pool)
	ctx := context.Background()

	plan, err := LoadActivePlan(ctx, pool)
	require.NoError(t, err)
	assert.Equal(t, int64(50), plan.RoundingStepCents)
	assert.Equal(t, int64(400), plan.FloorCents)
	assert.Equal(t, int64(4000), plan.CapCents)
	assert.Equal(t, int64(1800), plan.SameDayFactorMilli)
	assert.Equal(t, int64(1000), plan.StandardFactorMilli)
	assert.Len(t, plan.RingPriceCents, 2)
	assert.Len(t, plan.WeightBands, 3)
	assert.Equal(t, int64(0), plan.WeightBands[0].AddCents) // ordered ascending
}

func TestZoneForPostcode_Container(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	seedZoneAndPlan(t, pool)
	ctx := context.Background()

	zone, serviced, err := ZoneForPostcode(ctx, pool, "3121")
	require.NoError(t, err)
	assert.True(t, serviced)
	assert.Equal(t, "00000000-0000-0000-0000-0000000000f1", zone.RingID)

	_, serviced, err = ZoneForPostcode(ctx, pool, "3999")
	require.NoError(t, err)
	assert.False(t, serviced, "a postcode in no zone is not serviced")
}

func TestQuote_StandardOnly_Container(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	seedZoneAndPlan(t, pool)
	ctx := context.Background()
	now := time.Now()

	qr := NewQuoter(pool)

	// No same-day: zone default is not eligible, no collection runs → standard-only.
	res, err := qr.Quote(ctx, "3121", []PackageInput{{ShopID: shopA, Grams: 1500}, {ShopID: shopB, Grams: 7000}}, now)
	require.NoError(t, err)
	assert.True(t, res.Serviced)
	require.Len(t, res.Packages, 2)
	assert.Equal(t, int64(600), res.Packages[0].StandardFeeCents())  // INNER 6.00 + 0
	assert.Equal(t, int64(1150), res.Packages[1].StandardFeeCents()) // INNER 6.00 + 5.50
	assert.Nil(t, res.SameDayUntil, "no runs → no same-day")
	for _, p := range res.Packages {
		assert.Len(t, p.Options, 1, "standard only")
	}

	// Not serviceable → no packages, one reason.
	res, err = qr.Quote(ctx, "3999", []PackageInput{{ShopID: shopA, Grams: 1500}}, now)
	require.NoError(t, err)
	assert.False(t, res.Serviced)
	assert.Empty(t, res.Packages)
}

// SC-011: in a same-day-eligible zone with one shop excepted OFF, same-day appears on exactly one package.
func TestQuote_SameDayPerShop_Container(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	seedZoneAndPlan(t, pool)
	ctx := context.Background()

	// Make the zone same-day eligible, add a run far enough ahead to be makeable, and except shop B OFF.
	_, err := pool.Exec(ctx, `
		UPDATE public.delivery_zone SET sameday_eligible = true WHERE id = '00000000-0000-0000-0000-0000000000e1';
		INSERT INTO public.delivery_settings (id, sameday_prep_buffer_min) VALUES (1, 0);
		INSERT INTO public.delivery_collection_run (run_time, status) VALUES ('23:59:00', 'active');
		INSERT INTO public.shop_sameday_exception (shop_id, zone_id, mode)
			VALUES ($1, '00000000-0000-0000-0000-0000000000e1', 'off');`, shopB)
	require.NoError(t, err)

	// Quote just before midnight Melbourne so the 23:59 run is still makeable.
	now := time.Date(2026, 8, 24, 23, 0, 0, 0, MelbourneTZ)
	qr := NewQuoter(pool)
	res, err := qr.Quote(ctx, "3121", []PackageInput{{ShopID: shopA, Grams: 1500}, {ShopID: shopB, Grams: 1500}}, now)
	require.NoError(t, err)
	require.True(t, res.Serviced)
	require.NotNil(t, res.SameDayUntil, "shop A can do same-day, so the cutoff is set")

	sameDayCount := 0
	for _, p := range res.Packages {
		for _, o := range p.Options {
			if o.Method == MethodSameDay {
				sameDayCount++
			}
		}
	}
	assert.Equal(t, 1, sameDayCount, "same-day on exactly shop A's package (shop B is excepted off)")
}

const sampleCSV = `postcode,locality,state,latitude,longitude,address_count
3000,MELBOURNE,VIC,-37.814200,144.963200,117844
3121,RICHMOND,VIC,-37.819500,144.998900,18342
3141,SOUTH YARRA,VIC,-37.838700,144.992500,15230
3350,BALLARAT CENTRAL,VIC,-37.561700,143.856500,4200
3550,BENDIGO,VIC,,,3900
`

func TestLoadLocalities_UpsertAndIdempotent(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	ctx := context.Background()

	res, err := LoadLocalities(ctx, pool, strings.NewReader(sampleCSV))
	require.NoError(t, err)
	assert.Equal(t, 5, res.Read)
	assert.Equal(t, 5, res.Upserted)

	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM public.locality`).Scan(&count))
	assert.Equal(t, 5, count)

	// A blank lat/lng loads as NULL, not zero (Bendigo row).
	var latNull bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT latitude IS NULL FROM public.locality WHERE postcode = '3550'`).Scan(&latNull))
	assert.True(t, latNull, "blank coordinate must load as NULL, never 0")

	// Re-running is idempotent: same rows, count unchanged (030 idempotence).
	res2, err := LoadLocalities(ctx, pool, strings.NewReader(sampleCSV))
	require.NoError(t, err)
	assert.Equal(t, res.Read, res2.Read)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM public.locality`).Scan(&count))
	assert.Equal(t, 5, count, "re-load must not duplicate rows")
}

func TestSearchLocalities(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	ctx := context.Background()
	_, err := LoadLocalities(ctx, pool, strings.NewReader(sampleCSV))
	require.NoError(t, err)

	// Name prefix, case-insensitive.
	rows, err := SearchLocalities(ctx, pool, "rich", 8)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "RICHMOND", rows[0].Name)
	assert.Equal(t, "VIC", rows[0].State)
	assert.Equal(t, "3121", rows[0].Postcode)

	// Postcode prefix.
	rows, err = SearchLocalities(ctx, pool, "30", 8)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "3000", rows[0].Postcode)

	// Limit is honoured and ordering is alphabetical (never by serviceability).
	rows, err = SearchLocalities(ctx, pool, "b", 8)
	require.NoError(t, err)
	require.Len(t, rows, 2) // BALLARAT CENTRAL, BENDIGO
	assert.Equal(t, "BALLARAT CENTRAL", rows[0].Name)
	assert.Equal(t, "BENDIGO", rows[1].Name)
}

func TestServiceableForPostcode(t *testing.T) {
	pool := startPostgres(t)
	minimalSchema(t, pool)
	ctx := context.Background()

	// One active zone (3121) and one disabled zone (3550); 3999 is in no zone.
	_, err := pool.Exec(ctx, `
		INSERT INTO public.delivery_ring (id) VALUES ('00000000-0000-0000-0000-000000000001');
		INSERT INTO public.delivery_zone (id, ring_id, status) VALUES
			('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'active'),
			('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'disabled');
		INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES
			('00000000-0000-0000-0000-0000000000a1', '3121'),
			('00000000-0000-0000-0000-0000000000a2', '3550');`)
	require.NoError(t, err)

	serviced, err := ServiceableForPostcode(ctx, pool, "3121")
	require.NoError(t, err)
	assert.True(t, serviced, "postcode in an active zone is serviced")

	serviced, err = ServiceableForPostcode(ctx, pool, "3550")
	require.NoError(t, err)
	assert.False(t, serviced, "postcode in a DISABLED zone is not serviced")

	serviced, err = ServiceableForPostcode(ctx, pool, "3999")
	require.NoError(t, err)
	assert.False(t, serviced, "postcode in no zone is not serviced")
}

func TestNormalizePostcode(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"3121", "3121", true},
		{"  3121  ", "3121", true},
		{"312", "", false},
		{"31211", "", false},
		{"abcd", "", false},
		{"", "", false},
		{"3a21", "", false},
	}
	for _, c := range cases {
		got, ok := NormalizePostcode(c.in)
		assert.Equal(t, c.ok, ok, "ok for %q", c.in)
		assert.Equal(t, c.want, got, "value for %q", c.in)
	}
}
