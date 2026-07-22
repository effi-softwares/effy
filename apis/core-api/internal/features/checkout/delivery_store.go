package checkout

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// ── QuoteStore implementation (021) ─────────────────────────────────────────────────────────────
// The delivery-quote read/write surface on pgStore: zone resolution, quote capture, and the
// per-package delivery writes that FinalizeSucceeded consumes into shop_fulfillment.

var _ QuoteStore = (*pgStore)(nil)

// DestinationZone resolves the customer's chosen address postcode to a delivery zone. ok=false means the
// address is in no serviced zone (the whole order is undeliverable there).
func (s *pgStore) DestinationZone(ctx context.Context, customerID, addressID string) (string, string, bool, error) {
	var postcode string
	err := s.pool.QueryRow(ctx,
		`SELECT postal_code FROM public.customer_address WHERE id = $1 AND customer_id = $2`,
		addressID, customerID).Scan(&postcode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", false, ErrAddressNotFound
		}
		return "", "", false, fmt.Errorf("checkout: dest postcode: %w", err)
	}
	var zoneID string
	err = s.pool.QueryRow(ctx,
		`SELECT zone_id::text FROM public.delivery_zone_postcode WHERE postcode = $1`, postcode).Scan(&zoneID)
	if errors.Is(err, pgx.ErrNoRows) {
		return postcode, "", false, nil // unserviceable destination
	}
	if err != nil {
		return "", "", false, fmt.Errorf("checkout: dest zone: %w", err)
	}
	return postcode, zoneID, true, nil
}

type legRow struct {
	ShopID      string  `db:"shop_id"`
	OriginZone  *string `db:"origin_zone_id"`
	Method      *string `db:"method"`
	PriceAmount *string `db:"price_amount"`
	LeadMin     *int    `db:"lead_days_min"`
	LeadMax     *int    `db:"lead_days_max"`
	Cutoff      *string `db:"same_day_cutoff"`
}

// Legs resolves each shop's origin zone (from its postcode) and the active offerings for
// (origin -> destZone). One row per (shop, offering); a shop with no origin zone yields one row with a
// NULL origin and no offering (OriginOK=false).
func (s *pgStore) Legs(ctx context.Context, shopIDs []string, destZoneID string) (map[string]Leg, error) {
	rows, err := s.pool.Query(ctx, `
SELECT sh.id::text AS shop_id,
       oz.zone_id::text AS origin_zone_id,
       o.method, o.price_amount::text AS price_amount,
       o.lead_days_min, o.lead_days_max,
       to_char(o.same_day_cutoff, 'HH24:MI') AS same_day_cutoff
FROM public.shop sh
LEFT JOIN public.delivery_zone_postcode oz ON oz.postcode = sh.postcode
LEFT JOIN public.delivery_offering o
       ON o.origin_zone_id = oz.zone_id
      AND o.destination_zone_id = $2
      AND o.status = 'active'
WHERE sh.id = ANY($1::uuid[])`, shopIDs, destZoneID)
	if err != nil {
		return nil, fmt.Errorf("checkout: legs: %w", err)
	}
	collected, err := pgx.CollectRows(rows, pgx.RowToStructByName[legRow])
	if err != nil {
		return nil, fmt.Errorf("checkout: scan legs: %w", err)
	}

	out := map[string]Leg{}
	for _, r := range collected {
		leg := out[r.ShopID]
		leg.ShopID = r.ShopID
		if r.OriginZone != nil {
			leg.OriginOK = true
		}
		if r.Method != nil && r.PriceAmount != nil {
			cents, perr := money.ParseCents(*r.PriceAmount)
			if perr != nil {
				return nil, fmt.Errorf("checkout: offering price: %w", perr)
			}
			off := delivery.Offering{
				Method:      delivery.Method(*r.Method),
				PriceCents:  cents,
				LeadDaysMin: derefInt(r.LeadMin),
				LeadDaysMax: derefInt(r.LeadMax),
			}
			if r.Cutoff != nil {
				if t, terr := time.Parse("15:04", *r.Cutoff); terr == nil {
					off.SameDayCutoff = &t
				}
			}
			leg.Offerings = append(leg.Offerings, off)
		}
		out[r.ShopID] = leg
	}
	return out, nil
}

