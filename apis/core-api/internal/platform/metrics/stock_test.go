package metrics

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

// ⚠ THIS FILE EXISTS BECAUSE OF A BUG IT CAUGHT WHILE BEING WRITTEN, and the bug is subtler than it
// first looks.
//
// `effy_stock_blocked_total` was declared with the label `outcome` (copy-pasted from its sibling) and
// called with `stage`. Prometheus does NOT panic on that: `WithLabelValues` is POSITIONAL, so one
// value for one label is perfectly legal. It simply emits `effy_stock_blocked_total{outcome="add"}`,
// and every alert and dashboard querying `{stage="add"}` matches nothing — silently, forever.
//
// A metric that exists, increments, and is invisible to the thing watching it is worse than no
// metric, because it reads as coverage. So this pins the label NAMES per metric, not just their
// cardinality. The analysis pass on this feature found the opposite failure too — three metrics
// declared and never incremented anywhere — which reads as coverage and is worth exactly as little.

func TestStockCountersAreCallableWithTheLabelsTheCodeActuallyUses(t *testing.T) {
	m := New()

	// The exact call sites: cart.Add / checkout intent / FinalizeSucceeded.
	m.StockBlocked("add")
	m.StockBlocked("checkout")
	m.StockDeducted("full")
	m.StockDeducted("partial")

	if got := testutil.ToFloat64(m.stockBlocked.WithLabelValues("add")); got != 1 {
		t.Errorf("stock_blocked{stage=add} = %v, want 1", got)
	}
	if got := testutil.ToFloat64(m.stockDeducted.WithLabelValues("partial")); got != 1 {
		t.Errorf("stock_deducted{outcome=partial} = %v, want 1", got)
	}
}

// ⚠ Principle VII: labels must stay LOW-CARDINALITY, and here that is also a disclosure rule. A
// product id would make the series unbounded; a shop id would put shop identity into a metrics store,
// which FR-015 forbids everywhere else on the platform.
func TestEachStockMetricCarriesExactlyItsOwnLabelName(t *testing.T) {
	// ⚠ PER METRIC, not a shared allow-list. An allow-list of {outcome, stage} passes happily when the
	// two are swapped — which is exactly the defect this file was written after hitting.
	want := map[string]string{
		"effy_stock_deducted_total": "outcome",
		"effy_stock_blocked_total":  "stage",
	}

	m := New()
	m.StockBlocked("add")
	m.StockDeducted("full")

	families, err := m.registry.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	seen := map[string]bool{}
	for _, f := range families {
		expected, tracked := want[f.GetName()]
		if !tracked {
			continue
		}
		seen[f.GetName()] = true
		for _, metric := range f.GetMetric() {
			labels := metric.GetLabel()
			if len(labels) != 1 {
				t.Errorf("%s has %d labels, want exactly 1 — a product or shop id here would make the "+
					"series unbounded AND put shop identity in a metrics store (FR-015)",
					f.GetName(), len(labels))
				continue
			}
			if got := labels[0].GetName(); got != expected {
				t.Errorf("%s is labelled %q, want %q — every alert and dashboard querying %q would "+
					"match nothing, silently", f.GetName(), got, expected, expected)
			}
		}
	}
	for name := range want {
		if !seen[name] {
			t.Errorf("%s never reached the registry", name)
		}
	}
}

// The counters must be REGISTERED, not merely constructed: an unregistered metric increments happily
// and never appears on /metrics, so the alert that watches it stays silent forever.
func TestStockCountersAreExposedOnTheRegistry(t *testing.T) {
	m := New()
	m.StockDeducted("partial")
	m.StockBlocked("checkout")

	families, err := m.registry.Gather()
	if err != nil {
		t.Fatalf("gather: %v", err)
	}
	seen := map[string]bool{}
	for _, f := range families {
		seen[f.GetName()] = true
	}
	for _, want := range []string{"effy_stock_deducted_total", "effy_stock_blocked_total"} {
		if !seen[want] {
			t.Errorf("%s is not exposed on /metrics — the alert watching it would never fire", want)
		}
	}
}
