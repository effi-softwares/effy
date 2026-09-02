// Package metrics owns the Prometheus RED instrumentation and the /metrics endpoint
// (constitution Principle VII). Hand-rolled over the official client on a custom
// registry — no third-party Gin middleware (research B4).
//
// Cardinality rule: the `route` label is always the Gin route TEMPLATE
// (e.g. /v1/products/:id), never the raw path; unmatched requests share one sentinel.
package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry *prometheus.Registry
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec

	// 047 delivery. ⚠ Labels are deliberately LOW-CARDINALITY and carry NO PII: `serviced` is a boolean
	// string and the quote/outcome labels are a small closed set — never a postcode, suburb or coordinate
	// (Principle VII; research R12).
	serviceabilityChecks *prometheus.CounterVec // labels: serviced ∈ {true,false}
	deliveryQuotes       *prometheus.CounterVec // labels: outcome ∈ {same_day_and_standard,standard_only,unserviced}
	deliveryQuoteFailure prometheus.Counter     // the invariant alarm: a served zone that failed to price

	// 054 stock. ⚠ Labels are a small closed set — never a product id or a shop id, which would make
	// the series unbounded AND disclose shop identity into a metrics store (Principle VII, FR-015).
	stockDeducted *prometheus.CounterVec // labels: outcome ∈ {full,partial}
	stockBlocked  *prometheus.CounterVec // labels: stage   ∈ {add,checkout}

	// 055 — refunds and cancellation (research R9). ⚠ THE LABEL NAME IS PART OF THE CONTRACT: 054
	// declared one of the counters above with `outcome` and called it with `stage`, which does NOT
	// panic — `WithLabelValues` is positional — it silently emits a series every alert querying the
	// declared name misses. `metrics_test.go` pins the name per metric.
	refundsIssued    *prometheus.CounterVec // labels: kind    ∈ {item,goodwill,cancellation,external}
	refundOutcomes   *prometheus.CounterVec // labels: outcome ∈ {succeeded,failed,refused}
	refundSubmitFail *prometheus.CounterVec // labels: failure ∈ {ambiguous,refused}
	shopRefundDenied *prometheus.CounterVec // labels: reason ∈ {not_permitted,not_your_lines,unavailable}
	ordersCancelled  *prometheus.CounterVec // labels: actor   ∈ {customer,back_office}
}

