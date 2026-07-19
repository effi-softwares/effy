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

	Server Server
}

type DB struct {
	// libpq keyword-format DSN, composed at invocation from the platform contract
	// (002/003 discipline). Never logged, never written to disk.
	DSN string `env:"DSN,required,notEmpty"`
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
	PoolID   string `env:"POOL_ID,required,notEmpty"`
	ClientID string `env:"CLIENT_ID,required,notEmpty"`
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

	cfg.Server = Server{
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		ShutdownGrace:     15 * time.Second,
	}
	return cfg, nil
}
