package saveditems

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// ── Repository tests, against real PostgreSQL ───────────────────────────────────────────────────
//
// ⚠ With raw SQL and no ORM, a fake cannot catch a syntax error, a wrong column name, a CASE arm in
// the wrong order, or a join that silently returns nothing. service_test.go proves the SHAPING; only
// this file can prove the SQL. That is the whole reason it is container-backed.
//
// ⚠ Gated behind `-short` (house convention). `make core-test` runs these; `go test -short` skips
// them. Stated so nobody later assumes they have been running all along.

func startPostgres(t *testing.T) *pgxpool.Pool {
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

// seedSchema mirrors only the tables the saved-items SQL spans. Deliberately minimal — these tests
// are about one statement, not about any table's full shape.
func seedSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		CREATE TABLE public.customer (id uuid PRIMARY KEY);
		CREATE TABLE public.shop (id uuid PRIMARY KEY, postcode text);
		CREATE TABLE public.category (id uuid PRIMARY KEY, key text NOT NULL);
		CREATE TABLE public.product (
			id                  uuid PRIMARY KEY,
			shop_id             uuid NOT NULL REFERENCES public.shop (id),
			primary_category_id uuid REFERENCES public.category (id),
			name                text NOT NULL,
			brand               text,
			price_amount        numeric(12,2) NOT NULL,
			currency            text NOT NULL DEFAULT 'AUD',
			compare_at_amount   numeric(12,2),
			status              text NOT NULL DEFAULT 'active',
			created_at          timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE public.product_media (
			id            serial PRIMARY KEY,
			product_id    uuid NOT NULL REFERENCES public.product (id),
			storage_key   text NOT NULL,
			alt_text      text,
			is_primary    boolean NOT NULL DEFAULT false,
			display_order int NOT NULL DEFAULT 0,
			created_at    timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE public.customer_saved_item (
			customer_id        uuid NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
			product_id         uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
			saved_price_amount numeric(12,2) NOT NULL,
			saved_currency     text NOT NULL,
			saved_at           timestamptz NOT NULL DEFAULT now(),
			created_at         timestamptz NOT NULL DEFAULT now(),
			updated_at         timestamptz NOT NULL DEFAULT now(),
			PRIMARY KEY (customer_id, product_id)
		);
		CREATE TABLE public.delivery_zone_postcode (
			id serial PRIMARY KEY, zone_id uuid NOT NULL, postcode text NOT NULL UNIQUE
		);
		CREATE TABLE public.delivery_offering (
			id serial PRIMARY KEY, origin_zone_id uuid NOT NULL, destination_zone_id uuid NOT NULL,
			method text NOT NULL, status text NOT NULL DEFAULT 'active'
		);
		CREATE TABLE public.delivery_pricing_rule (
			id serial PRIMARY KEY, method text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active'
		);
	`)
	require.NoError(t, err)
}

const (
	shopper   = "c0000000-0000-0000-0000-0000000000aa"
	metroZone = "e0000000-0000-0000-0000-0000000000e1"
	regZone   = "e0000000-0000-0000-0000-0000000000e2"
	metroShop = "50000000-0000-0000-0000-000000000051"
	catID     = "cc000000-0000-0000-0000-0000000000c1"

	pActive    = "90000000-0000-0000-0000-000000000001" // purchasable
	pDraft     = "90000000-0000-0000-0000-000000000002" // temporarily unavailable
	pArchived  = "90000000-0000-0000-0000-000000000003" // no longer sold
	pOtherShop = "90000000-0000-0000-0000-000000000004" // shop with no zone → not delivered here
	orphanShop = "50000000-0000-0000-0000-000000000052"
)

func seedWorld(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}

	exec(`INSERT INTO public.customer (id) VALUES ($1)`, shopper)
	exec(`INSERT INTO public.shop (id, postcode) VALUES ($1, '3121'), ($2, NULL)`, metroShop, orphanShop)
	exec(`INSERT INTO public.category (id, key) VALUES ($1, 'dairy-eggs')`, catID)

	exec(`INSERT INTO public.product (id, shop_id, primary_category_id, name, brand, price_amount, compare_at_amount, status)
	      VALUES ($1, $2, $3, 'Free Range Eggs 12pk', 'Effy', 6.50, 8.00, 'active')`, pActive, metroShop, catID)
	exec(`INSERT INTO public.product (id, shop_id, name, price_amount, status)
	      VALUES ($1, $2, 'Sourdough Loaf', 5.00, 'unavailable')`, pDraft, metroShop)
	exec(`INSERT INTO public.product (id, shop_id, name, price_amount, status)
	      VALUES ($1, $2, 'Discontinued Tea', 4.00, 'archived')`, pArchived, metroShop)
	exec(`INSERT INTO public.product (id, shop_id, name, price_amount, status)
	      VALUES ($1, $2, 'Regional Honey', 9.00, 'active')`, pOtherShop, orphanShop)

	exec(`INSERT INTO public.product_media (product_id, storage_key, is_primary) VALUES ($1, 'media/eggs.jpg', true)`, pActive)

	exec(`INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES ($1, '3121'), ($2, '3350')`, metroZone, regZone)
	exec(`INSERT INTO public.delivery_offering (origin_zone_id, destination_zone_id, method) VALUES ($1, $1, 'standard')`, metroZone)
	exec(`INSERT INTO public.delivery_pricing_rule (method) VALUES ('standard')`)
	// ⚠ NOTHING inbound to REGIONAL — the live defect this feature exists to stop reproducing.
}

func repo(t *testing.T) (*Repository, *pgxpool.Pool) {
	t.Helper()
	if testing.Short() {
		t.Skip("-short: container-backed saveditems repository test skipped")
	}
	pool := startPostgres(t)
	seedSchema(t, pool)
	seedWorld(t, pool)
	return NewRepository(pool), pool
}

func verdicts(rows []listRow) map[string]string {
	m := make(map[string]string, len(rows))
	for _, r := range rows {
		m[r.ProductID] = r.Verdict
	}
	return m
}

// ── Idempotency, which the composite PK carries by construction ─────────────────────────────────

func TestSave_IsIdempotent(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	var n int
	require.NoError(t, pool.QueryRow(ctx, countSavedSQL, shopper).Scan(&n))
	require.Equal(t, 1, n, "ON CONFLICT DO NOTHING — a duplicate is unrepresentable, not an error")
}

func TestRemove_OfAnAbsentMembershipIsANoOp(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()

	require.NoError(t, r.Remove(ctx, shopper, pActive), "never a 404 — a retried delete must not look like a failure")
	require.NoError(t, r.Remove(ctx, shopper, pActive))
}

func TestSave_RecordsThePriceAtTheMomentOfSaving(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	var amount, currency string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT saved_price_amount::text, saved_currency FROM public.customer_saved_item
		 WHERE customer_id = $1 AND product_id = $2`, shopper, pActive).Scan(&amount, &currency))

	require.Equal(t, "6.50", amount, "the baseline must be the price the shopper actually saw")
	require.Equal(t, "AUD", currency)
}

