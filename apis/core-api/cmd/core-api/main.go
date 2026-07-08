// core-api — Effy's hot path. All dependency wiring lives here, by hand, top-down:
// config → logger → pool → AWS clients → verifiers → features → server (constitution
// Principle VI: explicit, greppable wiring; no DI framework).
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/features/customerping"
	"github.com/effyshopping/effy/apis/core-api/internal/features/platformstatus"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/config"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/health"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/metrics"
)

func main() {
	if err := run(); err != nil {
		// Config errors name the missing variable (fail-fast, spec FR-007) and must
		// be visible even before the structured logger exists.
		fmt.Fprintln(os.Stderr, "core-api:", err)
		os.Exit(1)
	}
}

// dependencies is the explicit wiring graph handed to route registration. The Cognito
// SDK client is wired per the operator mandate; the first admin-provisioning slice
// starts calling it (JWT validation itself needs zero SDK calls — research D4).
type dependencies struct {
	status           *platformstatus.Service
	customerVerifier *auth.PoolVerifier
	cognito          *cognitoidentityprovider.Client
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	log, err := logger.New(cfg.Log.Level, cfg.Env)
	if err != nil {
		return err
	}
	defer func() { _ = log.Sync() }()

	pool, err := db.New(ctx, cfg.DB.DSN)
	if err != nil {
		return err
	}
	defer pool.Close()

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.AWS.Region))
	if err != nil {
		return fmt.Errorf("aws config: %w", err)
	}

	// Fail-closed: an unreachable/misconfigured pool aborts boot rather than mounting
	// its routes unauthenticated (Principle IV).
	customerVerifier, err := auth.NewPoolVerifier(ctx, auth.AudienceCustomer,
		cfg.AWS.Region, cfg.Auth.Customer.PoolID, cfg.Auth.Customer.ClientID)
	if err != nil {
		return err
	}

	m := metrics.New()
	m.RegisterPoolStats(pool)

	deps := dependencies{
		status:           platformstatus.NewService(platformstatus.NewRepository(pool), cfg.Env),
		customerVerifier: customerVerifier,
		cognito:          cognitoidentityprovider.NewFromConfig(awsCfg),
	}

	router := newRouter(cfg, log, pool, m, deps)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: cfg.Server.ReadHeaderTimeout,
		ReadTimeout:       cfg.Server.ReadTimeout,
		WriteTimeout:      cfg.Server.WriteTimeout,
		IdleTimeout:       cfg.Server.IdleTimeout,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	log.Info("core-api listening", zap.Int("port", cfg.Port))

	select {
	case err := <-serveErr:
		return fmt.Errorf("server: %w", err)
	case <-ctx.Done():
		stop() // a second signal now force-kills instead of waiting for the drain
	}

	log.Info("shutting down", zap.Duration("grace", cfg.Server.ShutdownGrace))
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownGrace)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("shutdown: %w", err)
	}
	return nil
}

// newRouter composes the middleware chain (binding order per ARCHITECTURE.md:
// request-ID → [metrics] → logging → recovery → CORS → per-pool auth on scoped
// groups) and mounts process endpoints, then the versioned API surface.
func newRouter(cfg config.Config, log *zap.Logger, pool *pgxpool.Pool, m *metrics.Metrics, deps dependencies) *gin.Engine {
	if cfg.Env != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(
		httpx.RequestIDMiddleware(),
		m.Middleware(),
		httpx.LoggingMiddleware(log),
		httpx.RecoveryMiddleware(),
		cors.New(cors.Config{
			AllowOrigins:  cfg.CORS.AllowedOrigins,
			AllowMethods:  []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowHeaders:  []string{"Authorization", "Content-Type", "X-Request-ID"},
			ExposeHeaders: []string{"X-Request-ID"},
			MaxAge:        12 * time.Hour,
		}),
	)

	// Unknown path OR never-existed API version (/v3/...) → uniform 404 problem;
	// retired versions get 410 per docs/api/versioning-policy.md when one ever exists.
	r.NoRoute(httpx.NotFound)
	r.HandleMethodNotAllowed = true
	r.NoMethod(httpx.MethodNotAllowed)

	// Process endpoints: deliberately unversioned and public (research B7).
	health.Register(r, pool)
	r.GET("/metrics", m.Handler())

	// The versioned API surface. Version groups are the ONLY place versions exist;
	// services/repositories below the handlers are version-neutral (research A3).
	v1 := r.Group("/v1")
	v2 := r.Group("/v2")
	registerFeatures(v1, v2, deps)

	return r
}

// registerFeatures mounts every feature slice — one line per feature, greppable.
func registerFeatures(v1, v2 *gin.RouterGroup, deps dependencies) {
	platformstatus.Register(v1, v2, platformstatus.NewHandler(deps.status))
	customerping.Register(v1, deps.customerVerifier)
}
