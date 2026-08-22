package delivery

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

var postcodeRe = regexp.MustCompile(`^[0-9]{4}$`)

// NormalizePostcode trims and validates an Australian 4-digit postcode. ok=false for anything that is not
// exactly four digits after trimming — a malformed postcode is a 400, NEVER "we don't deliver there".
func NormalizePostcode(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if !postcodeRe.MatchString(s) {
		return "", false
	}
	return s, true
}

// ServiceableForPostcode is THE serviceability predicate (FR-001): serviced ⇔ the postcode belongs to an
// ACTIVE delivery zone. It is the SAME predicate the checkout quote uses, so the up-front answer and the
// quote can never disagree (FR-004). A postcode in no zone — or in a disabled zone — is not served.
func ServiceableForPostcode(ctx context.Context, q db.DBTX, postcode string) (bool, error) {
	const sql = `
		SELECT EXISTS (
			SELECT 1
			FROM public.delivery_zone_postcode zp
			JOIN public.delivery_zone z ON z.id = zp.zone_id
			WHERE zp.postcode = $1 AND z.status = 'active'
		)`
	var serviced bool
	if err := q.QueryRow(ctx, sql, postcode).Scan(&serviced); err != nil {
		return false, fmt.Errorf("delivery: serviceability query: %w", err)
	}
	return serviced, nil
}

// Zone is the resolved active zone for a destination postcode: its id, its ring (the distance tier the
// quote prices on), and whether it is same-day eligible by default (FR-037).
type Zone struct {
	ID              string
	RingID          string
	SameDayEligible bool
}

// ZoneForPostcode resolves a postcode to its ACTIVE zone. serviced=false (no error) when the postcode is
// in no active zone; the caller then answers the single "not delivered yet" outcome (FR-002). Shares
// delivery_zone_postcode with ServiceableForPostcode, so the two can never disagree (FR-004).
func ZoneForPostcode(ctx context.Context, q db.DBTX, postcode string) (Zone, bool, error) {
	const sql = `
		SELECT z.id::text, z.ring_id::text, z.sameday_eligible
		FROM public.delivery_zone_postcode zp
		JOIN public.delivery_zone z ON z.id = zp.zone_id
		WHERE zp.postcode = $1 AND z.status = 'active'`
	var z Zone
	if err := q.QueryRow(ctx, sql, postcode).Scan(&z.ID, &z.RingID, &z.SameDayEligible); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Zone{}, false, nil
		}
		return Zone{}, false, fmt.Errorf("delivery: zone query: %w", err)
	}
	return z, true, nil
}

// SameDayForShops resolves the per-(shop, zone) same-day decision for a set of shops (FR-044): a shop is
// offered same-day iff an exception says so, else the zone default. Returns the set of shop ids that DO
// offer same-day in this zone.
func SameDayForShops(ctx context.Context, q db.DBTX, zoneID string, zoneDefault bool, shopIDs []string) (map[string]bool, error) {
	out := make(map[string]bool, len(shopIDs))
	for _, id := range shopIDs {
		out[id] = zoneDefault // start from the zone default (FR-037)
	}
	if len(shopIDs) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `
		SELECT shop_id::text, mode
		FROM public.shop_sameday_exception
		WHERE zone_id = $1 AND shop_id = ANY($2)`, zoneID, shopIDs)
	if err != nil {
		return nil, fmt.Errorf("delivery: sameday exceptions query: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var shopID, mode string
		if err := rows.Scan(&shopID, &mode); err != nil {
			return nil, fmt.Errorf("delivery: scan sameday exception: %w", err)
		}
		out[shopID] = mode == "on" // an exception overrides the zone default (FR-043)
	}
	return out, rows.Err()
}
