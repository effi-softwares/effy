package checkout

import (
	"regexp"
	"strings"
	"testing"
)

// 054 US3 — the reduction and the shortfall flag live inside FinalizeSucceeded, which is the
// strongest transaction on the platform. These read the SQL rather than execute it: the executing
// proofs (exactly-once, and the deliberate-oversell concurrency test that is SC-003) are
// container-backed and live in the quickstart. ⚠ Those are the ones that matter most, and they
// CANNOT RUN WITHOUT DOCKER — 052 lost an entire session's exactly-once proofs to a silent skip.
//
// What these DO catch is the class of mistake that is invisible at runtime until it is expensive:
// the two statements in the wrong order, a missing floor, a missing lock ordering.

func finalizeSource(t *testing.T) string {
	t.Helper()
	return storeSource(t)
}

func TestFinalize_FlagsTheShortfallBEFOREDeductingStock(t *testing.T) {
	src := finalizeSource(t)
	flag := strings.Index(src, "flag stock shortfall")
	deduct := strings.Index(src, "reduce stock")
	if flag < 0 || deduct < 0 {
		t.Fatal("both statements must be present in FinalizeSucceeded")
	}
	// ⚠ ORDER IS CORRECTNESS HERE, NOT STYLE. The deficit is `ordered - what was on the shelf`, and
	// after the deduction the shelf reads 0 — so computing it afterwards reports the WHOLE line as
	// short instead of the units actually missing. The first draft of this feature did exactly that.
	if flag > deduct {
		t.Fatal("the shortfall must be flagged BEFORE the deduction, or the deficit is computed from a shelf that has already been emptied")
	}
}

func TestFinalize_TheReductionHasAFloorInTheStatement(t *testing.T) {
	src := finalizeSource(t)
	if !strings.Contains(src, "GREATEST(0, prev.stock_on_hand - prev.qty)") {
		t.Error("the floor must be in the UPDATE (FR-022): a read-then-subtract lets two concurrent finalizes drive the count negative")
	}
}

func TestFinalize_TakesRowLocksInADeterministicOrder(t *testing.T) {
	src := finalizeSource(t)
	prev := strings.Index(src, "FOR UPDATE OF p")
	order := strings.Index(src, "ORDER BY p.id")
	if prev < 0 || order < 0 || order > prev {
		t.Error("`ORDER BY p.id` must precede `FOR UPDATE OF p`: two orders with overlapping baskets that lock in different sequences can each hold what the other needs")
	}
}

func TestFinalize_WritesAMovementForEveryDeduction(t *testing.T) {
	src := finalizeSource(t)
	if !strings.Contains(src, "INSERT INTO public.stock_movement") {
		t.Fatal("a count that moves with no movement recorded makes SC-005 false forever")
	}
	// The one actor with no person behind it.
	if !strings.Contains(src, "'order_paid', 'system', NULL") {
		t.Error("the paid path must record actor_kind='system' with no subject")
	}
}

// ⚠ FR-021's exactly-once comes from the status guard at the top of the function, NOT from a dedupe
// key on the stock statements. This pins that the guard is still there — if it were ever relaxed,
// every redelivered webhook would deduct again and the fix would need to be here instead.
func TestFinalize_StillGuardsOnPendingPaymentSoEverythingBelowRunsOnce(t *testing.T) {
	src := finalizeSource(t)
	guard := regexp.MustCompile(`UPDATE public\."order" SET status='paid'.*WHERE id=\$1 AND status='pending_payment'`)
	if !guard.MatchString(src) {
		t.Fatal("the status-guarded transition is what makes the stock reduction exactly-once; nothing else does")
	}
	if strings.Index(src, "status='pending_payment'") > strings.Index(src, "reduce stock") {
		t.Fatal("the guard must come BEFORE the stock work")
	}
}

// Untracked products must produce no movement at all (FR-024) — the predicate that guarantees it.
func TestFinalize_OnlyTouchesTrackedProducts(t *testing.T) {
	src := finalizeSource(t)
	after := src[strings.Index(src, "reduce stock")-2000:]
	if !strings.Contains(after, "WHERE p.stock_tracked") {
		t.Error("the reduction must be scoped to tracked products, or an untracked product gains a movement history it should not have")
	}
}