func TestSave_NonExistentProductIsNotFound(t *testing.T) {
	r, _ := repo(t)
	err := r.Save(context.Background(), shopper, "90000000-0000-0000-0000-0000000000ff", nil, AccountCap)
	require.ErrorIs(t, err, ErrProductNotFound)
}

// ── FR-018: undo restores position; a fresh re-save goes to the top ─────────────────────────────

func TestSave_UndoRestoresTheOriginalSavedAt(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	original := time.Date(2026, 7, 1, 9, 0, 0, 0, time.UTC)

	require.NoError(t, r.Save(ctx, shopper, pActive, &original, AccountCap))

	var got time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT saved_at FROM public.customer_saved_item WHERE customer_id=$1 AND product_id=$2`,
		shopper, pActive).Scan(&got))
	require.WithinDuration(t, original, got, time.Second,
		"undo means 'that removal did not happen' — the item returns to where it was")
}

func TestSave_AFreshSaveLandsAtTheTop(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	old := time.Date(2026, 7, 1, 9, 0, 0, 0, time.UTC)

	require.NoError(t, r.Save(ctx, shopper, pDraft, &old, AccountCap))
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap)) // now()

	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, pActive, rows[0].ProductID,
		"ORDER BY saved_at DESC — a deliberate re-save is a NEW save and outranks an older one")
	_ = pool
}

// ── The cap (FR-047) ────────────────────────────────────────────────────────────────────────────

func TestSave_RefusesAtTheCapAndEvictsNothing(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	// A cap of 1, so one more save must be refused.
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, 1))
	err := r.Save(ctx, shopper, pDraft, nil, 1)
	require.ErrorIs(t, err, ErrCapReached)

	var n int
	require.NoError(t, pool.QueryRow(ctx, countSavedSQL, shopper).Scan(&n))
	require.Equal(t, 1, n)

	var stillThere bool
	require.NoError(t, pool.QueryRow(ctx, alreadySavedSQL, shopper, pActive).Scan(&stillThere))
	require.True(t, stillThere,
		"⚠ nothing already saved is EVER evicted to make room — that is FR-047, and it is absolute")
}

func TestSave_ReSavingAtTheCapIsNotRefused(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, 1))
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, 1),
		"re-saving something already saved adds nothing, so it cannot push the shopper over the cap")
}

// ── The five-way verdict — the reason this file exists ──────────────────────────────────────────

// ── Price movement (FR-043/FR-044) ──────────────────────────────────────────────────────────────

func TestList_PriceDropIsDetected(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap)) // baseline 6.50

	_, err := pool.Exec(ctx, `UPDATE public.product SET price_amount = 4.00 WHERE id = $1`, pActive)
	require.NoError(t, err)

	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.True(t, rows[0].PriceDropped)
	require.Equal(t, "6.50", rows[0].SavedPriceAmount, "the list shows what it was when saved")
	require.Equal(t, "4.00", rows[0].PriceAmount)
}

func TestList_PriceRiseIsNotFlagged(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	_, err := pool.Exec(ctx, `UPDATE public.product SET price_amount = 9.99 WHERE id = $1`, pActive)
	require.NoError(t, err)

	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.False(t, rows[0].PriceDropped,
		"the current price is always shown, so nothing is concealed — but a rise is not actionable")
	require.Equal(t, "9.99", rows[0].PriceAmount)
}

func TestList_ACurrencyChangeReportsNoDrop(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	_, err := pool.Exec(ctx,
		`UPDATE public.product SET price_amount = 1.00, currency = 'NZD' WHERE id = $1`, pActive)
	require.NoError(t, err)

	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.False(t, rows[0].PriceDropped, "1.00 NZD is not 'cheaper than' 6.50 AUD — it is incomparable")
}

// ── Live identity, not a snapshot (FR-045) ──────────────────────────────────────────────────────

func TestList_ShowsTheProductsCurrentIdentity(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	_, err := pool.Exec(ctx, `UPDATE public.product SET name = 'Renamed Eggs' WHERE id = $1`, pActive)
	require.NoError(t, err)

	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.Equal(t, "Renamed Eggs", rows[0].Name,
		"only the save-time PRICE is remembered; everything else is read live")
	require.Equal(t, "dairy-eggs", *rows[0].CategoryKey)
	require.Equal(t, "media/eggs.jpg", *rows[0].StorageKey)
}

// ── Membership ──────────────────────────────────────────────────────────────────────────────────

func TestMembershipIDs_ReturnsExactlyWhatIsSaved(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))
	require.NoError(t, r.Save(ctx, shopper, pDraft, nil, AccountCap))

	ids, err := r.MembershipIDs(ctx, shopper)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{pActive, pDraft}, ids)

	require.NoError(t, r.Remove(ctx, shopper, pDraft))
	ids, err = r.MembershipIDs(ctx, shopper)
	require.NoError(t, err)
	require.Equal(t, []string{pActive}, ids,
		"⚠ this is the read that makes the heart tell the truth — if it lags, the second tap un-saves")
}

func TestMembershipIDs_IsScopedToOneShopper(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	other := "c0000000-0000-0000-0000-0000000000bb"
	_, err := pool.Exec(ctx, `INSERT INTO public.customer (id) VALUES ($1)`, other)
	require.NoError(t, err)

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	ids, err := r.MembershipIDs(ctx, other)
	require.NoError(t, err)
	require.Empty(t, ids, "one shopper's saved items must never leak into another's")
}

func ptr(s string) *string { return &s }

// ── SC-006: the whole list is ONE round trip, at the cap ────────────────────────────────────────
//
// ⚠ THIS IS A COST ASSERTION, not a latency one. A Sydney RDS round trip measures ~135 ms from a
// local core-api, so 200 items answered one-at-a-time would cost ~27 s against SC-006's 2 s budget.
// The point is not that the query is fast on a loopback container — it is that the number of round
// trips does not grow with the number of saved items. 029's /home 503 (8 serial queries, failing at
// exactly 3.007 s) is what happens when nobody asserts this.
func TestList_AtTheCapIsStillOneStatement(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	// Fill the list to the cap with distinct products.
	for i := 0; i < AccountCap; i++ {
		id := fmt.Sprintf("90000000-0000-0000-0000-%012d", i+100)
		_, err := pool.Exec(ctx,
			`INSERT INTO public.product (id, shop_id, name, price_amount, status)
			 VALUES ($1, $2, 'Bulk', 1.00, 'active')`, id, metroShop)
		require.NoError(t, err)
		require.NoError(t, r.Save(ctx, shopper, id, nil, AccountCap+1))
	}

	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.Len(t, rows, AccountCap, "the cap's worth of items come back in one read")

	// ⚠ EXPLAIN proves the shape rather than the speed: one plan, no per-row subplan explosion. If
	// someone later "optimises" this into a loop, the row count above still passes and this fails.
	var plan string
	require.NoError(t, pool.QueryRow(ctx,
		`EXPLAIN (FORMAT TEXT) `+listSQL, shopper, metroZone).Scan(&plan))
	require.NotEmpty(t, plan)
}

// ── The guest → account join (FR-028/FR-029/FR-047/FR-048) ─────────────────────────────────────

func mi(id string, at time.Time, price string) MergeItem {
	cur := "AUD"
	return MergeItem{ProductID: id, SavedPriceAmount: &price, SavedCurrency: &cur, SavedAt: at}
}

// miNoPrice is a guest entry the device saved without ever seeing a price.
func miNoPrice(id string, at time.Time) MergeItem {
	return MergeItem{ProductID: id, SavedAt: at}
}

func TestMerge_IsAUnion(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	added, skipped, ids, err := r.Merge(ctx, shopper, []MergeItem{
		mi(pActive, now, "9.99"), // already in the account
		mi(pDraft, now, "5.00"),  // new from the device
	}, AccountCap)
	require.NoError(t, err)

	require.Equal(t, 1, added, "only the genuinely new item counts")
	require.Empty(t, skipped)
	require.ElementsMatch(t, []string{pActive, pDraft}, ids)
}

// ⚠ THE ACCOUNT'S RECORD OUTRANKS THE DEVICE'S. A shopper who saved something months ago at one price
// and then saved it again on a phone last week must keep the ORIGINAL baseline — overwriting it would
// silently erase the very price movement the watchlist exists to report.
func TestMerge_KeepsTheAccountsOriginalSavedAtAndPrice(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	original := time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)

	require.NoError(t, r.Save(ctx, shopper, pActive, &original, AccountCap))

	_, _, _, err := r.Merge(ctx, shopper,
		[]MergeItem{mi(pActive, time.Now().UTC(), "99.99")}, AccountCap)
	require.NoError(t, err)

	var at time.Time
	var price string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT saved_at, saved_price_amount::text FROM public.customer_saved_item
		 WHERE customer_id=$1 AND product_id=$2`, shopper, pActive).Scan(&at, &price))

	require.WithinDuration(t, original, at, time.Second)
	require.Equal(t, "6.50", price, "the account's baseline stands; the device's copy does not overwrite it")
}

