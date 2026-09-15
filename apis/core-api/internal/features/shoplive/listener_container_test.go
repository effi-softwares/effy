package shoplive

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"go.uber.org/zap"
)

// The listener, against REAL PostgreSQL and the REAL migrations (058).
//
// ⚠ THIS CANNOT BE A UNIT TEST. Everything under test belongs to the database, not to our code: that
// a trigger fires at all, that NOTIFY reaches a listening session, that the payload is the shop id,
// and that a rolled-back transaction sends nothing. A fake notifier would prove that our fake
// notifies — 027 R13's failure mode, where the fixture agreed with the code instead of with the
// world.
//
// ⚠ RUN IT. 052 lost an entire session's exactly-once proofs to a silent Docker skip. `docker info`
// before trusting a green suite that includes this file.

func startPostgresForListener(t *testing.T) *pgxpool.Pool {
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

	dir := filepath.Join("..", "..", "..", "..", "..", "db", "migrations")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err, "migrations directory")
	var files []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	require.NotEmpty(t, files, "no migrations found — this test would otherwise pass vacuously")
	for _, name := range files {
		body, err := os.ReadFile(filepath.Join(dir, name))
		require.NoError(t, err)
		up := body_upSection(string(body))
		_, err = pool.Exec(ctx, up)
		require.NoError(t, err, "applying %s", name)
	}
	return pool
}

func body_upSection(body string) string {
	start := strings.Index(body, "-- +goose Up")
	if start < 0 {
		return body
	}
	rest := body[start:]
	if end := strings.Index(rest, "-- +goose Down"); end >= 0 {
		return rest[:end]
	}
	return rest
}

func seedShopWithOrder(t *testing.T, pool *pgxpool.Pool) (shopID, orderID string) {
	t.Helper()
	ctx := context.Background()
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop (code, name) VALUES ('S1','Shop One') RETURNING id::text`).Scan(&shopID))
	var custID string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.customer (cognito_sub, email) VALUES ('sub-c','a@b.c') RETURNING id::text`).Scan(&custID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
		   delivery_fee_amount, grand_total_amount, delivery_address, placed_at)
		 VALUES ($1::uuid,'EFY-L1','paid',30,0,30,'{"recipientName":"Ada"}'::jsonb, now())
		 RETURNING id::text`, custID).Scan(&orderID))
	return shopID, orderID
}

// waitFor polls until the hub has delivered something, or gives up.
func waitFor(t *testing.T, ch <-chan Event, want Event) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		select {
		case got := <-ch:
			if got == want {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q", want)
		}
	}
}

func TestListenerDeliversAPokeForTheShopThatChanged(t *testing.T) {
	pool := startPostgresForListener(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := NewHub()
	go NewListener(pool, hub, zap.NewNop(), noMetrics{}).Run(ctx)

	shopID, orderID := seedShopWithOrder(t, pool)

	mine, release := hub.Subscribe(shopID, "sub-a")
	defer release()
	// The listener emits a resync when it first attaches; drain it.
	waitFor(t, mine, EventResync)

	// A portion appears for this shop — exactly what the payment fan-out does (019).
	_, err := pool.Exec(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, 3, 30)`, orderID, shopID)
	require.NoError(t, err)

	waitFor(t, mine, EventPoke)
}

func TestListenerSendsNothingForARolledBackChange(t *testing.T) {
	pool := startPostgresForListener(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := NewHub()
	go NewListener(pool, hub, zap.NewNop(), noMetrics{}).Run(ctx)

	shopID, orderID := seedShopWithOrder(t, pool)
	ch, release := hub.Subscribe(shopID, "sub-a")
	defer release()
	waitFor(t, ch, EventResync)

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = tx.Exec(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, 3, 30)`, orderID, shopID)
	require.NoError(t, err)
	require.NoError(t, tx.Rollback(ctx))

	// ⚠ NOTIFY is delivered only on COMMIT. This is the property that lets a trigger be the source of
	// truth for "something changed": a console can never be woken by work that did not happen.
	select {
	case got := <-ch:
		t.Fatalf("received %q for a rolled-back transaction", got)
	case <-time.After(750 * time.Millisecond):
	}
}

func TestListenerDoesNotLeakOtherShopsWork(t *testing.T) {
	pool := startPostgresForListener(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := NewHub()
	go NewListener(pool, hub, zap.NewNop(), noMetrics{}).Run(ctx)

	shopID, orderID := seedShopWithOrder(t, pool)
	var otherShop string
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO public.shop (code, name) VALUES ('S2','Shop Two') RETURNING id::text`).Scan(&otherShop))

	watcher, release := hub.Subscribe(otherShop, "sub-b")
	defer release()
	waitFor(t, watcher, EventResync)

	_, err := pool.Exec(ctx,
		`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
		 VALUES ($1::uuid, $2::uuid, 3, 30)`, orderID, shopID)
	require.NoError(t, err)

	select {
	case got := <-watcher:
		t.Fatalf("a console watching another shop received %q", got)
	case <-time.After(750 * time.Millisecond):
	}
}
