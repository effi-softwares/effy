package orders

import "testing"

func f(statuses ...string) []Fulfillment {
	out := make([]Fulfillment, 0, len(statuses))
	for _, s := range statuses {
		out = append(out, Fulfillment{Status: s})
	}
	return out
}

func TestStageFor(t *testing.T) {
	cases := []struct {
		name string
		in   []Fulfillment
		want Stage
	}{
		{"no portions yet is confirmed", nil, StageConfirmed},
		{"a single pending portion is confirmed", f("pending"), StageConfirmed},
		{"received is packing", f("received"), StagePacking},
		{"picking is packing", f("picking"), StagePacking},
		{"ready_for_pickup is on the way", f("ready_for_pickup"), StageOnTheWay},
		{"collected is on the way", f("collected"), StageOnTheWay},
		{"delivered is delivered", f("delivered"), StageDelivered},

		{"every portion delivered is delivered", f("delivered", "delivered"), StageDelivered},
		{"every portion ready is on the way", f("ready_for_pickup", "collected"), StageOnTheWay},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := StageFor(c.in); got != c.want {
				t.Fatalf("StageFor(%v) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

// ⚠ THE RULE THIS SLICE MOST NEEDS PINNED (research R5).
//
// It is a ROLLUP, NOT A MAX. A `max` here would report `delivered` the moment ANY portion arrived,
// telling a shopper their order is on the doorstep while half of it is still being picked. Reverting
// StageFor to take the maximum rank makes exactly this test fail and nothing else.
func TestStageFor_IsTheLeastAdvancedPortionNotTheMost(t *testing.T) {
	got := StageFor(f("delivered", "picking"))
	if got != StagePacking {
		t.Fatalf("one portion delivered + one still picking = %q, want %q — the customer has not received their order", got, StagePacking)
	}

	// The same rule one step earlier: a delivered portion must not mask an unstarted one.
	if got := StageFor(f("delivered", "pending")); got != StageConfirmed {
		t.Fatalf("one portion delivered + one not started = %q, want %q", got, StageConfirmed)
	}
}

// An unrecognised status must never ADVANCE the customer's view. A future status this build has not
// heard of scores 0, so the order reads as no further along than it can prove it is.
func TestStageFor_AnUnknownStatusCannotAdvanceTheOrder(t *testing.T) {
	if got := StageFor(f("teleported")); got != StageConfirmed {
		t.Fatalf("unknown status = %q, want %q", got, StageConfirmed)
	}
	if got := StageFor(f("delivered", "teleported")); got != StageConfirmed {
		t.Fatalf("delivered + unknown = %q, want %q", got, StageConfirmed)
	}
}
