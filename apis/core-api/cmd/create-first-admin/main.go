// create-first-admin — operator CLI that establishes the FIRST back-office super-administrator
// out-of-band (spec 006). No API, no UI. Run via `make create-first-admin` (which composes the DSN
// + pool id at invocation — never on argv, never echoed). Idempotent / break-glass.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	cip "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/adminbootstrap"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "create-first-admin:", err)
		os.Exit(1)
	}
}

func run() error {
	var email, name string
	fs := flag.NewFlagSet("create-first-admin", flag.ContinueOnError)
	fs.StringVar(&email, "email", "", "the new admin's work email (required)")
	fs.StringVar(&name, "name", "", "the new admin's display name (required)")
	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}

	// Validate BEFORE any side effect (FR-005) — no partial state on bad input.
	in := adminbootstrap.Input{Email: email, Name: name}
	if err := in.Validate(); err != nil {
		return err
	}

	// Non-secret config via env (the make target injects these; secrets never on argv).
	poolID := os.Getenv("BACK_OFFICE_POOL_ID")
	dsn := os.Getenv("DB_DSN")
	region := os.Getenv("AWS_REGION")
	env := os.Getenv("EFFY_ENV")
	if poolID == "" || dsn == "" || region == "" {
		return fmt.Errorf("missing required env: BACK_OFFICE_POOL_ID, DB_DSN, AWS_REGION must all be set (use `make create-first-admin`)")
	}

	ctx := context.Background()

	log, err := logger.New("info", env)
	if err != nil {
		return err
	}
	defer func() { _ = log.Sync() }()

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return fmt.Errorf("aws config: %w", err)
	}
	idp := adminbootstrap.NewCognito(cip.NewFromConfig(awsCfg), poolID)

	pool, err := db.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("database: %w", err)
	}
	defer pool.Close()
	repo := adminbootstrap.NewRepo(pool)

	res, err := adminbootstrap.Run(ctx, idp, repo, in)
	if err != nil {
		return err
	}

	// Log carries the sub only — never email/name/DSN/password/token (Principle VII / FR-009).
	log.Info("first-admin bootstrap",
		zap.String("env", env),
		zap.String("sub", res.Subject),
		zap.String("cognito", res.Cognito),
		zap.String("staff", res.Staff),
	)

	// The result (with the operator's own email echoed back) goes to stdout for the operator.
	out, err := json.MarshalIndent(res, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}
