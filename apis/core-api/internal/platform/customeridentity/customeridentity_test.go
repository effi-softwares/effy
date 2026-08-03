package customeridentity

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

// The hot path's access gate, against real PostgreSQL 16 — raw SQL and no ORM mean a mock cannot
// catch a column that does not exist or a scan that does not line up (research B9). Gated behind
// -short so unit runs stay Docker-free.
//
// ⚠ THIS FILE EXISTS BECAUSE OF 034, AND IT IS THE ONLY THING VERIFYING THAT FEATURE'S ONE
// SECURITY-CRITICAL BACKEND CHANGE.
//
// The account screens live on the COLD path, but commerce — cart, checkout, orders — is gated only
// by this resolver. A closure enforced in one place and not the other would leave a customer who has
// "deleted" their account still able to browse, fill a cart and place an order. Before this file,
// nothing in the feature compiled Go at all, let alone asserted the refusal.

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

// seedCustomers mirrors the columns this resolver actually selects. Deliberately minimal: if a
// future migration renames one of them, this fails loudly rather than silently resolving nothing.
func seedCustomers(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `
		CREATE TABLE public.customer (
			id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			cognito_sub   text NOT NULL UNIQUE,
			status        text NOT NULL DEFAULT 'active'
			                  CHECK (status IN ('active','barred')),
			closure_state text NOT NULL DEFAULT 'open'
			                  CHECK (closure_state IN ('open','closing'))
		)`)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO public.customer (cognito_sub, status, closure_state) VALUES
			('sub-active',  'active', 'open'),
			('sub-barred',  'barred', 'open'),
			('sub-closing', 'active', 'closing'),
			-- Barred AND closing. FR-049 makes this state reachable deliberately: a barred customer
			-- may still exercise their deletion right, so both facts can be true at once.
			('sub-both',    'barred', 'closing')`)
	require.NoError(t, err)
}

func TestResolve(t *testing.T) {
	if testing.Short() {
		t.Skip("-short: container-backed test skipped")
	}
	pool := startPostgres(t)
	seedCustomers(t, pool)

	r := NewResolver(pool)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	t.Run("an active, open customer is admitted", func(t *testing.T) {
		cust, err := r.Resolve(ctx, "sub-active")
		require.NoError(t, err)
		assert.NotEmpty(t, cust.ID)
		assert.Equal(t, "active", cust.Status)
		assert.Equal(t, "open", cust.ClosureState)
	})

	t.Run("a barred customer is refused", func(t *testing.T) {
		_, err := r.Resolve(ctx, "sub-barred")
		assert.ErrorIs(t, err, ErrBarred)
	})

	// ⚠ THE ONE THAT MATTERS. Revert the `closure_state == "closing"` branch in Resolve and this is
	// the test that fails — without it, a closed customer keeps full commerce access (034 FR-041).
	t.Run("a closing customer is refused on the hot path", func(t *testing.T) {
		_, err := r.Resolve(ctx, "sub-closing")
		assert.ErrorIs(t, err, ErrClosing,
			"a customer inside the closure grace window must not reach cart, checkout or orders")
	})

	// Ordering is asserted rather than left to chance: barring is a platform sanction and takes
	// precedence in the refusal, but BOTH refuse, so the customer is denied either way. The point is
	// that neither condition can mask the other into an admission.
	t.Run("barred and closing is still refused", func(t *testing.T) {
		_, err := r.Resolve(ctx, "sub-both")
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrBarred)
	})

	t.Run("an unknown subject is not found", func(t *testing.T) {
		_, err := r.Resolve(ctx, "sub-does-not-exist")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}
