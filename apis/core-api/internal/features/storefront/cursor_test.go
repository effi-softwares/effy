package storefront

import (
	"encoding/base64"
	"testing"
)

// Every sort's cursor must survive a round trip exactly — the key is carried as text precisely so a
// price never passes through a float on the way back.
func TestCursor_RoundTripsForEverySort(t *testing.T) {
	cases := []Cursor{
		{Sort: SortNewest, Key: "2026-07-27T10:00:00.123456789Z", ID: "11111111-1111-1111-1111-111111111111"},
		{Sort: SortPriceAsc, Key: "12.34", ID: "22222222-2222-2222-2222-222222222222"},
		{Sort: SortPriceDesc, Key: "9999.99", ID: "33333333-3333-3333-3333-333333333333"},
		{Sort: SortRelevance, Key: "0.4218750", ID: "44444444-4444-4444-4444-444444444444"},
	}
	for _, want := range cases {
		got, ok := DecodeCursor(want.Encode())
		if !ok {
			t.Fatalf("%s: failed to decode its own encoding", want.Sort)
		}
		if got != want {
			t.Fatalf("%s: round trip changed the cursor: got %+v want %+v", want.Sort, got, want)
		}
	}
}

// THE test this type exists for (FR-016b).
//
// A cursor minted under one ordering, presented under another, must be detectable. If it were not,
// the query would compare a price against a timestamp — no error, just a result set with products
// silently dropped and repeated.
func TestCursor_CarriesTheSortItWasIssuedUnder(t *testing.T) {
	issued := Cursor{Sort: SortNewest, Key: "2026-07-27T10:00:00Z", ID: "11111111-1111-1111-1111-111111111111"}

	got, ok := DecodeCursor(issued.Encode())
	if !ok {
		t.Fatal("decode failed")
	}
	if got.Sort != SortNewest {
		t.Fatalf("cursor lost its sort: %q", got.Sort)
	}
	if got.Sort == SortPriceAsc {
		t.Fatal("a newest cursor must never read as a price cursor")
	}
}

func TestCursor_RejectsMalformedTokens(t *testing.T) {
	cases := map[string]string{
		"not base64":        "!!!!",
		"empty":             "",
		"wrong field count": encodeRaw("2|newest|key"),
		"unknown version":   encodeRaw("1|newest|key|id"),
		"legacy v1 form":    encodeRaw("2026-07-27T10:00:00Z|some-id"),
		"unknown sort":      encodeRaw("2|cheapest|key|id"),
		"empty sort":        encodeRaw("2||key|id"),
		"empty key":         encodeRaw("2|newest||id"),
		"empty id":          encodeRaw("2|newest|key|"),
	}
	for name, token := range cases {
		if _, ok := DecodeCursor(token); ok {
			t.Fatalf("%s: must be rejected, was accepted", name)
		}
	}
}

func TestParseSort(t *testing.T) {
	valid := map[string]ProductSort{
		"":           SortNewest, // absent means the default, not an error
		"newest":     SortNewest,
		"price_asc":  SortPriceAsc,
		"price_desc": SortPriceDesc,
		"relevance":  SortRelevance,
		" newest ":   SortNewest, // trimmed
	}
	for raw, want := range valid {
		got, ok := ParseSort(raw)
		if !ok || got != want {
			t.Fatalf("ParseSort(%q) = %q, %v; want %q, true", raw, got, ok, want)
		}
	}

	// An unrecognised sort is rejected rather than silently defaulted — a shopper who asked for
	// "cheapest" and got "newest" without being told has been lied to about what they are looking at.
	for _, raw := range []string{"cheapest", "price", "NEWEST", "rand"} {
		if _, ok := ParseSort(raw); ok {
			t.Fatalf("ParseSort(%q) must report an invalid sort", raw)
		}
	}
}

// encodeRaw builds a token from an arbitrary payload so the decoder can be tested against
// malformed input it should never receive from its own encoder.
func encodeRaw(payload string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(payload))
}