// CaptureQuote upserts the customer's single pending order (item snapshot + address) and stores the
// captured quote + expiry, so intent can honor the shown fees (SC-004). Mirrors UpsertPendingOrder's
// pending-order reuse; delivery_fee is 0 until the customer selects (set by WritePackageDeliveries).
func (s *pgStore) CaptureQuote(ctx context.Context, customerID string, addressJSON []byte, lines []CheckoutLine, cq CapturedQuote) (string, string, error) {
	quoteJSON, err := marshalQuote(cq)
	if err != nil {
		return "", "", fmt.Errorf("checkout: marshal quote: %w", err)
	}
	var itemSubtotal int64
	for _, l := range lines {
		itemSubtotal += l.UnitCents * int64(l.Quantity)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", fmt.Errorf("checkout: begin quote: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var orderID, orderNumber string
	err = tx.QueryRow(ctx, `SELECT id::text, order_number FROM public."order" WHERE customer_id = $1 AND status = 'pending_payment' LIMIT 1`, customerID).
		Scan(&orderID, &orderNumber)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		orderNumber = genOrderNumber()
		if err := tx.QueryRow(ctx, `
INSERT INTO public."order"
    (customer_id, order_number, status, currency, item_subtotal_amount, delivery_fee_amount, grand_total_amount,
     delivery_address, delivery_quote, delivery_quote_expires_at)
VALUES ($1, $2, 'pending_payment', 'AUD', $3::numeric, 0, $3::numeric, $4::jsonb, $5::jsonb, $6)
RETURNING id::text`,
			customerID, orderNumber, money.FormatCents(itemSubtotal), string(addressJSON), string(quoteJSON), cq.ExpiresAt).Scan(&orderID); err != nil {
			return "", "", fmt.Errorf("checkout: insert order (quote): %w", err)
		}
	case err != nil:
		return "", "", fmt.Errorf("checkout: find pending (quote): %w", err)
	default:
		if _, err := tx.Exec(ctx, `
UPDATE public."order" SET item_subtotal_amount=$2::numeric, grand_total_amount=$2::numeric,
    delivery_address=$3::jsonb, delivery_quote=$4::jsonb, delivery_quote_expires_at=$5, updated_at=now()
WHERE id=$1`, orderID, money.FormatCents(itemSubtotal), string(addressJSON), string(quoteJSON), cq.ExpiresAt); err != nil {
			return "", "", fmt.Errorf("checkout: update order (quote): %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM public.order_item WHERE order_id = $1`, orderID); err != nil {
			return "", "", fmt.Errorf("checkout: clear items (quote): %w", err)
		}
	}

	for _, l := range lines {
		lineCents := l.UnitCents * int64(l.Quantity)
		if _, err := tx.Exec(ctx, `
INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric)`,
			orderID, l.ProductID, l.ShopID, l.Name, money.FormatCents(l.UnitCents), l.Quantity, money.FormatCents(lineCents)); err != nil {
			return "", "", fmt.Errorf("checkout: insert item (quote): %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return "", "", fmt.Errorf("checkout: commit quote: %w", err)
	}
	return orderID, orderNumber, nil
}

// ReadCapturedQuote reads the captured quote from the customer's pending order.
func (s *pgStore) ReadCapturedQuote(ctx context.Context, customerID string) (CapturedQuote, string, string, bool, error) {
	var orderID, orderNumber string
	var quoteJSON []byte
	err := s.pool.QueryRow(ctx, `
SELECT id::text, order_number, delivery_quote
FROM public."order" WHERE customer_id = $1 AND status = 'pending_payment' LIMIT 1`, customerID).
		Scan(&orderID, &orderNumber, &quoteJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return CapturedQuote{}, "", "", false, nil
	}
	if err != nil {
		return CapturedQuote{}, "", "", false, fmt.Errorf("checkout: read quote: %w", err)
	}
	cq, err := unmarshalQuote(quoteJSON)
	if err != nil {
		return CapturedQuote{}, "", "", false, fmt.Errorf("checkout: unmarshal quote: %w", err)
	}
	return cq, orderID, orderNumber, len(cq.Packages) > 0, nil
}

// WritePackageDeliveries replaces the order's per-package deliveries (delete+reinsert) and sets the
// order's summed delivery fee + grand total + quote expiry. Consumed by FinalizeSucceeded.
func (s *pgStore) WritePackageDeliveries(ctx context.Context, orderID string, rows []PackageDelivery, itemSubtotalCents, deliveryFeeCents int64, expiresAt time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("checkout: begin deliveries: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM public.order_package_delivery WHERE order_id = $1`, orderID); err != nil {
		return fmt.Errorf("checkout: clear deliveries: %w", err)
	}
	for _, r := range rows {
		var sched any
		if r.ScheduledDate != nil {
			sched = *r.ScheduledDate
		}
		if _, err := tx.Exec(ctx, `
INSERT INTO public.order_package_delivery
    (order_id, shop_id, service_level, method, delivery_fee_amount, promised_ready_at, scheduled_date)
VALUES ($1, $2, $3, $4, $5::numeric, $6, $7)`,
			orderID, r.ShopID, r.ServiceLevel, r.Method, money.FormatCents(r.FeeCents), r.PromisedReadyAt, sched); err != nil {
			return fmt.Errorf("checkout: insert delivery: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `
UPDATE public."order" SET item_subtotal_amount=$2::numeric, delivery_fee_amount=$3::numeric,
    grand_total_amount=$4::numeric, delivery_quote_expires_at=$5, updated_at=now() WHERE id=$1`,
		orderID, money.FormatCents(itemSubtotalCents), money.FormatCents(deliveryFeeCents),
		money.FormatCents(itemSubtotalCents+deliveryFeeCents), expiresAt); err != nil {
		return fmt.Errorf("checkout: update order totals: %w", err)
	}
	// Any order_item for an excluded shop must not be charged/placed: remove lines whose shop has no
	// delivery row (i.e. was set aside).
	if _, err := tx.Exec(ctx, `
DELETE FROM public.order_item oi
WHERE oi.order_id = $1
  AND NOT EXISTS (SELECT 1 FROM public.order_package_delivery opd
                  WHERE opd.order_id = oi.order_id AND opd.shop_id = oi.shop_id)`, orderID); err != nil {
		return fmt.Errorf("checkout: drop excluded items: %w", err)
	}

	return tx.Commit(ctx)
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}
