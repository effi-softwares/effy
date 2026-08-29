package refunds

import "testing"

// ⚠ EVERY INTERNAL STATE MUST MAP, and the test enumerates them from the state machine rather than
// listing them again here. A sixth state added without a mapping would otherwise fall silently into
// the default and be reported to a shopper as "on its way" forever.
func TestCustomerState_EveryInternalStateHasAnHonestCustomerWord(t *testing.T) {
	want := map[string]string{
		StatusSubmitting: CustomerOnItsWay,
		StatusSubmitted:  CustomerOnItsWay,
		StatusSucceeded:  CustomerCompleted,
		StatusFailed:     CustomerProblem,
		StatusRefused:    CustomerProblem,
	}
	for internal, expected := range want {
		if got := CustomerState(internal); got != expected {
			t.Fatalf("%s: got %s, want %s", internal, got, expected)
		}
	}
}

// ⚠ ONLY `succeeded` MAY SAY THE MONEY ARRIVED. Everything else is a claim about the future, and
// telling a shopper their refund is complete is precisely what stops them looking for it.
func TestCustomerState_NothingButSuccessSaysTheMoneyArrived(t *testing.T) {
	for _, s := range []string{StatusSubmitting, StatusSubmitted, StatusFailed, StatusRefused} {
		if CustomerState(s) == CustomerCompleted {
			t.Fatalf("%s must not read as completed to a shopper", s)
		}
	}
}

// ⚠ A state this build has never heard of must degrade to "on its way", never to "completed" — the
// same rule the mobile stage mapper follows for an unrecognised stage (052).
func TestCustomerState_AnUnknownStateDegradesToOnItsWay(t *testing.T) {
	if got := CustomerState("some_state_a_later_slice_adds"); got != CustomerOnItsWay {
		t.Fatalf("unknown state must degrade to on_its_way, got %s", got)
	}
}

// ⚠ THE CUSTOMER VOCABULARY IS SMALLER THAN THE INTERNAL ONE, and must stay that way. If these ever
// became the same size, somebody has leaked our integration's states onto a shopper's order page.
func TestCustomerState_CollapsesFiveStatesIntoThree(t *testing.T) {
	seen := map[string]bool{}
	for _, s := range []string{
		StatusSubmitting, StatusSubmitted, StatusSucceeded, StatusFailed, StatusRefused,
	} {
		seen[CustomerState(s)] = true
	}
	if len(seen) != 3 {
		t.Fatalf("expected 3 customer-facing states, got %d: %v", len(seen), seen)
	}
}
