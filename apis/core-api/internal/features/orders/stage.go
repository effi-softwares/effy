package orders

// The customer-facing progress vocabulary (052 FR-008).
//
// ⚠ THIS IS DERIVED SERVER-SIDE AND PUT ON THE DTO. No client computes it. Two clients deriving one
// answer independently is 029's banner target (a Go test asserted `kind == "search"` while the wire
// carried something else) and 033's `available` flag (one name, two meanings) — and the failure is
// silent, because both surfaces still render *something*.
//
// ⚠ IT DISCLOSES NO FULFILMENT STRUCTURE (FR-009). It is computed FROM per-shop portion statuses and
// collapses them to one word; the number of portions, their identity and their individual states
// never leave this function.

// Stage is the closed vocabulary mirrored in packages/shared-types/src/order.ts (`OrderStage`).
type Stage string

const (
	StageConfirmed Stage = "confirmed"
	StagePacking   Stage = "packing"
	StageOnTheWay  Stage = "on_the_way"
	StageDelivered Stage = "delivered"
)

// rank orders the per-portion fulfilment statuses along the customer's journey. A status this map
// does not know scores 0 — the safest answer, because "we have it" is never a claim that can mislead
// a shopper into thinking their order has moved further than it has.
// ⚠ `ready_for_pickup` SCORES 1, NOT 2, AND THAT WAS A CORRECTION (053 FR-016).
//
// It shipped at 2 — "on the way" — in the 020 era, when `collected` meant "handed to a courier" and
// being packed was the last step before departure. 049 changed the operation underneath this map:
// under hub-and-spoke, `ready_for_pickup` means PACKED AND SITTING ON A SHELF AT THE SHOP, waiting
// for the next scheduled collection round — which can be the following day. The order has not left,
// and telling a shopper it is on its way is a claim the business has not earned.
//
// `collected` stays at 2: a driver has it and the shop does not, which is genuinely departed —
// whether it is en route to the hub, sitting at the hub, or already with a carrier. Those are all
// the same fact to a customer, which is also why 053 added no new fulfilment status (research R3).
var rank = map[string]int{
	"pending":          0,
	"received":         1,
	"picking":          1,
	"ready_for_pickup": 1,
	"collected":        2,
	"delivered":        3,
}

// StageFor collapses every portion's status into the ONE stage the customer is shown.
//
// ⚠ IT IS A ROLLUP, NOT A MAX. The order is only as far along as its LEAST advanced portion, because
// the customer has not received their order until all of it has arrived. A two-shop order with one
// portion `delivered` and one still `picking` is `packing` — reporting `delivered` there would tell
// someone their shopping is on the doorstep while half of it is still being picked.
//
// An order with no portions yet (the fan-out runs inside the same transaction as the paid transition,
// so this is a narrow window) is `confirmed`: payment has been taken and nothing has moved.
func StageFor(fulfillments []Fulfillment) Stage {
	if len(fulfillments) == 0 {
		return StageConfirmed
	}

	least := 3 // start at the most advanced and walk DOWN to the laggard
	for _, f := range fulfillments {
		r, known := rank[f.Status]
		if !known {
			// An unrecognised status is treated as "not started". A future status this build has
			// never heard of must not be able to advance the customer's view of their order.
			r = 0
		}
		if r < least {
			least = r
		}
	}

	switch least {
	case 3:
		return StageDelivered
	case 2:
		return StageOnTheWay
	case 1:
		return StagePacking
	default:
		return StageConfirmed
	}
}
