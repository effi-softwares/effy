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
	}

	m.registry.MustRegister(
		m.requests,
		m.duration,
		m.serviceabilityChecks,
		m.deliveryQuotes,
		m.deliveryQuoteFailure,
		m.stockDeducted,
		m.stockBlocked,
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