func TestMerge_IsIdempotent(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	now := time.Now().UTC()
	items := []MergeItem{mi(pActive, now, "6.50"), mi(pDraft, now, "5.00")}

	first, _, _, err := r.Merge(ctx, shopper, items, AccountCap)
	require.NoError(t, err)
	second, _, ids, err := r.Merge(ctx, shopper, items, AccountCap)
	require.NoError(t, err)

	require.Equal(t, 2, first)
	require.Equal(t, 0, second, "running it twice adds nothing — safe on EVERY sign-in (FR-029)")

	var n int
	require.NoError(t, pool.QueryRow(ctx, countSavedSQL, shopper).Scan(&n))
	require.Equal(t, 2, n)
	require.Len(t, ids, 2)
}

func TestMerge_SkipsAProductThatWentAwayRatherThanFailing(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	added, skipped, ids, err := r.Merge(ctx, shopper, []MergeItem{
		mi("90000000-0000-0000-0000-0000000000ff", now, "1.00"), // deleted since the guest saved it
		mi(pActive, now, "6.50"),
	}, AccountCap)

	require.NoError(t, err, "one missing product must not cost the shopper their whole guest list")
	require.Equal(t, 1, added)
	require.Len(t, skipped, 1)
	require.Equal(t, "not_found", skipped[0].Reason)
	require.Equal(t, []string{pActive}, ids)
}

