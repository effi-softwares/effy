package refunds

// The refund state machine (055 US4, T033, data-model §7).
//
// ⚠ FIVE STATES, BECAUSE EACH IS A DIFFERENT ANSWER TO THE ONLY QUESTION ANYONE ASKS ABOUT A REFUND:
// did the money go? A state that cannot answer it is not a state, it is decoration.
//
//	submitting ──► submitted ──► succeeded
//	     │              │
//	     │              └───────► failed        (the bank rejected it — up to 30 days later)
//	     └──────────────────────► refused       (the provider would not accept it at all)
//
// ⚠ THE TWO PAIRS EXIST BECAUSE COLLAPSING EITHER LOSES SOMETHING NOBODY CAN RECOVER:
//
//   - `submitting` vs `submitted` — has the provider GOT it? `submitting` means we asked and got no
//     answer, so the refund may or may not exist. It must not count toward what has been refunded
//     (FR-005e), or an outage on our side makes the platform refuse to return money it still holds.
//
//   - `failed` vs `refused` — could retrying ever help? `failed` is the bank rejecting a refund that
//     was accepted; a retry may work and staff must resolve it. `refused` is a decision, and retrying
//     a decision cannot change it. Both count against the ceiling, because both are money the platform
//     ATTEMPTED to return: freeing it would let a bouncing retry refund an order repeatedly.
//
// ⚠ THE MACHINE IS ENFORCED IN SQL, NOT HERE. `SettleByProviderID` guards on
// `status IN ('submitting','submitted')`, so a terminal refund cannot be reopened by a late or
// redelivered event. This file is the vocabulary and the predicates; the WHERE clause is the rule.
const (
	StatusSubmitting = "submitting"
	StatusSubmitted  = "submitted"
	StatusSucceeded  = "succeeded"
	StatusFailed     = "failed"
	StatusRefused    = "refused"
)

// CountedStatuses are the states that count toward what has been refunded on an order.
//
// ⚠ THIS IS THE CEILING'S DEFINITION AND IT IS DUPLICATED IN ONE OTHER PLACE ON PURPOSE:
// `refundedCents` in repository.go, which is the query that actually enforces it under the row lock.
// A drift guard in the orders edge service reads that SQL constant and compares. This list exists so
// Go callers reason about the same set by name rather than by re-typing three strings.
var CountedStatuses = []string{StatusSubmitted, StatusSucceeded, StatusFailed}

// IsTerminal reports whether a refund has finished moving, one way or the other.
func IsTerminal(status string) bool {
	switch status {
	case StatusSucceeded, StatusFailed, StatusRefused:
		return true
	default:
		return false
	}
}

// NeedsAttention reports whether a human must look at this refund.
//
// ⚠ `submitting` IS IN HERE, and it is the one people forget. A refund the provider never answered
// about is not "in progress" — it is a refund nobody can account for, and it will sit there forever
// because no event is coming to move it. `failed` is the obvious one; `submitting` is the silent one.
func NeedsAttention(status string) bool {
	return status == StatusFailed || status == StatusSubmitting
}

// MoneyReturned reports whether the customer actually has their money.
//
// ⚠ ONLY `succeeded`. Everything else is a claim about the future, and the whole reason US4 exists is
// that platforms routinely treat `submitted` as this and are wrong for up to thirty days.
func MoneyReturned(status string) bool { return status == StatusSucceeded }
