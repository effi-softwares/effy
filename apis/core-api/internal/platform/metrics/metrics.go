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
	registry       *prometheus.Registry
	requests       *prometheus.CounterVec
	duration       *prometheus.HistogramVec
	serviceability *prometheus.CounterVec
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
		// 025: how often the storefront answers "do we deliver to you?", and how it answered.
		//
		// ⚠ `serviced` is the ONLY label, and that is deliberate. `postcode` is the obvious thing to
		// attach and it would be two mistakes at once: unbounded cardinality (Principle VII requires
		// low-cardinality labels — one series per postcode would degrade the metrics backend), and
		// location data about an individual shopper in an operational metric. Two values are enough
		// to answer the question this metric exists for: what share of interested visitors are
		// outside a serviced zone?
		serviceability: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "storefront_serviceability_checks_total",
			Help: "Up-front delivery serviceability answers, by outcome.",
		}, []string{"serviced"}),
	}

	m.registry.MustRegister(
		m.requests,
		m.duration,
		m.serviceability,
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	return m
}

// RecordServiceability counts one up-front delivery answer. Malformed input is NOT counted — it was
// never a question about a real place.
func (m *Metrics) RecordServiceability(serviced bool) {
	m.serviceability.WithLabelValues(strconv.FormatBool(serviced)).Inc()
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
