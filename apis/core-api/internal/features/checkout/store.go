package checkout

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/events"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// CheckoutLine is a payable cart line resolved for checkout (active products only). Amounts in cents.
type CheckoutLine struct {
	ProductID string
	ShopID    string
	Name      string
	UnitCents int64
	Quantity  int
}

// ShopPortion is one shop's slice of the fan-out (for the outbox payload / SC-005).
type ShopPortion struct {
	ShopID        string `json:"shopId"`
	ItemCount     int    `json:"itemCount"`
	SubtotalCents int64  `json:"-"`
	Subtotal      string `json:"subtotal"`
}

// Store is the checkout persistence seam. The service depends on it; a fake implements it in tests, so
// the amount-authority and idempotency logic is testable without a DB. The concrete pgStore owns the
// transactional paid-transition (fan-out + outbox + empty cart in one tx).
type Store interface {
	// CartLines returns the customer's payable (active) cart lines.
	CartLines(ctx context.Context, customerID string) ([]CheckoutLine, error)
	// AddressSnapshot returns the JSON snapshot of an address scoped to the customer; found=false if absent.
	AddressSnapshot(ctx context.Context, customerID, addressID string) ([]byte, bool, error)
	// UpsertPendingOrder locates/creates the single pending order, sets amounts + address snapshot, and
	// replaces its order_items (the intent-time snapshot that fixes the charge amount).
	UpsertPendingOrder(ctx context.Context, customerID string, amounts OrderAmounts, addressJSON []byte, lines []CheckoutLine) (orderID, orderNumber string, err error)
	// SetOrderBilling sets the order's billing_address snapshot (023). A nil billingJSON writes NULL —
	// "billing is the same as shipping" (FR-009); a value is a divergent, immutable billing snapshot.
	// Idempotent: called on every intent, so toggling "same as shipping" back ON clears a prior value.
	SetOrderBilling(ctx context.Context, orderID string, billingJSON []byte) error
	// UpsertPayment records/updates the payment (one per order) with the intent id + status.
	UpsertPayment(ctx context.Context, orderID, intentID string, amountCents int64, status string) error
	// FindOrderByIntent resolves a PaymentIntent id to its order.
	FindOrderByIntent(ctx context.Context, intentID string) (orderID string, found bool, err error)
	// MarkEventSeen records a Stripe event id; firstTime=false means it was already processed (dedup, R5 #3).
	MarkEventSeen(ctx context.Context, eventID, eventType string) (firstTime bool, err error)
	// OrderIntentForCustomer returns the order's PaymentIntent id scoped to the owner (confirm fallback).
	OrderIntentForCustomer(ctx context.Context, customerID, orderID string) (intentID string, found bool, err error)
	// FinalizeSucceeded runs the idempotent paid-transition in ONE tx (mark paid + fan-out + outbox +
	// payment succeeded + empty cart). applied=false when the order was not pending (already finalized).
	FinalizeSucceeded(ctx context.Context, orderID string) (applied bool, err error)
	// FinalizeFailed marks the order + payment failed (no fan-out, no outbox, cart preserved).
	FinalizeFailed(ctx context.Context, orderID string) error
}

// OrderAmounts carries the server-computed totals (cents).
type OrderAmounts struct {
	ItemSubtotalCents int64
	DeliveryFeeCents  int64
	GrandTotalCents   int64
	Currency          string
}

// pgStore is the Postgres Store.
type pgStore struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) Store {
	return &pgStore{pool: pool}
}

type checkoutLineRow struct {
	ProductID string `db:"product_id"`
	ShopID    string `db:"shop_id"`
	Name      string `db:"name"`
	UnitPrice string `db:"unit_price_amount"`
	Quantity  int    `db:"quantity"`
}