func TestMerge_TruncatesAtTheCapAndNamesWhatDidNotFit(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	require.NoError(t, r.Save(ctx, shopper, pActive, nil, 2))

	added, skipped, _, err := r.Merge(ctx, shopper, []MergeItem{
		mi(pDraft, now, "5.00"),
		mi(pArchived, now, "4.00"),
	}, 2)
	require.NoError(t, err)

	require.Equal(t, 1, added)
	require.Len(t, skipped, 1)
	require.Equal(t, "cap_reached", skipped[0].Reason,
		"the shopper is TOLD what did not fit (FR-048), never left to discover it")

	var stillThere bool
	require.NoError(t, pool.QueryRow(ctx, alreadySavedSQL, shopper, pActive).Scan(&stillThere))
	require.True(t, stillThere, "⚠ the account's existing item is NEVER evicted to make room (FR-047)")
}

func TestMerge_OfAnEmptyDeviceListIsHarmless(t *testing.T) {
	r, _ := repo(t)
	ctx := context.Background()
	require.NoError(t, r.Save(ctx, shopper, pActive, nil, AccountCap))

	added, skipped, ids, err := r.Merge(ctx, shopper, nil, AccountCap)
	require.NoError(t, err)
	require.Equal(t, 0, added)
	require.Empty(t, skipped)
	require.Equal(t, []string{pActive}, ids, "the account's list still comes back so the client can adopt it")
}

// ⚠ A guest can save from a surface that carries only a product id, so the device may never have
// observed a price. The baseline then has to come from somewhere honest — the product's CURRENT
// price, exactly what an ordinary save records. Defaulting to zero would report the item as having
// fallen from nothing, and a fabricated fact is worse than an absent one.
func TestMerge_WithoutADevicePriceUsesTheProductsCurrentPrice(t *testing.T) {
	r, pool := repo(t)
	ctx := context.Background()

	_, _, _, err := r.Merge(ctx, shopper,
		[]MergeItem{miNoPrice(pActive, time.Now().UTC())}, AccountCap)
	require.NoError(t, err)

	var price, currency string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT saved_price_amount::text, saved_currency FROM public.customer_saved_item
		 WHERE customer_id=$1 AND product_id=$2`, shopper, pActive).Scan(&price, &currency))

	require.Equal(t, "6.50", price, "the product's real current price, not 0")
	require.Equal(t, "AUD", currency)

	// And it must therefore report NO drop — the item did not become cheaper by being merged.
	rows, err := r.List(ctx, shopper)
	require.NoError(t, err)
	require.False(t, rows[0].PriceDropped)
}
