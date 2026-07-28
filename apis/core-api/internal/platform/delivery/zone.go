package delivery

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ── The one postcode→zone predicate (025 FR-014b) ───────────────────────────────────────────────
//
// ⚠ This file is the deliberate exception to the package doc's "no DB" rule, and it is here for a
// reason worth reading before moving it.
//
// Feature 025 lets the storefront answer "do we deliver to you?" BEFORE a cart exists, so a shopper
// learns it in the header rather than at checkout. That creates two callers for a question that
// previously had one: the new storefront read, and checkout's DestinationZone.
//
// Two callers of the same question, each with its own copy of the SQL, is a bug with a delay fuse.
// They agree on the day they are written and diverge the first time one is edited alone — and the
// symptom is the worst kind: a shopper told "yes, we deliver here", who shops, and is refused at
// payment. FR-014b forbids that outcome, and the only way to make it structurally impossible is one
// predicate with one implementation.
//
// It lives in `platform` rather than in either feature because neither feature owns it: checkout
// must not import storefront, storefront must not import checkout, and whichever one held it would
// look like its owner.

// RowQuerier is the narrow slice of a pgx pool this lookup needs. Declared here so callers can pass a
// pool, a transaction, or a fake without this package depending on any of them.
type RowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// zoneForPostcodeSQL resolves a postcode to its delivery zone.
//
// `public.delivery_zone_postcode.postcode` is UNIQUE, and that is load-bearing: a postcode belongs to
// AT MOST one zone, so "no row" is unambiguous. The table's own comment states the rule this encodes —
// "A postcode in no row = no zone = undeliverable" (migration 20260721181947, FR-017).
const zoneForPostcodeSQL = `SELECT zone_id::text FROM public.delivery_zone_postcode WHERE postcode = $1`

// ZoneForPostcode resolves a postcode to its delivery zone.
//
// ok=false means no zone covers the postcode, which means undeliverable. That is a normal answer, not
// an error — err is non-nil only when the lookup itself failed, and callers MUST keep the two apart.
// Collapsing a failed read into "not serviced" tells a prospective customer to leave because a
// database hiccuped.
func ZoneForPostcode(ctx context.Context, q RowQuerier, postcode string) (zoneID string, ok bool, err error) {
	var id string
	err = q.QueryRow(ctx, zoneForPostcodeSQL, postcode).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("delivery: zone for postcode: %w", err)
	}
	return id, true, nil
}

// NormalizePostcode reduces caller input to the canonical stored form, or reports that it is not a
// postcode at all.
//
// The distinction matters to the storefront: "that isn't a postcode" and "we don't deliver there" are
// different answers and the UI says different things. A malformed input must never be reported as
// unserviced — that tells a shopper Effy refuses to deliver somewhere they never successfully named.
//
// AU postcodes are exactly four digits. Separators a person might type ("30 00", "30-00") are
// tolerated BETWEEN digits and stripped; anything else fails.
//
// ⚠ A leading or trailing separator is rejected rather than stripped. Otherwise "-1000" normalises to
// "1000" and the shopper is answered about a postcode they did not enter. The web client's
// `normalizePostcode` applies the identical rule — the two must agree, or the client accepts input the
// server then 400s on.
func NormalizePostcode(raw string) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) < 2 || !isDigit(rune(trimmed[0])) || !isDigit(rune(trimmed[len(trimmed)-1])) {
		return "", false
	}

	stripped := strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' || r == '\t' {
			return -1
		}
		return r
	}, trimmed)

	if len(stripped) != 4 {
		return "", false
	}
	for _, r := range stripped {
		if !isDigit(r) {
			return "", false
		}
	}
	return stripped, true
}

func isDigit(r rune) bool { return r >= '0' && r <= '9' }
