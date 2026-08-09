// Package config loads the service configuration from the environment, exactly once,
// at startup. Fail-fast: a missing required value aborts boot with the variable named
// (spec FR-007). godotenv is a local-dev convenience only — containers get real env.
package config

import (
	"fmt"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	Env  string `env:"EFFY_ENV,required,notEmpty"`
	Port int    `env:"PORT" envDefault:"8080"`

	DB     DB     `envPrefix:"DB_"`
	AWS    AWS    `envPrefix:"AWS_"`
	Auth   Auth   `envPrefix:"AUTH_"`
	CORS   CORS   `envPrefix:"CORS_"`
	Log    Log    `envPrefix:"LOG_"`
	Stripe Stripe `envPrefix:"STRIPE_"`

	// 042 US3 — the storefront-control secret, used to verify preview tokens minted by the back
	// office. ⚠ OPTIONAL, unlike Stripe's: an environment without it simply has no preview, and
	// `verifyPreviewToken` refuses every token. Making it required would mean a missing secret takes
	// the whole hot path down over a feature nobody is using at that moment.
	PreviewSecret string `env:"PREVIEW_SECRET"`

	Server Server
}

type DB struct {
	// libpq keyword-format DSN. Two delivery modes, checked in this order:
	//   1. DB_DSN set (the local `make core-run` loop composes it from the contract and
	//      injects it) → used verbatim.
	//   2. DB_DSN empty (the cloud/Fargate path, 040) → composed in Load() from the parts
	//      below, so the password can arrive as an injected ECS secret while host/port/name/
	//      user arrive as plain task-def env. A missing part fails boot with the var named.
	// Never logged, never written to disk (002/003 discipline).
	DSN string `env:"DSN"`

	// Parts used ONLY when DSN is empty. Optional at parse time (the DSN path leaves them
	// unset); Load() enforces their presence when it must compose. DB_PASSWORD is a secret
	// and is treated as one — it is never echoed, including in the missing-parts error.
	Host     string `env:"HOST"`
	Port     string `env:"PORT"`
	Name     string `env:"NAME"`
	User     string `env:"USER"`
	Password string `env:"PASSWORD"`
}

type AWS struct {
	Region string `env:"REGION,required,notEmpty"`
	// MediaBucket is the private product-media bucket (016) core-api mints presigned
	// GET URLs from. Read from SSM /effy/<env>/media/bucket at invocation (research R7).
	MediaBucket string `env:"MEDIA_BUCKET,required,notEmpty"`
}

// Stripe carries the payment provider's server-side secrets. Both are REQUIRED so the
// commerce routes never boot without a working payment path (fail-closed); neither ever
// leaves core-api or is logged (research R3, SC-012). Test-mode values in dev
// (sk_test_… / whsec_…).
type Stripe struct {
	SecretKey     string `env:"SECRET_KEY,required,notEmpty"`
	WebhookSecret string `env:"WEBHOOK_SECRET,required,notEmpty"`
	// PublishableKey is NOT a secret (a name); optional here because each client already carries its
	// own. When set, checkout echoes it in the intent response as a convenience.
	PublishableKey string `env:"PUBLISHABLE_KEY"`
}

// Auth carries one Pool per audience this service serves. A pool with routes mounted
// but no configuration must never boot open: required tags make startup fail-closed
// (constitution Principle IV; ARCHITECTURE.md reject-all rule).
type Auth struct {
	Customer Pool `envPrefix:"CUSTOMER_"`
	// driver / shop / back-office pools are added here (same shape, required tags)
	// by the first slice that mounts routes for those audiences.
}

type Pool struct {
	PoolID string `env:"POOL_ID,required,notEmpty"`
	/**
	 * Every app client on this pool whose tokens this service accepts, comma-separated.
	 *
	 * ⚠ A pool has MORE THAN ONE client: the customer pool has a web client and a mobile client (013), and
	 * their tokens are equally valid. This was a single value until 027, which made every customer-mobile
	 * call to core-api answer 401. The env var name is unchanged so a single-value deployment keeps working.
	 */
	ClientIDs []string `env:"CLIENT_ID,required,notEmpty" envSeparator:","`
}

type CORS struct {
	// Approved browser origins for this environment — configuration, not code.
	AllowedOrigins []string `env:"ALLOWED_ORIGINS,required,notEmpty" envSeparator:","`
}

type Log struct {
	Level string `env:"LEVEL" envDefault:"info"`
}

// Server timeouts are deliberate constants, not knobs (research B2).
type Server struct {
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownGrace     time.Duration
}

func Load() (Config, error) {
	// Ignore a missing .env — it exists only on developer machines.
	_ = godotenv.Load()

	cfg, err := env.ParseAs[Config]()
	if err != nil {
		// env/v11 error text names the offending variable; never echo values.
		return Config{}, fmt.Errorf("config: %w", err)
	}

	// Cloud path (040): no DB_DSN supplied → compose it from the parts so the password can
	// be an injected secret rather than a pre-composed string. DB_DSN, when set, always wins.
	if cfg.DB.DSN == "" {
		dsn, derr := composeDSN(cfg.DB)
		if derr != nil {
			return Config{}, derr
		}
		cfg.DB.DSN = dsn
	}

	cfg.Server = Server{
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		ShutdownGrace:     15 * time.Second,
	}
	return cfg, nil
}
