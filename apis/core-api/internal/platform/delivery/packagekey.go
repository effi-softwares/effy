package delivery

import (
	"crypto/sha256"
	"encoding/hex"
)

// PackageKey turns a shop id into an OPAQUE, stable grouping token for the customer surfaces (021, R5).
//
// Items sharing a PackageKey are shown as one anonymous "package". The token is a truncated hash of the
// shop id — deterministic (the same shop always groups the same way within/across requests) but NOT the
// shop id itself, so it reveals no shop identity and cannot be correlated with the shop UUIDs used on the
// operator surfaces (SC-006). Hidden fulfilment holds: the split shows, the shop never does.
func PackageKey(shopID string) string {
	sum := sha256.Sum256([]byte("pkg:" + shopID))
	return "pkg_" + hex.EncodeToString(sum[:])[:12]
}
