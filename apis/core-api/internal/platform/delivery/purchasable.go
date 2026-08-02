package delivery

import (
	"context"
	"fmt"
)

// ── The one "can this actually reach the shopper?" predicate (033 R2) ───────────────────────────
//
// ⚠ READ THIS BEFORE USING ZoneForPostcode FOR A SERVICEABILITY ANSWER. It is not the same question,
// and for three features everyone believed it was.
//
// zone.go's comment says checkout and the storefront "cannot drift apart" because both call
// ZoneForPostcode. That was true of the DESTINATION term and only the destination term. Checkout
// requires three more before it will quote anything (checkout/quote.go): the shop's own postcode must
// resolve to a zone, an ACTIVE delivery_offering must exist on that origin→destination leg, and an
// ACTIVE delivery_pricing_rule must exist for the offered method — a method nobody has priced is not
// offered at all, rather than offered for nothing.
//
// So the two answers HAD already drifted, by three terms, while a comment asserted they could not.
// The symptom is exactly the one FR-014b was written to prevent: at the time of writing, zone REGIONAL
// contains 3350 (Ballarat) and 3550 (Bendigo) with ZERO active inbound offerings, so
// `GET /v1/storefront/serviceability?postcode=3350` answered {"serviced":true} while checkout could
// quote nothing. 031 found it, recorded it, and — bound by its own no-core-api-diff constraint —
// fixed it only in an admin health endpoint. The storefront kept lying.
//
// This file is that fix. It lives in `platform` for the same reason ZoneForPostcode does: neither
// feature owns the question, checkout must not import storefront, storefront must not import
// checkout, and whichever one held it would look like its owner.
//
// ── What is deliberately NOT a term, and why ────────────────────────────────────────────────────
//
//   - shop.status. NOTHING in the hot path reads it today — a suspended shop's products are still
//     sold by cart and by checkout. Adding it here would make this predicate STRICTER than the one
//     that actually takes the money, which replaces the disagreement being fixed with a new one
//     pointing the other way. Recorded as a carry-forward (033 R2), not silently fixed here.
//
//   - shop_sameday_declaration. Same-day is a separate promise. A shop with no same-day approval
//     still delivers standard, so joining it would refuse deliveries the platform can perform.
//
//   - delivery_area_decision. A `not_served` decision is written in the SAME transaction that removes
//     the postcode from its zone (migration 20260801184250), so zone membership already reflects it.
//     Joining it would double-count the same fact.

// purchasableSQL answers, for one product and one destination postcode, whether anything can actually
// carry that product to that address.
//
// The joins walk product → shop → the shop's postcode → its zone, then look for a live, priced leg to
// the destination zone. Index support is complete: delivery_zone_postcode.postcode is UNIQUE,
// delivery_offering_lookup_idx covers (origin_zone_id, destination_zone_id), and product is hit by PK.
//
// ⚠ EXISTS, not a count or a join to the outer row. A product may be reachable by several methods and
// we only care whether at least one survives all four terms; counting would invite someone to start
// treating "how many" as meaningful when the answer is a boolean.
const purchasableSQL = `
SELECT EXISTS (
    SELECT 1
      FROM public.product p
      JOIN public.shop sh
        ON sh.id = p.shop_id
      JOIN public.delivery_zone_postcode oz
        ON oz.postcode = sh.postcode
      JOIN public.delivery_offering o
        ON o.origin_zone_id = oz.zone_id
       AND o.destination_zone_id = $2
       AND o.status = 'active'
      JOIN public.delivery_pricing_rule r
        ON r.method = o.method
       AND r.status = 'active'
     WHERE p.id = $1
)`

// Purchasable reports whether the product can be delivered to the given destination zone.
//
// destZoneID is the zone the DESTINATION postcode resolves to — resolve it with ZoneForPostcode
// first, and treat "no zone" as not purchasable without calling this at all. Splitting it that way
// keeps the two failures distinguishable: "we do not deliver to your suburb" and "we do not deliver
// THIS PRODUCT to your suburb" are different sentences, and a shopper needs to know which one they
// are being told.
//
// ok=false is a normal answer, not an error. err is non-nil only when the lookup itself failed, and
// callers MUST keep the two apart — collapsing a failed read into "not deliverable" tells a
// prospective customer to leave because a database hiccuped.
func Purchasable(ctx context.Context, q RowQuerier, productID, destZoneID string) (ok bool, err error) {
	var deliverable bool
	if err := q.QueryRow(ctx, purchasableSQL, productID, destZoneID).Scan(&deliverable); err != nil {
		return false, fmt.Errorf("delivery: purchasable: %w", err)
	}
	return deliverable, nil
}

// anyPurchasableSQL answers whether ANY product at all can reach the destination zone.
//
// This is what a storefront serviceability badge actually means. "We deliver to your area" is a claim
// that something can be bought, not that a postcode appears in a table — and the second is what the
// storefront was checking.
//
// ⚠ It deliberately does NOT filter on product.status. Serviceability is a statement about DELIVERY
// REACH, not about today's catalogue: an area with live, priced legs is served even if every product
// happens to be out of stock this morning. Folding stock into this answer would make the storefront
// header flicker with the catalogue, and would tell a shopper to go away over a restock.
const anyPurchasableSQL = `
SELECT EXISTS (
    SELECT 1
      FROM public.delivery_offering o
      JOIN public.delivery_pricing_rule r
        ON r.method = o.method
       AND r.status = 'active'
     WHERE o.destination_zone_id = $1
       AND o.status = 'active'
)`

// ServiceableZone reports whether the destination zone has at least one live, priced inbound leg.
//
// ⚠ THIS IS THE PREDICATE THE STOREFRONT'S "do we deliver to you?" ANSWER SHOULD USE, and using
// ZoneForPostcode alone is the defect described at the top of this file. A postcode can sit in a zone
// that nothing reaches; answering "yes" there invites a shopper to fill a cart they can never pay for.
//
// It is deliberately weaker than Purchasable: it asks whether the AREA is reachable, not whether one
// particular product is. A shopper can be told "we deliver to Ballarat" truthfully while a specific
// product from a shop with no leg to Ballarat still cannot come.
func ServiceableZone(ctx context.Context, q RowQuerier, destZoneID string) (ok bool, err error) {
	var serviceable bool
	if err := q.QueryRow(ctx, anyPurchasableSQL, destZoneID).Scan(&serviceable); err != nil {
		return false, fmt.Errorf("delivery: serviceable zone: %w", err)
	}
	return serviceable, nil
}

// ServiceablePostcode is the whole storefront answer in one call: resolve the postcode, then ask
// whether anything reaches the zone it lands in.
//
// Both halves must hold. A postcode in no zone is undeliverable (FR-017); a postcode in a zone that
// nothing reaches is ALSO undeliverable, and that second case is the one the platform got wrong.
func ServiceablePostcode(ctx context.Context, q RowQuerier, postcode string) (ok bool, err error) {
	zoneID, inZone, err := ZoneForPostcode(ctx, q, postcode)
	if err != nil {
		return false, err
	}
	if !inZone {
		return false, nil
	}
	return ServiceableZone(ctx, q, zoneID)
}
