package metrics

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The 055 refund counters (T082).
//
// ⚠ THE LABEL NAME IS PART OF THE CONTRACT, AND GO WILL NOT CHECK IT FOR YOU. `WithLabelValues` is
// POSITIONAL: a counter declared with `outcome` and called with a stage value does not panic, does not
// error, and silently emits a series that every alert querying the declared name misses. 054 shipped
// exactly that. These tests pin the declaration and the call site against each other.

func source(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("metrics.go")
	if err != nil {
		t.Fatalf("read metrics.go: %v", err)
	}
	return string(b)
}

// declaredLabels finds the label list a metric was declared with.
func declaredLabels(t *testing.T, src, metricName string) []string {
	t.Helper()
	re := regexp.MustCompile(`Name: "` + metricName + `",[\s\S]*?\}, \[\]string\{([^}]*)\}`)
	m := re.FindStringSubmatch(src)
	if m == nil {
		t.Fatalf("could not find the declaration of %s", metricName)
	}
	var out []string
	for _, q := range regexp.MustCompile(`"([a-z_]+)"`).FindAllStringSubmatch(m[1], -1) {
		out = append(out, q[1])
	}
	return out
}

func TestRefundCounters_DeclareExactlyOneLabelEach(t *testing.T) {
	src := source(t)
	want := map[string]string{
		"effy_refunds_issued_total":         "kind",
		"effy_refund_outcomes_total":        "outcome",
		"effy_refund_submit_failures_total": "failure",
		"effy_orders_cancelled_total":       "actor",
	}
	for metric, label := range want {
		got := declaredLabels(t, src, metric)
		if len(got) != 1 || got[0] != label {
			t.Fatalf("%s declares %v, want exactly [%s]", metric, got, label)
		}
	}
}

// ⚠ EVERY COUNTER HAS A CALL SITE. A declared-but-never-incremented counter is worse than no counter:
// it reads as zero on a dashboard, which is indistinguishable from "this never happens".
func TestRefundCounters_EachHasACallSite(t *testing.T) {
	src := source(t)
	for _, method := range []string{
		"RefundIssued", "RefundSettled", "RefundSubmitFailed", "OrderCancelled",
	} {
		if !strings.Contains(src, "func (m *Metrics) "+method+"(") {
			t.Fatalf("%s is not declared", method)
		}
	}

	// The call sites live in the refunds feature; read them rather than trusting they exist.
	for file, methods := range map[string][]string{
		"../../features/refunds/service.go": {"RefundIssued", "RefundSubmitFailed"},
		"../../features/refunds/webhook.go": {"RefundSettled", "RefundIssued"},
		"../../features/refunds/cancel.go":  {"OrderCancelled", "RefundIssued"},
	} {
		b, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		for _, m := range methods {
			if !strings.Contains(string(b), "m."+m+"(") {
				t.Fatalf("%s has no call to %s", file, m)
			}
		}
	}
}

// ⚠ NO LABEL MAY CARRY AN ORDER ID, A CUSTOMER ID OR AN AMOUNT. A label is a time-series dimension:
// an order id mints one series per order — unbounded cardinality, a dead Prometheus — and an amount
// puts a customer's money in an endpoint that is scraped and stored.
func TestRefundCounters_CarryNoIdentifiersOrAmounts(t *testing.T) {
	src := source(t)
	for _, metric := range []string{
		"effy_refunds_issued_total", "effy_refund_outcomes_total",
		"effy_refund_submit_failures_total", "effy_orders_cancelled_total",
	} {
		for _, label := range declaredLabels(t, src, metric) {
			for _, banned := range []string{"id", "order", "customer", "sub", "amount", "email", "refund"} {
				if strings.Contains(label, banned) {
					t.Fatalf("%s declares label %q, which looks like %q", metric, label, banned)
				}
			}
		}
	}
}

// ⚠ A closed vocabulary per label, so a dashboard query cannot be written against a value that will
// never appear — and so a new value has to be added here deliberately.
func TestRefundCounters_LabelValuesAreAClosedSet(t *testing.T) {
	b, err := os.ReadFile("../../features/refunds/service.go")
	if err != nil {
		t.Fatalf("read service.go: %v", err)
	}
	src := string(b)
	// The submit-failure values are the two that decide whether a retry could ever help.
	for _, v := range []string{`RefundSubmitFailed("refused")`, `RefundSubmitFailed("ambiguous")`} {
		if !strings.Contains(src, v) {
			t.Fatalf("service.go is missing %s", v)
		}
	}
}
