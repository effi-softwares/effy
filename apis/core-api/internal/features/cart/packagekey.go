package cart

import (
	"crypto/sha256"
	"encoding/hex"
)

// PackageKey turns a shop id into an OPAQUE, stable grouping token for the customer surfaces.
//
// Items sharing a PackageKey are shown as one anonymous "package". The token is a truncated hash of
// the shop id — deterministic (the same shop always groups the same way) but NOT the shop id itself,
// so it reveals no shop identity and cannot be correlated with the shop UUIDs used on the operator
// surfaces. Hidden fulfilment holds: the split shows, the shop never does.
//
// ⚠ MOVED HERE from the deleted `platform/delivery` package when delivery zones and fees were
// withdrawn. It originally existed to drive the per-package delivery quote; that is gone. What
// remains is genuinely a CART concern — telling a shopper their order arrives in more than one
// parcel — and it survives because hidden fulfilment did, not because delivery did.
func PackageKey(shopID string) string {
	sum := sha256.Sum256([]byte("pkg:" + shopID))
	return "pkg_" + hex.EncodeToString(sum[:])[:12]
}
