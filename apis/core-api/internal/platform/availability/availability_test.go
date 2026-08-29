package availability

import (
	"strings"
	"testing"
)

func ptr(n int) *int { return &n }

// The truth table is the specification. Every row states a shopper-visible fact, and the same table
// is run through BOTH forms of the rule below — that is what keeps the SQL and the Go from drifting
// apart, which is the entire reason this package exists.
var table = []struct {
	name        string
	status      string
	tracked     bool
	onHand      *int
	purchasable bool
	outOfStock  bool
}{
	// ── Untracked: identical to how every product behaved before 054 (FR-002, SC-006) ──
	{"active and untracked is purchasable, whatever the count column says", "active", false, nil, true, false},
	{"an untracked product with a stale count is still unlimited", "active", false, ptr(0), true, false},

	// ── Tracked ──
	{"active, tracked, in stock", "active", true, ptr(3), true, false},
	{"active, tracked, one left", "active", true, ptr(1), true, false},
	{"active, tracked, empty shelf", "active", true, ptr(0), false, true},

	// ── The operator's own switch still wins (A3) ──
	{"unavailable beats stock: the operator stopped selling it", "unavailable", true, ptr(9), false, false},
	{"draft is not sellable however much is on the shelf", "draft", true, ptr(9), false, false},
	{"archived is not sellable", "archived", true, ptr(9), false, false},
	{"unavailable and untracked", "unavailable", false, nil, false, false},

	// ── Fail-closed on a state the CHECK constraint makes unrepresentable ──
	{"tracked with no count is refused, not assumed available", "active", true, nil, false, true},
}

func TestPurchasable(t *testing.T) {
	for _, tc := range table {
		t.Run(tc.name, func(t *testing.T) {
			if got := Purchasable(tc.status, tc.tracked, tc.onHand); got != tc.purchasable {
				t.Errorf("Purchasable(%q, %v, %v) = %v, want %v", tc.status, tc.tracked, tc.onHand, got, tc.purchasable)
			}
		})
	}
}

// ⚠ FR-014/SC-010: "out of stock" and "no longer sold" must be different answers. A shopper can act
// on the first (wait) and not on the second (give up), so a boolean here would be a downgrade.
func TestOutOfStockIsNotTheSameAsNotSold(t *testing.T) {
	for _, tc := range table {
		t.Run(tc.name, func(t *testing.T) {
			if got := OutOfStock(tc.status, tc.tracked, tc.onHand); got != tc.outOfStock {
				t.Errorf("OutOfStock(%q, %v, %v) = %v, want %v", tc.status, tc.tracked, tc.onHand, got, tc.outOfStock)
			}
		})
	}

	// The pair that makes the point: same shopper-facing unavailability, different cause.
	if !OutOfStock("active", true, ptr(0)) {
		t.Error("an empty shelf on a live product IS out of stock")
	}
	if OutOfStock("archived", true, ptr(0)) {
		t.Error("a withdrawn product is NOT 'out of stock' — it is not coming back, and saying so would tell a shopper to wait for nothing")
	}
}

// The SQL and the Go are two renderings of one rule. Nothing can compile-check that, so this asserts
// the fragment mentions exactly the three columns the Go predicate reads, under the caller's alias —
// a column dropped from one side and not the other is caught here rather than in production.
func TestPredicateAndPurchasableReadTheSameColumns(t *testing.T) {
	sql := Predicate("p")
	for _, col := range []string{"p.status", "p.stock_tracked", "p.stock_on_hand"} {
		if !strings.Contains(sql, col) {
			t.Errorf("Predicate is missing %q; the Go twin reads it, so the two would disagree", col)
		}
	}
	if !strings.Contains(sql, "'"+StatusActive+"'") {
		t.Errorf("Predicate does not pin the active status constant")
	}
	for _, col := range []string{"status", "stock_tracked", "stock_on_hand"} {
		if !strings.Contains(Columns, col) {
			t.Errorf("Columns omits %q, so a caller could select too little and answer confidently wrong", col)
		}
	}
}

// ⚠ The untracked short-circuit must come first, or `stock_on_hand > 0` evaluates NULL for every
// untracked product, the AND goes three-valued, and the row silently vanishes from every listing.
// That would turn the whole catalogue invisible on deploy — the loudest possible version of SC-006
// failing, and the cheapest to prevent.
func TestPredicateShortCircuitsUntrackedBeforeReadingTheCount(t *testing.T) {
	sql := Predicate("p")
	notTracked := strings.Index(sql, "NOT p.stock_tracked")
	onHand := strings.Index(sql, "p.stock_on_hand")
	if notTracked < 0 || onHand < 0 || notTracked > onHand {
		t.Fatalf("`NOT p.stock_tracked` must precede `p.stock_on_hand` in: %s", sql)
	}
}

func TestPredicateRespectsTheAlias(t *testing.T) {
	if got := Predicate("prod"); strings.Contains(got, "p.status") || !strings.Contains(got, "prod.status") {
		t.Errorf("Predicate(%q) did not apply the alias: %s", "prod", got)
	}
}

// ⚠ SC-006 — THE UNTRACKED PRODUCT IS UNCHANGED, proven rather than asserted.
//
// The whole catalogue is untracked the moment this ships (`stock_tracked` defaults to false), so the
// single most important property of this feature on day one is that it changes NOTHING. This states
// it as an equivalence: for an untracked product the new rule is EXACTLY the old one, character for
// character in outcome, across every status the platform has.
//
// The second half of the proof is not in this file and cannot be: every pre-054 test in
// features/cart, features/storefront and features/saveditems passes with its expectations
// UNMODIFIED. None of them mentions stock. That silence is the evidence.
func TestUntrackedIsExactlyThePreviousRule(t *testing.T) {
	// The rule as it stood before 054, quoted from the code it replaced.
	previous := func(status string) bool { return status == "active" }

	for _, status := range []string{"active", "draft", "unavailable", "archived", "", "ACTIVE"} {
		t.Run("status="+status, func(t *testing.T) {
			// nil count is the real shape (the column is NULL for untracked); a stale non-nil count
			// must not change the answer either, or turning tracking off would not truly restore it.
			for _, onHand := range []*int{nil, ptr(0), ptr(7)} {
				if got, want := Purchasable(status, false, onHand), previous(status); got != want {
					t.Fatalf("untracked %q with onHand=%v: got %v, want %v — an untracked product MUST behave exactly as it did before 054",
						status, onHand, got, want)
				}
			}
		})
	}
}

// ⚠ And the SQL half of SC-006: the predicate must SHORT-CIRCUIT on untracked rather than merely
// evaluating to the same answer. `stock_on_hand > 0` against NULL is UNKNOWN, not false, and an AND
// with UNKNOWN drops the row — so an untracked product would vanish from every listing on deploy.
// The `NOT stock_tracked OR` arm is what stops that, and TestPredicateShortCircuits pins its order.
func TestUntrackedRowsCannotBeDroppedByThreeValuedLogic(t *testing.T) {
	sql := Predicate("p")
	if !strings.Contains(sql, "NOT p.stock_tracked OR") {
		t.Fatalf("the untracked short-circuit is missing; NULL stock_on_hand would make the predicate UNKNOWN and silently hide the entire catalogue: %s", sql)
	}
}
