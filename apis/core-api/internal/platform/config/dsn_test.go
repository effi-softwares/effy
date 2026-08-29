package config

import (
	"strings"
	"testing"
)

// The exact shape infra/scripts/db-dsn.sh prints. If that script's format changes, this
// literal must change with it — the two are one contract (data-model.md § 2).
const wantShape = "host=db.example.com port=5432 dbname=effy user=effy_master password=s3cr3t sslmode=require connect_timeout=10"

func fullParts() DB {
	return DB{
		Host:     "db.example.com",
		Port:     "5432",
		Name:     "effy",
		User:     "effy_master",
		Password: "s3cr3t",
	}
}

func TestComposeDSN_MatchesDbDsnShellShape(t *testing.T) {
	got, err := composeDSN(fullParts())
	if err != nil {
		t.Fatalf("composeDSN returned error: %v", err)
	}
	if got != wantShape {
		t.Fatalf("composed DSN does not match db-dsn.sh shape:\n got: %q\nwant: %q", got, wantShape)
	}
}

func TestLoad_DSNOverridesParts(t *testing.T) {
	// When DB_DSN is present it wins verbatim, and the parts are ignored — the local
	// `make core-run` path must be unchanged.
	t.Setenv("EFFY_ENV", "dev")
	t.Setenv("AWS_REGION", "ap-southeast-2")
	t.Setenv("AWS_MEDIA_BUCKET", "effy-dev-product-media")
	t.Setenv("AUTH_CUSTOMER_POOL_ID", "pool-1")
	// 055: core-api now verifies a second pool (the back office), because refunds are issued here.
	t.Setenv("AUTH_BACK_OFFICE_POOL_ID", "pool-bo")
	t.Setenv("AUTH_BACK_OFFICE_CLIENT_ID", "client-bo")
	t.Setenv("AUTH_CUSTOMER_CLIENT_ID", "web,mobile")
	t.Setenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
	t.Setenv("STRIPE_SECRET_KEY", "sk_test_x")
	t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_x")

	explicit := "host=explicit port=1 dbname=d user=u password=p sslmode=require connect_timeout=10"
	t.Setenv("DB_DSN", explicit)
	// Parts that, if used, would produce a DIFFERENT string — proving they are ignored.
	t.Setenv("DB_HOST", "should-not-be-used")
	t.Setenv("DB_PORT", "9999")
	t.Setenv("DB_NAME", "nope")
	t.Setenv("DB_USER", "nope")
	t.Setenv("DB_PASSWORD", "nope")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.DB.DSN != explicit {
		t.Fatalf("DB_DSN was not used verbatim:\n got: %q\nwant: %q", cfg.DB.DSN, explicit)
	}
}

func TestComposeDSN_MissingPartErrorsAndNamesIt(t *testing.T) {
	cases := map[string]struct {
		mutate func(*DB)
		name   string
	}{
		"host":     {func(d *DB) { d.Host = "" }, "DB_HOST"},
		"port":     {func(d *DB) { d.Port = "" }, "DB_PORT"},
		"name":     {func(d *DB) { d.Name = "" }, "DB_NAME"},
		"user":     {func(d *DB) { d.User = "" }, "DB_USER"},
		"password": {func(d *DB) { d.Password = "" }, "DB_PASSWORD"},
	}
	for label, tc := range cases {
		t.Run(label, func(t *testing.T) {
			parts := fullParts()
			tc.mutate(&parts)
			_, err := composeDSN(parts)
			if err == nil {
				t.Fatalf("expected error when %s is missing, got nil", tc.name)
			}
			if !strings.Contains(err.Error(), tc.name) {
				t.Fatalf("error should name the missing variable %q, got: %v", tc.name, err)
			}
		})
	}
}

func TestComposeDSN_MissingPasswordDoesNotLeakOtherSecrets(t *testing.T) {
	// The error must name DB_PASSWORD (the variable) but never echo any part VALUE — the
	// composed string / password must not appear in a failure message.
	parts := fullParts()
	parts.Password = ""
	_, err := composeDSN(parts)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if strings.Contains(err.Error(), "s3cr3t") || strings.Contains(err.Error(), "password=") {
		t.Fatalf("error leaked a secret value: %v", err)
	}
}
