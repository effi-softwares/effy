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
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/features/cart"
	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
	"github.com/effyshopping/effy/apis/core-api/internal/features/customerping"
	"github.com/effyshopping/effy/apis/core-api/internal/features/favorites"
	"github.com/effyshopping/effy/apis/core-api/internal/features/orders"
	"github.com/effyshopping/effy/apis/core-api/internal/features/platformstatus"
	"github.com/effyshopping/effy/apis/core-api/internal/features/storefront"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/config"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/health"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
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

	// 019 commerce shared collaborators — constructed once, wired into each feature slice's
	// Register as the commerce features (storefront/cart/checkout/orders/favorites) land. Address
	// management moved to the cold path (edge-api/customer, 022); checkout reads the address table
	// directly for its order snapshot.
	pool     *pgxpool.Pool
	customer *customeridentity.Resolver
	presign  *media.Resolver
	payments *checkout.StripeGateway

	// Feature services (customer commerce).
	storefront *storefront.Service
	cart       *cart.Service
	favorites  *favorites.Service
	checkout   *checkout.Service
	orders     *orders.Service
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

	// 019 commerce shared collaborators, built once (research R2/R3/R7).
	presign := media.NewResolver(s3.NewFromConfig(awsCfg), cfg.AWS.MediaBucket)
	paymentGateway := checkout.NewStripeGateway(cfg.Stripe.SecretKey, cfg.Stripe.WebhookSecret)

	deps := dependencies{
		status:           platformstatus.NewService(platformstatus.NewRepository(pool), cfg.Env),
		customerVerifier: customerVerifier,
		cognito:          cognitoidentityprovider.NewFromConfig(awsCfg),

		// 019 commerce shared collaborators (research R2/R3/R7).
		pool:     pool,
		customer: customeridentity.NewResolver(pool),
		presign:  presign,
		payments: paymentGateway,

		storefront: storefront.NewService(storefront.NewRepository(pool), presign),
		cart:       cart.NewService(cart.NewRepository(pool), presign),
		favorites:  favorites.NewService(favorites.NewRepository(pool), presign),
		checkout:   checkout.NewService(checkout.NewStore(pool), paymentGateway, cfg.Stripe.PublishableKey),
		orders:     orders.NewService(orders.NewRepository(pool)),
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

	// 019 customer commerce. Storefront reads are public; customer-scoped features mount behind
	// auth.Middleware + customeridentity.Middleware (the resolved customer id scopes every query).
	storefront.Register(v1, storefront.NewHandler(deps.storefront))
	cart.Register(v1, deps.customerVerifier, deps.customer, cart.NewHandler(deps.cart))
	favorites.Register(v1, deps.customerVerifier, deps.customer, favorites.NewHandler(deps.favorites))
	orders.Register(v1, deps.customerVerifier, deps.customer, orders.NewHandler(deps.orders))
	checkout.Register(v1, deps.customerVerifier, deps.customer, checkout.NewHandler(deps.checkout))
}
