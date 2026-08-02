// Package pricing holds the platform's fixed commercial constants.
//
// ⚠ There is NO delivery fee on this platform. 021 replaced a flat fee with per-package zone pricing;
// that whole feature — zones, offerings, pricing rules, same-day approvals and serviceability — was
// withdrawn. An order is its items minus any discount. What remains here is the currency, a fixed
// commercial constant.
package pricing

import "time"

// Currency is the single platform currency.
const Currency = "AUD"

// QuoteValidity is how long a captured delivery quote is honored at placement before the customer must
// re-quote (021, R7/FR-011). A few minutes covers the display->pay gap without letting a stale quote be
// replayed. A fixed commercial constant, not env config.
const QuoteValidity = 10 * time.Minute
