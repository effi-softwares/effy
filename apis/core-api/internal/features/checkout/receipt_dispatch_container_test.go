package checkout

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// Container-backed proof of 052's exactly-once receipt rule (FR-020, SC-004).
//
// ⚠ THIS CANNOT BE A UNIT TEST, because the guarantee is not in the code. It is
// `receipt_dispatch_auto_uq` — a PARTIAL unique index on (order_id) WHERE reason = 'order_paid'. A
// fake store would happily accept two inserts and prove nothing; only a real engine enforces the
// index, and only a real engine shows that the `customer_request` arm is deliberately NOT constrained.
//
// Gated behind -short like every other container test here (the platformstatus precedent), so
// `go test -short ./...` stays Docker-free.

func startPostgresForReceipts(t *testing.T) *pgxpool.Pool {
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

// receiptSchema stands up just what the dispatch rule touches — the subset of 052's migration under
// test. (The full migration is exercised by `make db-up`.)
func receiptSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	for _, stmt := range []string{
		`CREATE EXTENSION IF NOT EXISTS citext`,
		`CREATE TABLE "order" (id uuid PRIMARY KEY)`,
		`CREATE TABLE receipt_dispatch (
			id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			order_id     uuid NOT NULL REFERENCES "order" (id) ON DELETE CASCADE,
			reason       text NOT NULL CHECK (reason IN ('order_paid','customer_request')),
			recipient    citext NOT NULL,
			status       text NOT NULL DEFAULT 'pending'
			             CHECK (status IN ('pending','sent','failed','skipped')),
			attempts     int NOT NULL DEFAULT 0,
			last_error   text,
			message_id   text,
			created_at   timestamptz NOT NULL DEFAULT now(),
			processed_at timestamptz
		)`,
		`CREATE UNIQUE INDEX receipt_dispatch_auto_uq
		   ON receipt_dispatch (order_id) WHERE reason = 'order_paid'`,
	} {
		_, err := pool.Exec(ctx, stmt)
		require.NoError(t, err, stmt)
	}
}

const receiptOrderID = "11111111-1111-4111-8111-111111111111"

func seedReceiptOrder(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO "order" (id) VALUES ($1)`, receiptOrderID)
	require.NoError(t, err)
}

func countDispatches(t *testing.T, pool *pgxpool.Pool, reason string) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM receipt_dispatch WHERE order_id = $1 AND reason = $2`,
		receiptOrderID, reason).Scan(&n))
	return n
}

// The exact statement FinalizeSucceeded issues, so this test exercises the real thing rather than a
// paraphrase of it.
const enqueueAuto = `
INSERT INTO receipt_dispatch (order_id, reason, recipient)
VALUES ($1, 'order_paid', $2)
ON CONFLICT DO NOTHING`

// ⚠ SC-004. Re-delivering the paid fact — a retried Stripe webhook, a replayed confirm — must not
// send a second receipt. The database refuses it; the code does not have to remember to.
func TestReceiptDispatch_TheAutomaticSendIsExactlyOnce(t *testing.T) {
	pool := startPostgresForReceipts(t)
	receiptSchema(t, pool)
	seedReceiptOrder(t, pool)
	ctx := context.Background()

	for range 5 {
		_, err := pool.Exec(ctx, enqueueAuto, receiptOrderID, "shopper@example.com")
		require.NoError(t, err, "a repeat enqueue must be a silent no-op, not an error")
	}

	require.Equal(t, 1, countDispatches(t, pool, "order_paid"),
		"five paid-fact deliveries produced more than one receipt")
}

// ⚠ THE OTHER HALF, AND IT IS WHY THE INDEX IS PARTIAL. A resend is a LEGITIMATE second send. An
// unconditional UNIQUE(order_id) would have made FR-027 unimplementable — the same trap that ruled
// out reusing `notification_request`, whose dedupe_key would forbid exactly this (research R2).
func TestReceiptDispatch_ResendsAreDeliberatelyUnconstrained(t *testing.T) {
	pool := startPostgresForReceipts(t)
	receiptSchema(t, pool)
	seedReceiptOrder(t, pool)
	ctx := context.Background()

	_, err := pool.Exec(ctx, enqueueAuto, receiptOrderID, "shopper@example.com")
	require.NoError(t, err)

	for range 3 {
		_, err := pool.Exec(ctx,
			`INSERT INTO receipt_dispatch (order_id, reason, recipient) VALUES ($1, 'customer_request', $2)`,
			receiptOrderID, "shopper@example.com")
		require.NoError(t, err, "a resend must be representable")
	}

	require.Equal(t, 1, countDispatches(t, pool, "order_paid"))
	require.Equal(t, 3, countDispatches(t, pool, "customer_request"))
}

// ⚠ THE NEGATIVE PROOF the quickstart asks for, run in code instead of by hand: without the index the
// duplicate lands. This is what makes the first test meaningful — otherwise it only shows that the
// path happened not to run twice.
func TestReceiptDispatch_WithoutTheIndexTheDuplicateLands(t *testing.T) {
	pool := startPostgresForReceipts(t)
	receiptSchema(t, pool)
	seedReceiptOrder(t, pool)
	ctx := context.Background()

	_, err := pool.Exec(ctx, `DROP INDEX receipt_dispatch_auto_uq`)
	require.NoError(t, err)

	for range 2 {
		_, err := pool.Exec(ctx, enqueueAuto, receiptOrderID, "shopper@example.com")
		require.NoError(t, err)
	}

	require.Equal(t, 2, countDispatches(t, pool, "order_paid"),
		"the index is what protects this, and dropping it must demonstrably break the guarantee")
}
