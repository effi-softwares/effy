// delete-admin — operator CLI that COMPLETELY deletes a back-office admin account (spec 006 US4).
// Removes the account from both the identity provider and the platform record. No API, no UI.
// Run via `make delete-admin` (confirm-gated; FORCE=1 overrides the last-admin guard). Idempotent.
package main

import (
	"context"
	"encoding/json"
	"errors"
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
		fmt.Fprintln(os.Stderr, "delete-admin:", err)
		if errors.Is(err, adminbootstrap.ErrLastAdmin) {
			fmt.Fprintln(os.Stderr, "  (this is the platform's last administrator — deleting it would lock everyone out)")
		}
		os.Exit(1)
	}
}

func run() error {
	var email string
	var force bool
	fs := flag.NewFlagSet("delete-admin", flag.ContinueOnError)
	fs.StringVar(&email, "email", "", "the admin email to delete (required)")
	fs.BoolVar(&force, "force", false, "override the last-admin guard")
	if err := fs.Parse(os.Args[1:]); err != nil {
		return err
	}
	if email == "" {
		return fmt.Errorf("missing required --email")
	}

	poolID := os.Getenv("BACK_OFFICE_POOL_ID")
	dsn := os.Getenv("DB_DSN")
	region := os.Getenv("AWS_REGION")
	env := os.Getenv("EFFY_ENV")
	if poolID == "" || dsn == "" || region == "" {
		return fmt.Errorf("missing required env: BACK_OFFICE_POOL_ID, DB_DSN, AWS_REGION must all be set (use `make delete-admin`)")
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

	res, err := adminbootstrap.Delete(ctx, idp, repo, email, force)
	if err != nil {
		return err
	}

	// Log carries the sub only — never email/DSN/token (Principle VII / FR-016 deletion trace).
	log.Info("admin teardown",
		zap.String("env", env),
		zap.String("sub", res.Subject),
		zap.String("cognito", res.Cognito),
		zap.String("staff", res.Staff),
	)

	out, err := json.MarshalIndent(res, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}
