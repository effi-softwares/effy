// Repository layer: SQL only (ARCHITECTURE.md). The proving read consumes
// platform-owned data exclusively — the goose migration ledger (003's Migration
// Ledger) plus catalog functions — introducing zero product schema (research E2).
package platformstatus

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/services/core-api/internal/platform/db"
)

// qStatus reads everything in one round trip. version 0 is goose's baseline marker
// row, excluded from the applied count.
const qStatus = `
SELECT current_database()                                    AS database_name,
       now()                                                 AS database_time,
       COALESCE((SELECT MAX(version_id)
                   FROM goose_db_version
                  WHERE is_applied), 0)                      AS migration_version,
       (SELECT COUNT(*)
          FROM goose_db_version
         WHERE is_applied AND version_id > 0)                AS migrations_applied
`

// statusRow is the wire shape of qStatus; it never leaves this file (mapped
// explicitly to the domain model below).
type statusRow struct {
	DatabaseName      string    `db:"database_name"`
	DatabaseTime      time.Time `db:"database_time"`
	MigrationVersion  int64     `db:"migration_version"`
	MigrationsApplied int64     `db:"migrations_applied"`
}

type Repository struct {
	db db.DBTX
}

func NewRepository(dbtx db.DBTX) *Repository {
	return &Repository{db: dbtx}
}

func (r *Repository) Status(ctx context.Context) (PlatformStatus, error) {
	rows, err := r.db.Query(ctx, qStatus)
	if err != nil {
		return PlatformStatus{}, fmt.Errorf("platformstatus: query: %w", err)
	}

	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[statusRow])
	if err != nil {
		// Includes 42P01 when the goose ledger doesn't exist yet (003 db-up pending) —
		// the service maps this to an internal error; the cause lands in the log only.
		return PlatformStatus{}, fmt.Errorf("platformstatus: scan: %w", err)
	}

	return PlatformStatus{
		DatabaseName:      row.DatabaseName,
		DatabaseTime:      row.DatabaseTime.UTC(),
		MigrationVersion:  row.MigrationVersion,
		MigrationsApplied: row.MigrationsApplied,
	}, nil
}
