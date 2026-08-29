// Package availability owns THE ONE RULE that decides whether a shopper can buy a product.
//
// ⚠ WHY THIS PACKAGE EXISTS AT ALL (054 FR-012, SC-012). Before it, the rule was the literal
// `p.status = 'active'`, written out by hand in fourteen places across four features. Adding stock
// meant changing the answer in every one of them, and missing one would leave a surface quietly
// selling something the shop does not have — a defect with no error, no log line and no failing test.
// This platform has shipped that exact shape twice: customer-web's `summarizeFulfillment` was a
// second implementation of the order-progress rule (deleted in 052), and `TrackStage` still is one
// (gap register G4). Both survived because two implementations of one rule diverge silently.
//
// So: one definition, two forms — a SQL fragment for queries and a Go predicate for rows already in
// memory. They are asserted equivalent by `availability_test.go`, which runs one truth table through
// both, and a guard test refuses any hand-written `status = 'active'` against `public.product`
// anywhere on the hot path.
//
// ⚠ NOT A DATABASE VIEW, deliberately. A view would be the only construct that is literally one
// definition — but no view and no generated column exists anywhere in this platform's migration
// history, and the cross-language problem a view solves does not arise here: every consumer of this
// rule is Go. A sweep of the cold path found no TypeScript that decides customer purchasability at
// all (research R1). And a SQL function would be evaluated per row, defeating the
// `(shop_id, status)` index on the storefront read path that 029 had to rescue from a 3-second
// timeout.
package availability

import "fmt"

// StatusActive is the one `public.product.status` value that permits a sale. The other three —
// draft, unavailable, archived — each mean "not for sale" for a different reason, and only this
// package should care which.
const StatusActive = "active"

// Columns is what a query MUST select for [Purchasable] to be answerable from its rows. Named here
// so a caller cannot select two of the three and get a confidently wrong answer.
const Columns = "status, stock_tracked, stock_on_hand"

// Predicate returns the SQL that decides purchasability for a `public.product` row under `alias`.
//
//	WHERE ` + availability.Predicate("p")
//
// ⚠ Both terms are load-bearing and they mean different things. `status` is an operator's deliberate
// decision to stop selling something; stock is a fact about a shelf. A product needs BOTH to permit
// the sale (054 A3), which is why this is an AND and not a coalesce of one into the other.
//
// ⚠ `NOT alias.stock_tracked` comes FIRST so an untracked product short-circuits without ever
// consulting the count. That is what makes an untracked product byte-identical to its pre-054 self
// (FR-002, SC-006) even though `stock_on_hand` is NULL for it — the NULL is never reached, so the
// predicate can never go three-valued and silently drop the row.
func Predicate(alias string) string {
	return fmt.Sprintf(
		"%[1]s.status = '"+StatusActive+"' AND (NOT %[1]s.stock_tracked OR %[1]s.stock_on_hand > 0)",
		alias,
	)
}

// Purchasable is [Predicate]'s twin, for a row already in memory.
//
// `stockOnHand` is a pointer because the column is NULL exactly when the product is untracked — a
// state the database makes unrepresentable in the other direction
// (`CHECK (NOT stock_tracked OR stock_on_hand IS NOT NULL)`). The nil check below is therefore
// defensive rather than expected, and it fails CLOSED: a tracked product with no count is not
// sellable, which is the safe reading of a state that should not exist.
func Purchasable(status string, stockTracked bool, stockOnHand *int) bool {
	if status != StatusActive {
		return false
	}
	if !stockTracked {
		return true
	}
	return stockOnHand != nil && *stockOnHand > 0
}

// OutOfStock distinguishes "the shelf is empty" from "we stopped selling it".
//
// ⚠ The distinction is not cosmetic — FR-014 requires a shopper to be able to tell them apart,
// because one is worth waiting for and the other is not, and SC-010 tests that with five observers.
// Collapsing them is the 031 REGIONAL defect in miniature, which is why saved items carries three
// verdicts and not a boolean.
func OutOfStock(status string, stockTracked bool, stockOnHand *int) bool {
	return status == StatusActive && stockTracked && (stockOnHand == nil || *stockOnHand <= 0)
}