func New() *Metrics {
	m := &Metrics{
		registry: prometheus.NewRegistry(),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "HTTP requests handled, by method, route template and status.",
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency, by method, route template and status.",
			Buckets: prometheus.DefBuckets,
		}, []string{"method", "route", "status"}),
		serviceabilityChecks: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "delivery_serviceability_checks_total",
			Help: "Serviceability checks, by outcome. NO postcode label (PII/cardinality).",
		}, []string{"serviced"}),
		deliveryQuotes: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "delivery_quotes_total",
			Help: "Delivery quotes, by outcome (same_day_and_standard | standard_only | unserviced).",
		}, []string{"outcome"}),
		deliveryQuoteFailure: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "delivery_quote_failures_total",
			Help: "⚠ INVARIANT ALARM: a served zone that failed to produce a fee. Must stay at 0 (FR-029).",
		}),
		stockDeducted: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_stock_deducted_total",
			Help: "⚠ Paid orders that reduced stock. outcome=partial IS AN OVERSELL — a customer was " +
				"charged for units that did not exist (054 FR-022). NO product/shop label.",
		}, []string{"outcome"}),
		stockBlocked: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_stock_blocked_total",
			Help: "Purchases stopped by stock, by stage (add | checkout). A RISING count is the " +
				"feature working, not a fault (054 FR-016/FR-018).",
		}, []string{"stage"}),

		// ⚠ NO ORDER ID, CUSTOMER ID OR AMOUNT ON ANY LABEL. A label is a time-series dimension:
		// an order id would mint one series per order (unbounded cardinality, a dead Prometheus) and
		// an amount would put a customer's money in a metrics endpoint.
		refundsIssued: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_refunds_issued_total",
			Help: "Refunds SUBMITTED to the provider, by kind. ⚠ Submitted is not settled — see " +
				"effy_refund_outcomes_total for what actually happened (055 FR-007).",
		}, []string{"kind"}),
		refundOutcomes: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_refund_outcomes_total",
			Help: "How refunds SETTLED, by outcome. A sustained `failed` rate means money is not " +
				"reaching customers and nobody outside this metric would know (055 US4).",
		}, []string{"outcome"}),
		refundSubmitFail: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_refund_submit_failures_total",
			Help: "Submissions the provider did not accept, by failure kind. `ambiguous` may have " +
				"created a refund and is retried under the same key; `refused` is a decision (055 FR-005d).",
		}, []string{"failure"}),
		// ⚠ 057 — AUTHORIZATION refusals on the shop refund route, which no existing metric can see.
		//
		// The plan asked for a `core_api_shop_refund_failed` counter "feeding the same alert 055 built
		// for refund failures". That would have DOUBLE-COUNTED: a shop refund travels the identical
		// submit path as a back-office one, so its provider failures are already on
		// effy_refund_submit_failures_total. What is genuinely unmeasured is the half that never
		// reaches the provider — a non-manager, a suspended shop, or a request naming another shop's
		// lines. A sustained rise here is either a UI that offers a control it should not, or someone
		// probing which orders exist.
		shopRefundDenied: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_shop_refund_denied_total",
			Help: "Shop-initiated refunds refused BEFORE the provider was called, by reason. " +
				"Distinct from effy_refund_submit_failures_total, which counts provider outcomes (057 US5).",
		}, []string{"reason"}),
		ordersCancelled: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "effy_orders_cancelled_total",
			Help: "Orders cancelled, by who asked. ⚠ Cancelling IS refunding on this platform — the " +
				"money was captured at payment (055 research R3).",
		}, []string{"actor"}),
	}

	m.registry.MustRegister(
		m.requests,
		m.duration,
		m.serviceabilityChecks,
		m.deliveryQuotes,
		m.deliveryQuoteFailure,
		m.stockDeducted,
		m.stockBlocked,
		m.refundsIssued,
		m.refundOutcomes,
		m.refundSubmitFail,
		m.shopRefundDenied,
		m.ordersCancelled,
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	return m
}

// ServiceabilityChecked records one serviceability read by outcome (047). ⚠ NEVER pass a postcode.
func (m *Metrics) ServiceabilityChecked(serviced bool) {
	m.serviceabilityChecks.WithLabelValues(strconv.FormatBool(serviced)).Inc()
}

// DeliveryQuoted records one quote by outcome (047). `outcome` is a small closed set only.
func (m *Metrics) DeliveryQuoted(outcome string) {
	m.deliveryQuotes.WithLabelValues(outcome).Inc()
}

// DeliveryQuoteFailed records the invariant alarm — a served zone that could not be priced (FR-029). This
// must never fire; a non-zero value is a paging alert, not a metric to watch idly.
func (m *Metrics) DeliveryQuoteFailed() { m.deliveryQuoteFailure.Inc() }

// StockDeducted records one paid order's effect on stock (054).
//
// ⚠ `outcome="partial"` IS THE OVERSELL. It means a shopper paid for more units than the shop had —
// the exact harm this whole feature exists to prevent, arriving through the residual window between
// creating a payment and that payment succeeding (spec A6). A sustained non-zero rate is the alert in
// `infra/observability/alerts/054-product-inventory.yml`, and it should never be discovered from a
// support ticket.
func (m *Metrics) StockDeducted(outcome string) {
	m.stockDeducted.WithLabelValues(outcome).Inc()
}

// StockBlocked records one purchase stopped by stock, by stage (054).
//
// ⚠ A RISING COUNT HERE IS THE FEATURE WORKING. Each increment is one shopper who would previously
// have been charged in full for something that did not exist. It is the number that says whether
// shops are maintaining their counts at all.
func (m *Metrics) StockBlocked(stage string) {
	m.stockBlocked.WithLabelValues(stage).Inc()
}

