// Package pricing holds the platform's fixed commercial constants.
//
// 021 removed the flat DeliveryFeeCents: delivery is now priced per package by (origin zone ->
// destination zone, method) from the delivery_offering table (see internal/platform/delivery). What
// remains here is the currency and the quote-validity window — fixed commercial constants, the
// established home for values like this (rather than env config).
package pricing

import "time"

// Currency is the single platform currency.
const Currency = "AUD"

// QuoteValidity is how long a captured delivery quote is honored at placement before the customer must
// re-quote (021, R7/FR-011). A few minutes covers the display->pay gap without letting a stale quote be
// replayed. A fixed commercial constant, not env config.
const QuoteValidity = 10 * time.Minute
