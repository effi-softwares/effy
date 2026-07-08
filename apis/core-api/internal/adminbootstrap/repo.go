package adminbootstrap

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repo writes the platform staff/role record (raw SQL, no ORM — Principle VI).
type Repo struct {
	pool *pgxpool.Pool
}

// NewRepo wires the repository to the pool.
func NewRepo(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool}
}

// UpsertSuperAdmin ensures an active admin.staff row keyed on the Cognito sub + an admin role
// grant, in one transaction. Idempotent: a re-run refreshes email/name, restores a disabled row to
// active (break-glass), and never duplicates. Returns "created" or "updated".
func (r *Repo) UpsertSuperAdmin(ctx context.Context, sub, email, name string) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	outcome := "created"
	var staffID string
	err = tx.QueryRow(ctx,
		`INSERT INTO admin.staff (cognito_sub, email, name, status)
              VALUES ($1, $2, $3, 'active')
         ON CONFLICT (cognito_sub) DO NOTHING
           RETURNING id::text`,
		sub, email, name,
	).Scan(&staffID)
	if errors.Is(err, pgx.ErrNoRows) {
		// Row already existed → update it (refresh + restore to active).
		outcome = "updated"
		err = tx.QueryRow(ctx,
			`UPDATE admin.staff
                SET email = $2, name = $3, status = 'active', updated_at = now()
              WHERE cognito_sub = $1
          RETURNING id::text`,
			sub, email, name,
		).Scan(&staffID)
	}
	if err != nil {
		return "", fmt.Errorf("upsert admin.staff: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO admin.staff_role (staff_id, role_key)
              VALUES ($1::uuid, 'admin')
         ON CONFLICT DO NOTHING`,
		staffID,
	); err != nil {
		return "", fmt.Errorf("grant admin role: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return outcome, nil
}

// IsLastActiveAdmin reports whether sub is an active admin AND there is no OTHER active admin — the
// last-admin guard (FR-014 / research G3). Deleting such an account would leave the platform with
// zero administrators.
func (r *Repo) IsLastActiveAdmin(ctx context.Context, sub string) (bool, error) {
	var last bool
	err := r.pool.QueryRow(ctx,
		`SELECT
		     EXISTS (SELECT 1 FROM admin.staff s JOIN admin.staff_role r ON r.staff_id = s.id
		              WHERE s.cognito_sub = $1 AND r.role_key = 'admin' AND s.status = 'active')
		 AND NOT EXISTS (SELECT 1 FROM admin.staff s JOIN admin.staff_role r ON r.staff_id = s.id
		              WHERE s.cognito_sub <> $1 AND r.role_key = 'admin' AND s.status = 'active')`,
		sub,
	).Scan(&last)
	if err != nil {
		return false, fmt.Errorf("last-active-admin check: %w", err)
	}
	return last, nil
}

// DeleteAdmin removes the staff row (its admin.staff_role grants cascade via the 005 FK). Keys on
// the sub; falls back to email when the sub is unknown (Cognito already gone). 0 rows → "not-found".
func (r *Repo) DeleteAdmin(ctx context.Context, sub, email string) (string, error) {
	var (
		tag pgconn.CommandTag
		err error
	)
	if sub != "" {
		tag, err = r.pool.Exec(ctx, `DELETE FROM admin.staff WHERE cognito_sub = $1`, sub)
	} else {
		tag, err = r.pool.Exec(ctx, `DELETE FROM admin.staff WHERE email = $1`, email)
	}
	if err != nil {
		return "", fmt.Errorf("delete admin.staff: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return "not-found", nil
	}
	return "deleted", nil
}