func (s *pgStore) CartLines(ctx context.Context, customerID string) ([]CheckoutLine, error) {
	rows, err := s.pool.Query(ctx, `
SELECT ci.product_id::text AS product_id,
       p.shop_id::text     AS shop_id,
       p.name              AS name,
       p.price_amount::text AS unit_price_amount,
       ci.quantity         AS quantity
FROM public.cart c
JOIN public.cart_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id
WHERE c.customer_id = $1 AND p.status = 'active'
ORDER BY ci.added_at ASC`, customerID)
	if err != nil {
		return nil, fmt.Errorf("checkout: cart lines: %w", err)
	}
	raw, err := pgx.CollectRows(rows, pgx.RowToStructByName[checkoutLineRow])
	if err != nil {
		return nil, fmt.Errorf("checkout: scan cart lines: %w", err)
	}
	out := make([]CheckoutLine, 0, len(raw))
	for _, r := range raw {
		cents, perr := money.ParseCents(r.UnitPrice)
		if perr != nil {
			return nil, perr
		}
		out = append(out, CheckoutLine{ProductID: r.ProductID, ShopID: r.ShopID, Name: r.Name, UnitCents: cents, Quantity: r.Quantity})
	}
	return out, nil
}

func (s *pgStore) AddressSnapshot(ctx context.Context, customerID, addressID string) ([]byte, bool, error) {
	rows, err := s.pool.Query(ctx, `
SELECT jsonb_build_object(
    'recipientName', recipient_name, 'phone', phone, 'line1', line1, 'line2', line2,
    'city', city, 'region', region, 'postalCode', postal_code, 'country', country
)::text
FROM public.customer_address WHERE id = $1 AND customer_id = $2`, addressID, customerID)
	if err != nil {
		return nil, false, fmt.Errorf("checkout: address snapshot: %w", err)
	}
	snap, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[string])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("checkout: scan address: %w", err)
	}
	return []byte(snap), true, nil
}

// SetOrderBilling writes the order's billing snapshot; nil → NULL ("same as shipping", 023 FR-009).
func (s *pgStore) SetOrderBilling(ctx context.Context, orderID string, billingJSON []byte) error {
	var arg any // nil → NULL::jsonb
	if billingJSON != nil {
		arg = string(billingJSON)
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE public."order" SET billing_address = $2::jsonb, updated_at = now() WHERE id = $1`,
		orderID, arg); err != nil {
		return fmt.Errorf("checkout: set order billing: %w", err)
	}
	return nil
}

func (s *pgStore) UpsertPendingOrder(ctx context.Context, customerID string, amounts OrderAmounts, addressJSON []byte, lines []CheckoutLine) (string, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", fmt.Errorf("checkout: begin: %w", err)
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
    (customer_id, order_number, status, currency, item_subtotal_amount, delivery_fee_amount, grand_total_amount, delivery_address)
VALUES ($1, $2, 'pending_payment', $3, $4::numeric, $5::numeric, $6::numeric, $7::jsonb)
RETURNING id::text`,
			customerID, orderNumber, amounts.Currency,
			money.FormatCents(amounts.ItemSubtotalCents), money.FormatCents(amounts.DeliveryFeeCents),
			money.FormatCents(amounts.GrandTotalCents), string(addressJSON)).Scan(&orderID); err != nil {
			return "", "", fmt.Errorf("checkout: insert order: %w", err)
		}
	case err != nil:
		return "", "", fmt.Errorf("checkout: find pending order: %w", err)
	default:
		if _, err := tx.Exec(ctx, `
UPDATE public."order" SET item_subtotal_amount=$2::numeric, delivery_fee_amount=$3::numeric,
    grand_total_amount=$4::numeric, delivery_address=$5::jsonb, updated_at=now() WHERE id=$1`,
			orderID, money.FormatCents(amounts.ItemSubtotalCents), money.FormatCents(amounts.DeliveryFeeCents),
			money.FormatCents(amounts.GrandTotalCents), string(addressJSON)); err != nil {
			return "", "", fmt.Errorf("checkout: update order: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM public.order_item WHERE order_id = $1`, orderID); err != nil {
			return "", "", fmt.Errorf("checkout: clear order items: %w", err)
		}
	}

	for _, l := range lines {
		lineCents := l.UnitCents * int64(l.Quantity)
		if _, err := tx.Exec(ctx, `
INSERT INTO public.order_item
    (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric)`,
			orderID, l.ProductID, l.ShopID, l.Name, money.FormatCents(l.UnitCents), l.Quantity, money.FormatCents(lineCents)); err != nil {
			return "", "", fmt.Errorf("checkout: insert order item: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return "", "", fmt.Errorf("checkout: commit order: %w", err)
	}
	return orderID, orderNumber, nil
}

func (s *pgStore) UpsertPayment(ctx context.Context, orderID, intentID string, amountCents int64, status string) error {
	_, err := s.pool.Exec(ctx, `
INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status)
VALUES ($1, 'stripe', $2, $3::numeric, 'AUD', $4)
ON CONFLICT (order_id) DO UPDATE SET stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    amount = EXCLUDED.amount, status = EXCLUDED.status, updated_at = now()`,
		orderID, intentID, money.FormatCents(amountCents), status)
	if err != nil {
		return fmt.Errorf("checkout: upsert payment: %w", err)
	}
	return nil
}

func (s *pgStore) FindOrderByIntent(ctx context.Context, intentID string) (string, bool, error) {
	rows, err := s.pool.Query(ctx, `SELECT order_id::text FROM public.payment WHERE stripe_payment_intent_id = $1`, intentID)
	if err != nil {
		return "", false, fmt.Errorf("checkout: find order by intent: %w", err)
	}
	orderID, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[string])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("checkout: scan order by intent: %w", err)
	}
	return orderID, true, nil
}

