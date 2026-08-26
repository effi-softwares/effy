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
		{"ready_for_pickup is still packing", f("ready_for_pickup"), StagePacking},
		{"collected is on the way", f("collected"), StageOnTheWay},
		{"delivered is delivered", f("delivered"), StageDelivered},

		{"every portion delivered is delivered", f("delivered", "delivered"), StageDelivered},
		{"a packed portion holds the order at packing", f("ready_for_pickup", "collected"), StagePacking},
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

// ⚠ THE CORRECTION 053 MADE, PINNED SO IT CANNOT BE UNDONE SILENTLY (FR-016).
//
// `ready_for_pickup` means PACKED AND WAITING ON A SHELF AT THE SHOP for the next scheduled
// collection round — under 049's hub-and-spoke operation, possibly until tomorrow. The order has not
// departed, and a customer must not be told it has.
//
// This map entry shipped as rank 2 ("on the way") in the 020 era, when `collected` meant "handed to
// a courier" and being packed really was the last step before departure. 049 changed the operation
// underneath it and nothing here failed, because a lookup table has no way to notice that the world
// moved. Restoring `"ready_for_pickup": 2` makes exactly this test fail.
func TestStageFor_PackedAtTheShopHasNotDeparted(t *testing.T) {
	if got := StageFor(f("ready_for_pickup")); got != StagePacking {
		t.Fatalf("a packed portion still at its shop = %q, want %q — it has not left the shop, so the customer must not be told it is on the way", got, StagePacking)
	}

	// A mixed order is held back by the portion still at its shop, not carried forward by the one
	// that has left — the rollup rule applied to this same correction.
	if got := StageFor(f("ready_for_pickup", "collected")); got != StagePacking {
		t.Fatalf("one portion packed at its shop + one collected = %q, want %q", got, StagePacking)
	}

	// The boundary the correction draws: `collected` IS departure. A driver has it and the shop does
	// not — whether it is en route to the hub, at the hub, or already with a carrier.
	if got := StageFor(f("collected")); got != StageOnTheWay {
		t.Fatalf("a collected portion = %q, want %q — it has left the shop", got, StageOnTheWay)
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
