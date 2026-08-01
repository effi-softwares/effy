// load-localities — operator CLI that loads the Australian locality reference data (spec 030).
//
// Run via `make load-localities ENV=dev`, which composes the DSN at invocation (never on argv, never
// echoed) exactly as `create-first-admin` does.
//
// ⚠ IDEMPOTENT BY DESIGN. It will be re-run on every dataset refresh and in every environment, so it
// upserts on the natural key rather than inserting. Re-running it changes nothing.
//
// ⚠ ALL-OR-NOTHING. If any row is malformed the load is refused before a single write — a
// partially-loaded locality table is one where some suburbs are silently unreachable and nothing says
// which. See internal/platform/localityload for the parsing rules.
//
// Why a command and not a migration: the SCHEMA is a migration (forward-only, part of the database's
// history), but the ROWS are reference data refreshed on an operations cadence. Shipping ~18k INSERTs
// in a migration would mean a new ~2MB forward-only file on every refresh, forever. A reference
// table's contents are not schema history. See specs/030-delivery-location-suburb/research.md R2.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/localityload"
)

// datasetPath is relative to the repo root; the make target runs this from apis/core-api.
const datasetPath = "../../db/reference/au-localities.csv"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "load-localities:", err)
		os.Exit(1)
	}
}

func run() error {
	path := datasetPath
	if p := os.Getenv("LOCALITY_DATASET"); p != "" {
		path = p
	}

	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		return fmt.Errorf("missing DB_DSN (use `make load-localities ENV=dev`)")
	}

	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("opening dataset %s: %w", path, err)
	}
	defer func() { _ = f.Close() }()

	// ⚠ Parse EVERYTHING before opening a transaction. A malformed dataset must cost nothing.
	rows, err := localityload.Parse(f)
	if err != nil {
		return err
	}
	fmt.Printf("load-localities: parsed %d localities from %s\n", len(rows), path)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := db.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connecting: %w", err)
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// One batch, one round trip's worth of pipelining — this runs from a laptop against Sydney RDS,
	// where ~18k individual statements would be ~18k round trips at ~135ms each.
	const upsert = `INSERT INTO public.locality (name, state, postcode)
	                VALUES ($1, $2, $3)
	                ON CONFLICT ON CONSTRAINT locality_triple_uq
	                DO UPDATE SET updated_at = now()`

	batch := &pgx.Batch{}
	for _, r := range rows {
		batch.Queue(upsert, r.Name, r.State, r.Postcode)
	}
	br := tx.SendBatch(ctx, batch)
	for i := range rows {
		if _, err := br.Exec(); err != nil {
			_ = br.Close()
			return fmt.Errorf("upserting %s %s %s: %w", rows[i].Name, rows[i].State, rows[i].Postcode, err)
		}
	}
	if err := br.Close(); err != nil {
		return fmt.Errorf("closing batch: %w", err)
	}

	var total int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM public.locality`).Scan(&total); err != nil {
		return fmt.Errorf("counting: %w", err)
	}

	// ⚠ The load is worthless if the Northern Territory did not survive it. NT postcodes begin 08xx,
	// and every pipeline that treats the column as a number destroys them. Checking here means the
	// operator learns it now rather than from a shopper in Darwin.
	var ntCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM public.locality WHERE postcode LIKE '08%'`).Scan(&ntCount); err != nil {
		return fmt.Errorf("checking leading-zero postcodes: %w", err)
	}
	if ntCount == 0 {
		return fmt.Errorf("refusing to commit: no postcodes beginning '08' were loaded — leading zeros were lost somewhere upstream and the Northern Territory would be unreachable by name")
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	fmt.Printf("load-localities: %d localities in public.locality (%d with a leading-zero postcode)\n", total, ntCount)
	return nil
}
