// Locality lookup (030 US1 / FR-005 … FR-011). A shopper names where they live by SUBURB, not only by
// a postcode they have to already know.
//
// This partners the serviceability read in serviceability.go: that one answers "do we deliver to this
// postcode?", this one answers "which places could you mean?". Two halves of one interaction, which is
// why they live side by side and are mounted side by side.
package storefront

import (
	"context"
	"errors"
	"strings"
)

// ErrInvalidQuery means the caller sent too little to search on.
//
// ⚠ It is deliberately distinct from "no places matched", exactly as ErrInvalidPostcode is distinct
// from "not serviced". The handler turns this into a 400 and an empty result into a 200 with `[]`,
// and the clients render them as "keep typing" and "we don't recognise that place" respectively.
// NEITHER may ever surface as "we don't deliver there" (FR-012).
var ErrInvalidQuery = errors.New("storefront: invalid locality query")

const (
	// localityLimit bounds the list so it stays scannable (FR-010). Eight rows is about one
	// comfortable sheet-height on a phone without scrolling past the keyboard; beyond that the
	// shopper is better served by typing another character.
	localityLimit = 8

	// localityMinQuery is the shortest input worth asking the database about (FR-009). One character
	// matches thousands of rows and tells the shopper nothing.
	localityMinQuery = 2
)

// Locality is one place a shopper can name.
//
// ⚠ All THREE fields identify it, and no two of them do: a name recurs across states, a locality spans
// postcodes, and a postcode covers localities. That is why FR-008 forbids a bare name being
// selectable, and why the table's natural key is the triple.
//
// The `db` tags feed pgx's RowToStructByName in the repository.
type Locality struct {
	Name     string `db:"name"`
	State    string `db:"state"`
	Postcode string `db:"postcode"`
}

// Localities answers "which places could you mean?".
//
// The SERVER classifies the input, so no client has to decide what it is holding before it asks
// (FR-006). Digits are a postcode; anything else is a name prefix.
func (s *Service) Localities(ctx context.Context, rawQuery string) ([]Locality, error) {
	q, byPostcode, ok := classifyLocalityQuery(rawQuery)
	if !ok {
		// Rejected before touching the database — too little input is not a question worth asking.
		return nil, ErrInvalidQuery
	}

	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	out, err := s.repo.SearchLocalities(ctx, q, byPostcode, localityLimit)
	if err != nil {
		// Propagate. The handler says "we couldn't look that up"; it must never degrade a broken read
		// into an empty list, which a shopper reads as "that place doesn't exist" (FR-013).
		return nil, err
	}
	if out == nil {
		// A nil slice marshals to `null`; the contract says an empty result is `[]`. A client that
		// has to distinguish null-from-empty is a client that will eventually get it wrong.
		out = []Locality{}
	}
	return out, nil
}

// classifyLocalityQuery decides what the shopper typed and normalises it.
//
// A four-digit run — after stripping the separators a person might type ("30 00", "30-00") — is a
// postcode and is matched exactly. Anything else of at least two characters is a name prefix.
//
// ⚠ The postcode branch reuses the SAME separator rule as delivery.NormalizePostcode, including its
// refusal to strip a LEADING or TRAILING separator: without that, "-1000" would normalise to "1000"
// and the shopper would be answered about a place they never named. The rule is duplicated here rather
// than imported because this function must also fall through to the name branch, which
// NormalizePostcode cannot express — but the two must agree, and a test pins that they do.
func classifyLocalityQuery(raw string) (query string, byPostcode bool, ok bool) {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) < localityMinQuery {
		return "", false, false
	}

	if isDigit(rune(trimmed[0])) && isDigit(rune(trimmed[len(trimmed)-1])) {
		stripped := strings.Map(func(r rune) rune {
			if r == ' ' || r == '-' || r == '\t' {
				return -1
			}
			return r
		}, trimmed)
		if len(stripped) == 4 && allDigits(stripped) {
			return stripped, true, true
		}
		// Digits at both ends but not a postcode — e.g. "3" or "31210". There is no locality name
		// this could be either, so there is nothing to search for.
		if allDigits(stripped) {
			return "", false, false
		}
	}

	return trimmed, false, true
}

func isDigit(r rune) bool { return r >= '0' && r <= '9' }

func allDigits(s string) bool {
	for _, r := range s {
		if !isDigit(r) {
			return false
		}
	}
	return len(s) > 0
}
