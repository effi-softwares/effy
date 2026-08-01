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
	//
	// ⚠ COALESCE on update (032): a refresh must never REPLACE a known coordinate with NULL. If a later
	// G-NAF release drops a locality's point, the place does not move — losing the coordinate would
	// silently reprice every order to that postcode at the furthest band.
	const upsert = `INSERT INTO public.locality (name, state, postcode, latitude, longitude)
	                VALUES ($1, $2, $3, $4, $5)
	                ON CONFLICT ON CONSTRAINT locality_triple_uq
	                DO UPDATE SET latitude  = COALESCE(EXCLUDED.latitude,  public.locality.latitude),
	                              longitude = COALESCE(EXCLUDED.longitude, public.locality.longitude),
	                              updated_at = now()`

	batch := &pgx.Batch{}
	for _, r := range rows {
		// ⚠ r.Lat/r.Lon are *float64 and a nil pointer becomes SQL NULL — which is the point. A
		// float64 zero-value here would write 0,0 (the Gulf of Guinea) as a STATED location.
		batch.Queue(upsert, r.Name, r.State, r.Postcode, r.Lat, r.Lon)
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

	// ── postcode_centroid (032) ──────────────────────────────────────────────────────────────────
	//
	// ⚠ DERIVED IN THE SAME TRANSACTION as the localities it derives from, so the two can never
	// disagree. A view would have recomputed a mean over ~15 400 rows on EVERY QUOTE, inside the
	// checkout path where a Sydney round trip already costs ~135ms (029 measured 8 serial queries at
	// 1.08s and 503'd the storefront).
	//
	// ⚠ Rebuilt wholesale, not upserted. A postcode whose last coordinate-bearing locality disappears
	// must LOSE its centroid rather than keep a stale one — an out-of-date location is worse than a
	// missing one, because a missing one is handled explicitly (furthest band) and a stale one is
	// simply believed.
	if _, err := tx.Exec(ctx, `DELETE FROM public.postcode_centroid`); err != nil {
		return fmt.Errorf("clearing postcode_centroid: %w", err)
	}
	const centroids = `
		INSERT INTO public.postcode_centroid (postcode, latitude, longitude, locality_count, computed_at)
		SELECT postcode,
		       round(avg(latitude)::numeric, 6),
		       round(avg(longitude)::numeric, 6),
		       count(*),
		       now()
		FROM public.locality
		WHERE latitude IS NOT NULL AND longitude IS NOT NULL
		GROUP BY postcode`
	if _, err := tx.Exec(ctx, centroids); err != nil {
		return fmt.Errorf("computing postcode_centroid: %w", err)
	}

	var centroidCount, widest int
	var widestPostcode string
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM public.postcode_centroid`).Scan(&centroidCount); err != nil {
		return fmt.Errorf("counting centroids: %w", err)
	}

	// ⚠ THE COORDINATE CANARY, the exact counterpart of the NT one above. If the coordinate columns
	// went missing — a pre-032 CSV, a renamed header, a botched regeneration — every locality would
	// load with a NULL point, this table would come out EMPTY, and the load would otherwise report
	// complete success. Every postcode in the country would then price at the furthest band and every
	// same-day approval screen would read "no location on record", with nothing saying why.
	if centroidCount == 0 {
		return fmt.Errorf("refusing to commit: postcode_centroid is empty — the dataset carried no coordinates, so every postcode would price at the furthest band and no same-day distance could be shown (regenerate with `make derive-localities`)")
	}

	// Not a refusal: honest reporting. ⚠ 0872 spans NT, SA and WA — its centroid is a point in the
	// desert hundreds of kilometres from most of what it covers. The number is printed so an operator
	// can see that such postcodes exist rather than discovering it from a strange approval screen.
	if err := tx.QueryRow(ctx,
		`SELECT postcode, locality_count FROM public.postcode_centroid ORDER BY locality_count DESC, postcode LIMIT 1`,
	).Scan(&widestPostcode, &widest); err != nil {
		return fmt.Errorf("inspecting widest centroid: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	fmt.Printf("load-localities: %d localities in public.locality (%d with a leading-zero postcode)\n", total, ntCount)
	fmt.Printf("load-localities: %d postcode centroids (widest: %s averages %d localities)\n", centroidCount, widestPostcode, widest)
	if widest >= 20 {
		fmt.Printf("⚠ %s averages %d localities — a centroid over that many places is a rough basis for distance; see specs/032-delivery-pricing/research.md R1b\n", widestPostcode, widest)
	}
	return nil
}
