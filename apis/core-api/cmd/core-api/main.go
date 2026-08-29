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
	"github.com/effyshopping/effy/apis/core-api/internal/features/orders"
	"github.com/effyshopping/effy/apis/core-api/internal/features/platformstatus"
	"github.com/effyshopping/effy/apis/core-api/internal/features/refunds"
	"github.com/effyshopping/effy/apis/core-api/internal/features/saveditems"
	"github.com/effyshopping/effy/apis/core-api/internal/features/storefront"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/config"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
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
	// ⚠ 055: the SECOND pool this service verifies. Per-pool validation, pinned issuer — the shape
	// Principle IV sanctions, not the auth proxy it forbids (research R1).
	backOfficeVerifier *auth.PoolVerifier
	staffGate          *auth.StaffGate
	refunds            *refunds.Service
	cognito            *cognitoidentityprovider.Client

	// 019 commerce shared collaborators — constructed once, wired into each feature slice's
	// Register as the commerce features (storefront/cart/checkout/orders/saved items) land. Address
	// management moved to the cold path (edge-api/customer, 022); checkout reads the address table
	// directly for its order snapshot.
	pool     *pgxpool.Pool
	customer *customeridentity.Resolver
	presign  *media.Resolver
	payments *checkout.StripeGateway
	// 025: the storefront records up-front delivery answers by outcome. Carried on deps rather than
	// threaded through registerFeatures, so wiring stays one greppable line per feature.
	metrics *metrics.Metrics

	// Feature services (customer commerce).
	storefront *storefront.Service
	cart       *cart.Service
	savedItems *saveditems.Service
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
		cfg.AWS.Region, cfg.Auth.Customer.PoolID, cfg.Auth.Customer.ClientIDs...)
	if err != nil {
		return err
	}

	// ⚠ 055: THE SECOND POOL THIS SERVICE VERIFIES, and the first that is not the customer.
	//
	// Refunds are issued here because the payment secret lives here and nowhere else (019 SC-012).
	// This is per-pool validation against the back-office pool's own issuer and client ids — the shape
	// Principle IV sanctions — and NOT the auth proxy it forbids. The rejected alternative was the
	// cold path forwarding an operator's token to this service, which is brokering by definition
	// (research R1).
	//
	// Fail-closed like its sibling: a misconfigured pool aborts boot rather than mounting the admin
	// routes unauthenticated. ⚠ That matters more here than anywhere else on the platform — these are
	// the routes that move money.
	backOfficeVerifier, err := auth.NewPoolVerifier(ctx, auth.AudienceBackOffice,
		cfg.AWS.Region, cfg.Auth.BackOffice.PoolID, cfg.Auth.BackOffice.ClientIDs...)
	if err != nil {
		return err
	}

	m := metrics.New()
	m.RegisterPoolStats(pool)

	// 019 commerce shared collaborators, built once (research R2/R3/R7).
	presign := media.NewResolver(s3.NewFromConfig(awsCfg), cfg.AWS.MediaBucket)
	paymentGateway := checkout.NewStripeGateway(cfg.Stripe.SecretKey, cfg.Stripe.WebhookSecret)

	// 027: checkout re-computes the promotional discount through the cart service, so the two can never
	// disagree about what a code is worth. Built before deps so both can reference it.
	// 054: the stock telemetry sink. `m` satisfies both services' one-method interfaces — a metric
	// that is declared but never wired reads as coverage and is worth nothing (the analysis pass
	// found exactly that in this feature's first draft).
	cartSvc := cart.NewService(cart.NewRepository(pool), presign, cartpolicy.NewStore(pool)).WithStockMetrics(m)

	// ⚠ Constructed BEFORE the dependency literal because checkout needs it: the refund half of the
	// provider's webhook rides the ONE signature-verified endpoint (055 US4), and `refunds` imports
	// `checkout` for the gateway, so the wiring can only go this direction.
	refundSvc := refunds.NewService(refunds.NewRepository(pool), paymentGateway).WithMetrics(m)

	deps := dependencies{
		status:           platformstatus.NewService(platformstatus.NewRepository(pool), cfg.Env),
		customerVerifier: customerVerifier,
		// 055: refunds are issued here because the payment secret is here (research R1).
		backOfficeVerifier: backOfficeVerifier,
		staffGate:          auth.NewStaffGate(pool),
		refunds:            refundSvc,
		cognito:            cognitoidentityprovider.NewFromConfig(awsCfg),

		// 019 commerce shared collaborators (research R2/R3/R7).
		pool:     pool,
		customer: customeridentity.NewResolver(pool),
		presign:  presign,
		payments: paymentGateway,
		metrics:  m,

		storefront: storefront.NewService(storefront.NewRepository(pool), presign),
		cart:       cartSvc,
		savedItems: saveditems.NewService(saveditems.NewRepository(pool), presign).
			WithCart(savedCartAdder{cartSvc}),
		checkout: checkout.NewService(checkout.NewStore(pool), paymentGateway, cfg.Stripe.PublishableKey).WithOrderPolicy(cartpolicy.NewStore(pool)).WithPromotions(cartSvc).WithDelivery(delivery.NewQuoter(pool)).WithDeliveryMetrics(m).WithStockMetrics(m).WithRefundEvents(refundSvc),
		orders:   orders.NewService(orders.NewRepository(pool), presign),
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
	storefront.Register(v1, storefront.NewHandler(deps.storefront), storefront.NewDeliveryReads(deps.pool, deps.metrics))
	cart.Register(v1, deps.customerVerifier, deps.customer, cart.NewHandler(deps.cart))
	orders.Register(v1, deps.customerVerifier, deps.customer, orders.NewHandler(deps.orders))
	// 055 US2 — the customer's own cancel control, mounted on the SAME customer-scoped group the order
	// reads use, so it inherits the pool verifier and the identity resolution rather than repeating them.
	refunds.RegisterCustomer(
		v1.Group("/orders", auth.Middleware(deps.customerVerifier), customeridentity.Middleware(deps.customer)),
		refunds.NewHandler(deps.refunds, deps.staffGate))
	saveditems.Register(v1, deps.customerVerifier, deps.customer, saveditems.NewHandler(deps.savedItems))
	checkout.Register(v1, deps.customerVerifier, deps.customer, checkout.NewHandler(deps.checkout))

	// 055 refunds. ⚠ The ONLY route group on this service that is not the customer pool. It is here,
	// rather than on the cold path, because the payment secret lives here and nowhere else
	// (019 SC-012) — see research R1 for why the alternatives were rejected.
	refunds.RegisterAdmin(v1, deps.backOfficeVerifier,
		refunds.NewHandler(deps.refunds, deps.staffGate))
}

// savedCartAdder adapts the cart service to saved-items' narrow CartAdder seam.
//
// ⚠ The adapter exists so `saveditems` depends on ONE method rather than the whole cart service. A
// wider dependency would let it start making cart decisions that belong to the cart — and the cart's
// own rules (limits, availability, order policy) must stay the cart's to enforce.
type savedCartAdder struct{ svc *cart.Service }

func (a savedCartAdder) Add(ctx context.Context, customerID, productID, changeID string, qty int) error {
	_, err := a.svc.Add(ctx, customerID, productID, changeID, qty)
	return err
}
