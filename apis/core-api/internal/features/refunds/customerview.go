package refunds

// What a shopper is told about a refund (055 US5).
//
// ⚠ FIVE INTERNAL STATES BECOME THREE, AND THE COLLAPSE IS THE POINT. A shopper cannot act on the
// difference between "we have not heard from the provider" and "the provider has it", and whether a
// refund was *refused* rather than *failed* is a fact about our integration, not about their money.
// Showing five states would be showing them our plumbing and asking them to interpret it.
const (
	CustomerOnItsWay  = "on_its_way"
	CustomerCompleted = "completed"
	CustomerProblem   = "there_was_a_problem"
)

// CustomerState maps an internal refund state to what the shopper is told (FR-025).
//
// ⚠ `submitting` AND `submitted` BOTH READ AS "ON ITS WAY", and that is honest rather than
// convenient: in both cases we have asked for the money to go back and it has not arrived. The
// difference between them is whether OUR request reached the provider, which is our problem to chase.
//
// ⚠ `failed` AND `refused` BOTH READ AS "THERE WAS A PROBLEM" — deliberately without saying what.
// The provider's reason ("your bank rejected the refund") is staff information: a shopper cannot act
// on it, and surfacing it invites them to argue with a message that will not change (FR-026/T059).
// What they need is that we know and are dealing with it.
//
// ⚠ AN UNKNOWN STATE READS AS "ON ITS WAY", NOT "COMPLETED". A state this build has never heard of
// must never tell a shopper their money has arrived — the one claim that stops them looking for it.
func CustomerState(internal string) string {
	switch internal {
	case StatusSucceeded:
		return CustomerCompleted
	case StatusFailed, StatusRefused:
		return CustomerProblem
	default:
		return CustomerOnItsWay
	}
}