// Middleware records the RED pair for every handled request.
// ── 055 refunds & cancellation ─────────────────────────────────────────────────────────────────
//
// ⚠ EACH TAKES THE LABEL IT DECLARES, AND THE TEST PINS THE PAIRING. 054 declared a counter with
// `outcome` and called it with `stage`: no panic, no error, just a series every alert misses.

// RefundIssued records one refund SUBMITTED to the provider. ⚠ Not settled — see RefundSettled.
func (m *Metrics) RefundIssued(kind string) { m.refundsIssued.WithLabelValues(kind).Inc() }

// RefundSettled records what the provider finally said. ⚠ This is the one that tells the truth about
// whether money reached a customer, up to thirty days after RefundIssued.
func (m *Metrics) RefundSettled(outcome string) { m.refundOutcomes.WithLabelValues(outcome).Inc() }

// RefundSubmitFailed records a submission the provider did not accept.
//
// ⚠ `ambiguous` and `refused` are separate because only one of them can be retried. Collapsing them
// would make a provider outage and a permanent refusal look the same on a dashboard.
func (m *Metrics) RefundSubmitFailed(failure string) {
	m.refundSubmitFail.WithLabelValues(failure).Inc()
}

// ShopRefundDenied records a shop refund refused before any money was considered (057 US5).
//
// ⚠ The REASON is recorded here but never returned to the caller — the HTTP refusal is uniform and
// says nothing about which term failed, or the route becomes a probe for which orders exist.
func (m *Metrics) ShopRefundDenied(reason string) { m.shopRefundDenied.WithLabelValues(reason).Inc() }

// OrderCancelled records one cancellation, by who asked for it.
func (m *Metrics) OrderCancelled(actor string) { m.ordersCancelled.WithLabelValues(actor).Inc() }

func (m *Metrics) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		status := strconv.Itoa(c.Writer.Status())

		m.requests.WithLabelValues(c.Request.Method, route, status).Inc()
		m.duration.WithLabelValues(c.Request.Method, route, status).Observe(time.Since(start).Seconds())
	}
}

// Handler serves the Prometheus exposition endpoint.
func (m *Metrics) Handler() gin.HandlerFunc {
	h := promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
	return gin.WrapH(h)
}

// RegisterPoolStats exposes pgx pool saturation (Principle VII: DB-pool visibility).
func (m *Metrics) RegisterPoolStats(pool *pgxpool.Pool) {
	m.registry.MustRegister(newPoolCollector(pool))
}

type poolCollector struct {
	pool *pgxpool.Pool

	total    *prometheus.Desc
	idle     *prometheus.Desc
	acquired *prometheus.Desc
	max      *prometheus.Desc
}

func newPoolCollector(pool *pgxpool.Pool) *poolCollector {
	return &poolCollector{
		pool:     pool,
		total:    prometheus.NewDesc("db_pool_connections_total", "Total connections in the pool.", nil, nil),
		idle:     prometheus.NewDesc("db_pool_connections_idle", "Idle connections in the pool.", nil, nil),
		acquired: prometheus.NewDesc("db_pool_connections_acquired", "Connections currently acquired.", nil, nil),
		max:      prometheus.NewDesc("db_pool_connections_max", "Configured MaxConns.", nil, nil),
	}
}

func (p *poolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- p.total
	ch <- p.idle
	ch <- p.acquired
	ch <- p.max
}

func (p *poolCollector) Collect(ch chan<- prometheus.Metric) {
	s := p.pool.Stat()
	ch <- prometheus.MustNewConstMetric(p.total, prometheus.GaugeValue, float64(s.TotalConns()))
	ch <- prometheus.MustNewConstMetric(p.idle, prometheus.GaugeValue, float64(s.IdleConns()))
	ch <- prometheus.MustNewConstMetric(p.acquired, prometheus.GaugeValue, float64(s.AcquiredConns()))
	ch <- prometheus.MustNewConstMetric(p.max, prometheus.GaugeValue, float64(s.MaxConns()))
}
