package refunds

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
)

// The write gate, against the real `admin` schema (055 T026, FR-019/FR-021).
//
// ⚠ THIS CANNOT BE A UNIT TEST. The gate is one SQL predicate over three tables in a schema this
// service had never read until 055, and the only thing that can be wrong with it is the SQL. An
// earlier draft of `staffCanWrite` joined `admin.role` on `r.id = sr.role_id`; `admin.role` is keyed
// on a TEXT `key` and `staff_role` carries `role_key`. That draft compiled, would have deployed, and
// would have refused every staff member at runtime — a fake gate returning `true` proves none of it.
func TestStaffGate_OnlyAdminAndManagerMayMoveMoney(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()
	gate := auth.NewStaffGate(pool)

	seedStaff(t, pool, "sub-admin", "active", "admin")
	seedStaff(t, pool, "sub-manager", "active", "manager")
	seedStaff(t, pool, "sub-csa", "active", "csa")
	seedStaff(t, pool, "sub-roleless", "active")

	for _, tc := range []struct {
		sub   string
		allow bool
		why   string
	}{
		{"sub-admin", true, "an admin issues refunds"},
		{"sub-manager", true, "a manager issues refunds"},
		// ⚠ A csa READS every order — triage is their work, and 053 exists because they could not.
		// They do not move money: a refund is irreversible and a correction would be a new charge
		// the platform cannot make.
		{"sub-csa", false, "a csa may read every order and move no money"},
		{"sub-roleless", false, "active is not a role"},
		{"sub-nobody", false, "a valid token for someone with no record grants nothing"},
	} {
		ok, err := gate.CanWrite(ctx, tc.sub)
		require.NoError(t, err)
		require.Equal(t, tc.allow, ok, tc.why)
	}
}

// ⚠ THE RECORD IS AUTHORITATIVE, NOT THE TOKEN (Principle IV). A staff member who has been disabled
// still holds a perfectly valid token until it expires — nothing about the token changes when their
// access is revoked, so if the record were not consulted, revocation would not take effect until it
// expired on its own.
func TestStaffGate_ADisabledAdminIsRefusedDespiteAValidToken(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()
	gate := auth.NewStaffGate(pool)

	seedStaff(t, pool, "sub-was-admin", "active", "admin")
	ok, err := gate.CanWrite(ctx, "sub-was-admin")
	require.NoError(t, err)
	require.True(t, ok, "the fixture must start from a genuine yes, or the next assertion proves nothing")

	_, err = pool.Exec(ctx, `UPDATE admin.staff SET status = 'disabled' WHERE cognito_sub = $1`, "sub-was-admin")
	require.NoError(t, err)

	ok, err = gate.CanWrite(ctx, "sub-was-admin")
	require.NoError(t, err)
	require.False(t, ok, "a disabled admin keeps their token and loses their access")
}

// ⚠ FR-021 — THE REFUSAL CARRIES NO INFORMATION ABOUT THE ORDER. The gate is asked about a PERSON and
// nothing else: it takes no order id, so a refused caller learns nothing about which orders exist.
// A gate that consulted the order could be probed — refusing differently for a real order than for an
// invented one turns the refusal into an existence oracle.
func TestStaffGate_AsksAboutThePersonAndNeverTheOrder(t *testing.T) {
	pool := startPostgres(t)
	ctx := context.Background()
	gate := auth.NewStaffGate(pool)

	seedStaff(t, pool, "sub-csa", "active", "csa")

	first, err := gate.CanWrite(ctx, "sub-csa")
	require.NoError(t, err)
	second, err := gate.CanWrite(ctx, "sub-csa")
	require.NoError(t, err)
	require.False(t, first)
	require.Equal(t, first, second, "the answer depends on the person alone — it is the same every time")
}

func seedStaff(t *testing.T, pool *pgxpool.Pool, sub, status string, roles ...string) {
	t.Helper()
	ctx := context.Background()
	var id string
	err := pool.QueryRow(ctx,
		`INSERT INTO admin.staff (cognito_sub, email, name, status)
		 VALUES ($1, $1 || '@example.invalid', 'Test Staff', $2) RETURNING id`,
		sub, status).Scan(&id)
	require.NoError(t, err, "seed staff %s", sub)
	for _, r := range roles {
		_, err := pool.Exec(ctx,
			`INSERT INTO admin.staff_role (staff_id, role_key) VALUES ($1, $2)`, id, r)
		require.NoError(t, err, "seed role %s for %s", r, sub)
	}
}
