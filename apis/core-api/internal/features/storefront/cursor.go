// Keyset cursors for product search (025 FR-016b).
package storefront

import (
	"encoding/base64"
	"strings"
)

// ProductSort is the ordering applied to a result set. The zero value is not valid — use SortNewest.
type ProductSort string

const (
	// SortNewest is the default and is byte-for-byte the pre-025 behaviour, so no existing result
	// set changes shape.
	SortNewest    ProductSort = "newest"
	SortPriceAsc  ProductSort = "price_asc"
	SortPriceDesc ProductSort = "price_desc"
	// SortRelevance is only meaningful alongside a text query. Without one the service falls back to
	// SortNewest and reports the sort it actually used.
	SortRelevance ProductSort = "relevance"
)

// ParseSort maps the wire value to a sort, defaulting to newest. ok=false means the caller sent a
// value that is not a sort at all — the handler 400s rather than silently reordering their results.
func ParseSort(raw string) (ProductSort, bool) {
	switch ProductSort(strings.TrimSpace(raw)) {
	case "":
		return SortNewest, true
	case SortNewest:
		return SortNewest, true
	case SortPriceAsc:
		return SortPriceAsc, true
	case SortPriceDesc:
		return SortPriceDesc, true
	case SortRelevance:
		return SortRelevance, true
	default:
		return SortNewest, false
	}
}

// Cursor is an opaque, SORT-TAGGED keyset position.
//
// ⚠ The Sort field is the point of this type, not decoration.
//
// Each ordering has its own keyset tuple — a timestamp for newest, a decimal for price, a similarity
// score for relevance. Feed a cursor minted under one ordering into a query using another and the
// database happily compares a price against a timestamp. There is no error: the shopper simply gets a
// result set with products silently dropped and others repeated, and nothing anywhere reports a
// problem. That is the worst class of bug — wrong, quiet, and unreproducible.
//
// So the cursor carries the ordering it was issued under, and a request whose sort disagrees is
// REJECTED (400) rather than reinterpreted. This costs nothing in practice: a client changing sort
// restarts from the first page anyway, which is also what FR-016b requires of the UI.
type Cursor struct {
	Sort ProductSort
	// Key is the sort column's value at the cursor position, in its exact wire form: RFC3339Nano for
	// newest, the numeric-as-text price for price sorts, the similarity score for relevance. Kept as
	// text so money never round-trips through a float.
	Key string
	// ID is the uuid tiebreak, and it is MANDATORY. None of the sort keys is unique — two products
	// can share a price or a timestamp to the nanosecond — and a keyset without a unique tiebreak
	// skips and repeats rows at every page boundary.
	ID string
}

// cursorVersion prefixes the payload so the format can change without silently misreading old
// cursors. v1 was the pre-025 `<time>|<id>` form with no sort; it does not decode here, which is
// correct — a cursor is an ephemeral page position, not persisted state, and the worst outcome of
// rejecting a stale one is that the shopper starts from the first page.
const cursorVersion = "2"

const cursorSep = "|"

// Encode renders the cursor as an opaque base64url token. Clients MUST NOT construct one.
func (c Cursor) Encode() string {
	payload := strings.Join([]string{cursorVersion, string(c.Sort), c.Key, c.ID}, cursorSep)
	return base64.RawURLEncoding.EncodeToString([]byte(payload))
}

// DecodeCursor parses a token. ok=false covers every malformed case — bad base64, wrong version,
// wrong field count, an unknown sort, or an empty id.
func DecodeCursor(s string) (Cursor, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Cursor{}, false
	}
	parts := strings.Split(string(raw), cursorSep)
	if len(parts) != 4 || parts[0] != cursorVersion {
		return Cursor{}, false
	}
	sort, ok := ParseSort(parts[1])
	if !ok || parts[1] == "" {
		return Cursor{}, false
	}
	if parts[2] == "" || parts[3] == "" {
		return Cursor{}, false
	}
	return Cursor{Sort: sort, Key: parts[2], ID: parts[3]}, true
}
