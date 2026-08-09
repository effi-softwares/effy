// 042-storefront-home-composer — what the home layout measures about itself.
//
// ⚠ THIS FILE EXISTS BECAUSE FR-042 MAKES FAILURE LOOK LIKE SUCCESS. A block that cannot be rendered
// is dropped and the rest of the page is served: nothing errors, nothing 500s, the response is a
// perfectly valid 200. That is the right behaviour — a storefront missing one section beats a
// storefront that will not load — but it means a published layout can quietly lose a section and
// nobody, including the operator who published it, has any way to find out.
//
// Counting the omissions is the only thing that turns a silent success back into a signal.
package storefront

import "github.com/prometheus/client_golang/prometheus"

// LayoutMetrics is the storefront's layout instrumentation. Nil is a valid value and records nothing,
// so a Service built without metrics (every unit test, and any future caller) behaves identically —
// instrumentation must never be the reason a code path differs.
type LayoutMetrics struct {
	omitted *prometheus.CounterVec
	read    prometheus.Histogram
}

// NewLayoutMetrics builds the collectors. The caller registers them with the platform registry.
func NewLayoutMetrics() *LayoutMetrics {
	return &LayoutMetrics{
		// ⚠ LABELLED BY REASON ALONE — deliberately NOT by block type.
		//
		// The reason set is closed and three-valued. The TYPE is not: the whole point of
		// `unknown_type` is that the string came from a layout this build does not understand, which
		// makes it operator-supplied free text. Using it as a label would let one bad publish mint
		// unbounded time series in Prometheus, which is the cardinality rule the platform metrics
		// package states in its own header. The type is logged instead, where cardinality is free.
		omitted: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "storefront_home_blocks_omitted_total",
			Help: "Home layout blocks dropped before rendering, by omission reason.",
		}, []string{"reason"}),
		read: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "storefront_home_layout_read_seconds",
			Help:    "Time to read the published home layout from the database.",
			Buckets: prometheus.DefBuckets,
		}),
	}
}

// Collectors is what main.go hands to the registry.
func (l *LayoutMetrics) Collectors() []prometheus.Collector {
	if l == nil {
		return nil
	}
	return []prometheus.Collector{l.omitted, l.read}
}

func (l *LayoutMetrics) recordOmissions(omitted []LayoutOmission) {
	if l == nil {
		return
	}
	for _, o := range omitted {
		l.omitted.WithLabelValues(string(o.Reason)).Inc()
	}
}

func (l *LayoutMetrics) observeRead(seconds float64) {
	if l == nil {
		return
	}
	l.read.Observe(seconds)
}
