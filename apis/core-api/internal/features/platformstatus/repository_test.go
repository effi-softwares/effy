package platformstatus

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// Repository tests run against real PostgreSQL 16 — with raw SQL and no ORM, mocks
// cannot catch SQL syntax, constraint, or scan errors (research B9). Gated behind
// -short so unit runs stay Docker-free: `go test -short ./...` skips this file.

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

// seedLedger mirrors goose's own table shape (the 003 Migration Ledger).
func seedLedger(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		CREATE TABLE goose_db_version (
			id         SERIAL PRIMARY KEY,
			version_id BIGINT NOT NULL,
			is_applied BOOLEAN NOT NULL,
			tstamp     TIMESTAMP DEFAULT now()
		)`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO goose_db_version (version_id, is_applied)
		VALUES (0, true), (20260705095817, true)`)
	require.NoError(t, err)
}

func TestRepositoryStatus(t *testing.T) {
	if testing.Short() {
		t.Skip("-short: container-backed repository test skipped")
	}
	pool := startPostgres(t)
	seedLedger(t, pool)

	repo := NewRepository(pool)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	status, err := repo.Status(ctx)
	require.NoError(t, err)

	assert.Equal(t, "effy", status.DatabaseName)
	assert.WithinDuration(t, time.Now().UTC(), status.DatabaseTime, time.Minute)
	assert.EqualValues(t, 20260705095817, status.MigrationVersion)
	// The version-0 baseline marker row is excluded from the applied count.
	assert.EqualValues(t, 1, status.MigrationsApplied)
}

func TestRepositoryStatusWithoutLedgerFailsLoudly(t *testing.T) {
	if testing.Short() {
		t.Skip("-short: container-backed repository test skipped")
	}
	pool := startPostgres(t)

	repo := NewRepository(pool)
	_, err := repo.Status(context.Background())

	// 003's first db-up not applied → recorded behavior: a named, wrapped error
	// (the handler maps it to the uniform internal problem).
	require.Error(t, err)
	assert.Contains(t, err.Error(), "platformstatus")
}
