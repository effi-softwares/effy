// Package pricing holds the platform's fixed commercial constants (019). The delivery fee is a single
// flat per-order amount regardless of how many shops the order spans (the clarification / R13) — one
// fee line on the cart and the receipt.
package pricing

// DeliveryFeeCents is the flat per-order delivery fee in integer minor units (AUD cents).
const DeliveryFeeCents int64 = 500

// Currency is the single platform currency this slice.
const Currency = "AUD"
