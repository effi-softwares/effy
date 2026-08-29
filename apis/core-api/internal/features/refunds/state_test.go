package refunds

import (
	"os"
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"
)

// ⚠ THE CEILING IS DEFINED TWICE — here by name, and in `refundedCents` as SQL. The SQL is the one
// that enforces it under the row lock, so this reads it and compares rather than trusting that two
// people wrote the same three words. The edge console has its own copy of this guard for the same
// reason; that is three places, and none of them may drift.
func TestCountedStatuses_MatchTheSQLThatActuallyEnforcesTheCeiling(t *testing.T) {
	src, err := os.ReadFile("repository.go")
	require.NoError(t, err)

	block := regexp.MustCompile(`(?s)const refundedCents = ` + "`" + `(.*?)` + "`").FindSubmatch(src)
	require.NotNil(t, block, "refundedCents is no longer a raw-string constant — the guard cannot read it")
	in := regexp.MustCompile(`r\.status IN \(([^)]*)\)`).FindSubmatch(block[1])
	require.NotNil(t, in, "refundedCents no longer filters on r.status IN (...)")

	got := regexp.MustCompile(`'([a-z_]+)'`).FindAllSubmatch(in[1], -1)
	statuses := make([]string, 0, len(got))
	for _, m := range got {
		statuses = append(statuses, string(m[1]))
	}
	require.ElementsMatch(t, CountedStatuses, statuses,
		"the named set and the SQL that enforces it disagree")
}

func TestNeedsAttention_IncludesTheSILENTFailureAndNotJustTheLoudOne(t *testing.T) {
	// The loud one.
	require.True(t, NeedsAttention(StatusFailed))
	// ⚠ The silent one. No event is coming to move a `submitting` refund — it sits there forever
	// unless a person looks, which is exactly why it must be surfaced as needing one.
	require.True(t, NeedsAttention(StatusSubmitting))

	require.False(t, NeedsAttention(StatusSubmitted), "on its way is not a problem")
	require.False(t, NeedsAttention(StatusSucceeded))
	// ⚠ `refused` is terminal and needs no ACTION on the refund itself — retrying a decision cannot
	// change it. The operator was told at the time, synchronously.
	require.False(t, NeedsAttention(StatusRefused))
}

// ⚠ THE DEFECT US4 EXISTS FOR, stated as a single assertion.
func TestMoneyReturned_IsTrueForSucceededAndNothingElse(t *testing.T) {
	require.True(t, MoneyReturned(StatusSucceeded))
	for _, s := range []string{StatusSubmitting, StatusSubmitted, StatusFailed, StatusRefused} {
		require.False(t, MoneyReturned(s),
			"%s is a claim about the future — treating it as money returned is the whole defect", s)
	}
}

func TestIsTerminal_MatchesWhatTheSettleGuardWillNoLongerMove(t *testing.T) {
	src, err := os.ReadFile("repository.go")
	require.NoError(t, err)
	// The settle UPDATE moves a refund only out of these two; everything else must be terminal.
	require.Contains(t, string(src), `AND status IN ('submitting', 'submitted')`,
		"the settle guard is what makes a redelivery change state at most once")

	require.False(t, IsTerminal(StatusSubmitting))
	require.False(t, IsTerminal(StatusSubmitted))
	for _, s := range []string{StatusSucceeded, StatusFailed, StatusRefused} {
		require.True(t, IsTerminal(s))
	}
}
