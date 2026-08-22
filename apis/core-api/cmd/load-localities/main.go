// load-localities — operator CLI that loads the Australian locality reference dataset into
// public.locality (spec 047). No API, no boot-time mutation (core-api must not seed on start). Idempotent
// upsert on the (name,state,postcode) triple, so re-running on a refresh is safe. Run via
// `make load-localities ENV=dev` (which composes the DSN at invocation; it is never on argv or echoed).
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "load-localities:", err)
		os.Exit(1)
	}
}

func run() error {
	var csvPath string
	fs := flag.NewFlagSet("load-localities", flag.ContinueOnError)
	fs.StringVar(&csvPath, "csv", "db/reference/au-localities.csv", "path to the au-localities CSV")
	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}

	dsn := os.Getenv("DB_DSN")
	env := os.Getenv("EFFY_ENV")
	if dsn == "" {
		return fmt.Errorf("missing required env: DB_DSN must be set (use `make load-localities`)")
	}

	ctx := context.Background()

	log, err := logger.New("info", env)
	if err != nil {
		return err
	}
	defer func() { _ = log.Sync() }()

	f, err := os.Open(csvPath)
	if err != nil {
		return fmt.Errorf("open %s: %w", csvPath, err)
	}
	defer func() { _ = f.Close() }()

	pool, err := db.New(ctx, dsn)
	if err != nil {
		return err
	}
	defer pool.Close()

	res, err := delivery.LoadLocalities(ctx, pool, f)
	if err != nil {
		return err
	}

	log.Info("load-localities complete",
		zap.Int("read", res.Read), zap.Int("upserted", res.Upserted), zap.String("csv", csvPath))
	fmt.Printf("load-localities: read %d, upserted %d from %s\n", res.Read, res.Upserted, csvPath)
	return nil
}