func (s *pgStore) MarkEventSeen(ctx context.Context, eventID, eventType string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `INSERT INTO public.stripe_event (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`, eventID, eventType)
	if err != nil {
		return false, fmt.Errorf("checkout: mark event seen: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (s *pgStore) OrderIntentForCustomer(ctx context.Context, customerID, orderID string) (string, bool, error) {
	rows, err := s.pool.Query(ctx, `
SELECT pay.stripe_payment_intent_id
FROM public."order" o JOIN public.payment pay ON pay.order_id = o.id
WHERE o.id = $1 AND o.customer_id = $2 AND pay.stripe_payment_intent_id IS NOT NULL`, orderID, customerID)
	if err != nil {
		return "", false, fmt.Errorf("checkout: order intent: %w", err)
	}
	intentID, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[string])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("checkout: scan order intent: %w", err)
	}
	return intentID, true, nil
}

// FinalizeSucceeded is the idempotent paid-transition (R5 #2/#3, SC-005/006), all in ONE tx.
func (s *pgStore) FinalizeSucceeded(ctx context.Context, orderID string) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("checkout: begin finalize: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// 1. Status-guarded transition — 0 rows means already finalized (idempotent no-op).
	tag, err := tx.Exec(ctx, `UPDATE public."order" SET status='paid', placed_at=now() WHERE id=$1 AND status='pending_payment'`, orderID)
	if err != nil {
		return false, fmt.Errorf("checkout: mark paid: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return false, nil
	}

	// 2. Fan-out — one shop_fulfillment per distinct order_item.shop_id (item_count = Σ quantity).
	if _, err := tx.Exec(ctx, `
INSERT INTO public.shop_fulfillment
    (order_id, shop_id, item_count, subtotal_amount,
     delivery_service_level, delivery_method, delivery_fee_amount, promised_ready_at)
SELECT oi.order_id, oi.shop_id, SUM(oi.quantity)::int, SUM(oi.line_subtotal_amount),
       opd.service_level, opd.method, opd.delivery_fee_amount, opd.promised_ready_at
FROM public.order_item oi
JOIN public.order_package_delivery opd
     ON opd.order_id = oi.order_id AND opd.shop_id = oi.shop_id
WHERE oi.order_id = $1
GROUP BY oi.order_id, oi.shop_id, opd.service_level, opd.method, opd.delivery_fee_amount, opd.promised_ready_at
ON CONFLICT (order_id, shop_id) DO NOTHING`, orderID); err != nil {
		return false, fmt.Errorf("checkout: fan-out: %w", err)
	}

	// 3. Outbox — one order.placed with the per-shop breakdown (dedup_key makes it exactly-once).
	portions, err := shopBreakdownTx(ctx, tx, orderID)
	if err != nil {
		return false, err
	}
	number, currency, grand, err := orderMetaTx(ctx, tx, orderID)
	if err != nil {
		return false, err
	}
	if err := events.Append(ctx, tx, events.Envelope{
		EventType:     "order.placed",
		DedupKey:      "order.placed:" + orderID,
		AggregateType: "order",
		AggregateID:   orderID,
		Payload: map[string]any{
			"orderId": orderID, "orderNumber": number, "currency": currency,
			"grandTotal": money.FormatCents(grand), "shops": portions,
		},
	}); err != nil {
		return false, err
	}

	// 4. Payment succeeded.
	if _, err := tx.Exec(ctx, `UPDATE public.payment SET status='succeeded', updated_at=now() WHERE order_id=$1`, orderID); err != nil {
		return false, fmt.Errorf("checkout: payment succeeded: %w", err)
	}

	// 5. Empty the customer's cart.
	if _, err := tx.Exec(ctx, `
DELETE FROM public.cart_item WHERE cart_id = (
    SELECT c.id FROM public.cart c JOIN public."order" o ON o.customer_id = c.customer_id WHERE o.id = $1
)`, orderID); err != nil {
		return false, fmt.Errorf("checkout: empty cart: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("checkout: commit finalize: %w", err)
	}
	return true, nil
}

func (s *pgStore) FinalizeFailed(ctx context.Context, orderID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("checkout: begin fail: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `UPDATE public."order" SET status='failed', updated_at=now() WHERE id=$1 AND status='pending_payment'`, orderID); err != nil {
		return fmt.Errorf("checkout: mark failed: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE public.payment SET status='failed', updated_at=now() WHERE order_id=$1`, orderID); err != nil {
		return fmt.Errorf("checkout: payment failed: %w", err)
	}
	return tx.Commit(ctx)
}

func shopBreakdownTx(ctx context.Context, tx pgx.Tx, orderID string) ([]ShopPortion, error) {
	rows, err := tx.Query(ctx, `
SELECT shop_id::text, item_count, subtotal_amount::text
FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY shop_id`, orderID)
	if err != nil {
		return nil, fmt.Errorf("checkout: shop breakdown: %w", err)
	}
	defer rows.Close()
	var out []ShopPortion
	for rows.Next() {
		var p ShopPortion
		if err := rows.Scan(&p.ShopID, &p.ItemCount, &p.Subtotal); err != nil {
			return nil, fmt.Errorf("checkout: scan breakdown: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func orderMetaTx(ctx context.Context, tx pgx.Tx, orderID string) (string, string, int64, error) {
	var number, currency, grandText string
	err := tx.QueryRow(ctx, `SELECT order_number, currency, grand_total_amount::text FROM public."order" WHERE id=$1`, orderID).
		Scan(&number, &currency, &grandText)
	if err != nil {
		return "", "", 0, fmt.Errorf("checkout: order meta: %w", err)
	}
	cents, err := money.ParseCents(grandText)
	if err != nil {
		return "", "", 0, err
	}
	return number, currency, cents, nil
}

// genOrderNumber mints a short human-facing reference, e.g. EFY-2G7K9Q (Crockford-ish base32, no
// ambiguous chars). crypto/rand — collisions are astronomically unlikely and the UNIQUE column catches any.
func genOrderNumber() string {
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	out := make([]byte, 6)
	for i, v := range b {
		out[i] = alphabet[int(v)%len(alphabet)]
	}
	return "EFY-" + string(out)
}
