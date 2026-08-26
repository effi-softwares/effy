package checkout

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/effyshopping/effy/apis/core-api/internal/features/notifications"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/events"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// CheckoutLine is a payable cart line resolved for checkout (active products only). Amounts in cents.
type CheckoutLine struct {
	ProductID   string
	ShopID      string
	Name        string
	UnitCents   int64
	Quantity    int
	WeightGrams int // 047: per-unit logistics weight; the package weight is Σ(WeightGrams × Quantity) per shop.
}

// PackageDelivery is the captured per-package delivery outcome, written at intent and copied into
// shop_fulfillment at finalize (047). PromisedFrom/To are nil for US1 (the window arrives with same-day).
type PackageDelivery struct {
	ShopID       string
	Method       string
	FeeCents     int64
	PromisedFrom *time.Time
	PromisedTo   *time.Time
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
	// UpsertPendingOrder locates/creates the pending order, sets amounts + address snapshot, and
	// replaces its order_items (the intent-time snapshot that fixes the charge amount).
	//
	// ⚠ `reusePending` IS A SAFETY DECISION, AND IT IS NOT THE STORE'S TO MAKE. Recycling the customer's
	// open order is right only while that order's payment attempt is still LIVE; recycling one whose
	// intent has already settled is what makes a second checkout resolve to the FIRST one's payment.
	// Only the service can decide, because only the provider knows. See `mayReusePendingOrder`.
	UpsertPendingOrder(ctx context.Context, customerID string, amounts OrderAmounts, addressJSON []byte, lines []CheckoutLine, reusePending bool) (orderID, orderNumber string, err error)
	// SetOrderBilling sets the order's billing_address snapshot (023). A nil billingJSON writes NULL —
	// "billing is the same as shipping" (FR-009); a value is a divergent, immutable billing snapshot.
	// Idempotent: called on every intent, so toggling "same as shipping" back ON clears a prior value.
	SetOrderBilling(ctx context.Context, orderID string, billingJSON []byte) error
	// CaptureDelivery writes the captured per-package delivery quote (047): the order's delivery_quote JSON
	// + expiry and a fresh set of order_package_delivery rows (delete+reinsert, like order_item). Called on
	// every intent so a re-quote overwrites cleanly. The client never sends a fee — this is the server's.
	CaptureDelivery(ctx context.Context, orderID string, quoteJSON []byte, expiresAt time.Time, pkgs []PackageDelivery) error
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

	// SavePaymentMethod records how an order was paid, for the receipt (052 FR-006). Called AFTER
	// FinalizeSucceeded has committed — never inside it (see checkout.Service.capturePaymentMethod).
	SavePaymentMethod(ctx context.Context, orderID string, m PaymentMethodSummary) error

	// ── 051 ──────────────────────────────────────────────────────────────────────────────────────

	// PaymentProfile returns what the provider needs to identify this shopper: the reference already
	// stored (empty when they have never paid), plus the platform's own email and display name.
	//
	// ⚠ The email and name come from the PLATFORM RECORD, never from a token claim or a request body —
	// they are what the provider will show on a receipt, and a client must not be able to set them.
	PaymentProfile(ctx context.Context, customerID string) (providerCustomerID, email, name string, err error)

	// SetProviderCustomerID persists the reference. Idempotent: writing the same value twice is a no-op,
	// which is what keeps a retried intent from tripping the UNIQUE constraint.
	SetProviderCustomerID(ctx context.Context, customerID, providerCustomerID string) error

	// PendingOrderIntent returns the customer's lingering `pending_payment` order and the provider
	// intent recorded against it, if any. Used to settle an order that was paid without the database
	// ever being told — see `settleStalePendingOrder`.
	PendingOrderIntent(ctx context.Context, customerID string) (orderID, intentID string, found bool, err error)
}

// OrderDiscount is the platform's own discount computation at the moment of payment (027 FR-049). Carried
// as a value rather than three loose parameters so a caller cannot pass an amount without the code that
// justifies it — an unexplainable discount on a receipt is worse than none.
type OrderDiscount struct {
	Cents       int64
	PromoCodeID string // "" when no code was used
	Code        string // the literal text, denormalised so the receipt can still name it
}

// OrderAmounts carries the server-computed totals (cents).
type OrderAmounts struct {
	ItemSubtotalCents int64
	DeliveryFeeCents  int64
	// 027: the platform's own discount computation at the moment of payment. Stored on the order so a
	// receipt stays explainable years later, even if the code has since been changed or disabled (FR-049).
	DiscountCents   int64
	PromoCodeID     string // "" when no code was used
	PromoCode       string // the literal text, denormalised so the receipt can still name it
	GrandTotalCents int64
	Currency        string
}

// pgStore is the Postgres Store.
type pgStore struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) Store {
	return &pgStore{pool: pool}
}

type checkoutLineRow struct {
	ProductID   string `db:"product_id"`
	ShopID      string `db:"shop_id"`
	Name        string `db:"name"`
	UnitPrice   string `db:"unit_price_amount"`
	Quantity    int    `db:"quantity"`
	WeightGrams int    `db:"weight_grams"`
}

func (s *pgStore) CartLines(ctx context.Context, customerID string) ([]CheckoutLine, error) {
	rows, err := s.pool.Query(ctx, `
SELECT ci.product_id::text AS product_id,
       p.shop_id::text     AS shop_id,
       p.name              AS name,
       p.price_amount::text AS unit_price_amount,
       ci.quantity         AS quantity,
       p.weight_grams      AS weight_grams
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
		out = append(out, CheckoutLine{
			ProductID: r.ProductID, ShopID: r.ShopID, Name: r.Name,
			UnitCents: cents, Quantity: r.Quantity, WeightGrams: r.WeightGrams,
		})
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

// PaymentProfile reads the provider reference plus the platform's own contact fields (051).
func (s *pgStore) PaymentProfile(ctx context.Context, customerID string) (string, string, string, error) {
	// ⚠ THE NAME IS TWO COLUMNS, NOT ONE. `public.customer.display_name` was DROPPED by
	// `20260715090000_customer_name_parts.sql` and replaced with `given_name` + `family_name`, because a
	// single free-text name cannot be split back into parts reliably. Selecting the old column compiled
	// fine, passed every test (the fakes return strings, and the container tests build their own table),
	// and failed only against the real schema — as `column "display_name" does not exist`, which 500s
	// EVERY checkout intent, not just the saving of a card.
	//
	// `NULLIF(TRIM(...), '')` collapses "no name at all" to the empty string rather than to a stray
	// space, and COALESCE turns that back into '' — the provider must be given a real name or none.
	rows, err := s.pool.Query(ctx, `
SELECT COALESCE(stripe_customer_id, ''),
       COALESCE(email::text, ''),
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', given_name, family_name)), ''), '')
FROM public.customer WHERE id = $1`, customerID)
	if err != nil {
		return "", "", "", fmt.Errorf("checkout: payment profile: %w", err)
	}
	type row struct {
		Provider string
		Email    string
		Name     string
	}
	r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[row])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", "", nil
		}
		return "", "", "", fmt.Errorf("checkout: scan payment profile: %w", err)
	}
	return r.Provider, r.Email, r.Name, nil
}

// SetProviderCustomerID persists the provider reference (051).
//
// ⚠ `WHERE stripe_customer_id IS NULL` is load-bearing, not defensive. Two concurrent first-payments for
// one shopper would otherwise race to overwrite each other, and the loser's provider customer — the one
// its PaymentIntent was created against — would be stranded with its cards unreachable. First write wins;
// the caller re-reads.
func (s *pgStore) SetProviderCustomerID(ctx context.Context, customerID, providerCustomerID string) error {
	if _, err := s.pool.Exec(ctx,
		`UPDATE public.customer SET stripe_customer_id = $2, updated_at = now()
		 WHERE id = $1 AND stripe_customer_id IS NULL`,
		customerID, providerCustomerID); err != nil {
		return fmt.Errorf("checkout: set provider customer id: %w", err)
	}
	return nil
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

func (s *pgStore) UpsertPendingOrder(ctx context.Context, customerID string, amounts OrderAmounts, addressJSON []byte, lines []CheckoutLine, reusePending bool) (string, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", fmt.Errorf("checkout: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var orderID, orderNumber string
	// No reuse ⇒ take the insert branch, exactly as if the customer had no open order.
	err = pgx.ErrNoRows
	if reusePending {
		// ⚠ `ORDER BY created_at DESC` is load-bearing now that a customer CAN hold more than one
		// pending order: a row that could not be safely recycled is left behind rather than reused, so
		// "the pending order" is no longer unique and a bare `LIMIT 1` is a coin toss between rows.
		//
		// ⚠ `FOR UPDATE` serialises two concurrent checkouts for one shopper. Without it both read the
		// same row and both rewrite its items, and which basket survives is a race.
		err = tx.QueryRow(ctx, `
SELECT id::text, order_number FROM public."order"
WHERE customer_id = $1 AND status = 'pending_payment'
ORDER BY created_at DESC
LIMIT 1
FOR UPDATE`, customerID).
			Scan(&orderID, &orderNumber)
	}
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		orderNumber = genOrderNumber()
		if err := tx.QueryRow(ctx, `
INSERT INTO public."order"
    (customer_id, order_number, status, currency, item_subtotal_amount,
     discount_amount, promo_code_id, promo_code, grand_total_amount, delivery_address, delivery_fee_amount)
VALUES ($1, $2, 'pending_payment', $3, $4::numeric,
        $7::numeric, NULLIF($8, '')::uuid, NULLIF($9, ''), $5::numeric, $6::jsonb, $10::numeric)
RETURNING id::text`,
			customerID, orderNumber, amounts.Currency,
			money.FormatCents(amounts.ItemSubtotalCents),
			money.FormatCents(amounts.GrandTotalCents), string(addressJSON),
			money.FormatCents(amounts.DiscountCents), amounts.PromoCodeID, amounts.PromoCode,
			money.FormatCents(amounts.DeliveryFeeCents)).Scan(&orderID); err != nil {
			return "", "", fmt.Errorf("checkout: insert order: %w", err)
		}
	case err != nil:
		return "", "", fmt.Errorf("checkout: find pending order: %w", err)
	default:
		if _, err := tx.Exec(ctx, `
UPDATE public."order" SET item_subtotal_amount=$2::numeric,
    grand_total_amount=$3::numeric, delivery_address=$4::jsonb,
    discount_amount=$5::numeric, promo_code_id=NULLIF($6, '')::uuid, promo_code=NULLIF($7, ''),
    delivery_fee_amount=$8::numeric,
    updated_at=now() WHERE id=$1`,
			orderID, money.FormatCents(amounts.ItemSubtotalCents),
			money.FormatCents(amounts.GrandTotalCents), string(addressJSON),
			money.FormatCents(amounts.DiscountCents), amounts.PromoCodeID, amounts.PromoCode,
			money.FormatCents(amounts.DeliveryFeeCents)); err != nil {
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

// CaptureDelivery writes the captured delivery quote (047): the order's delivery_quote JSON + expiry, and
// a fresh set of order_package_delivery rows (delete+reinsert, mirroring order_item's intent-time
// lifecycle). All in one tx. The fee is always the SERVER's — the client never supplies one (FR-036).
func (s *pgStore) CaptureDelivery(ctx context.Context, orderID string, quoteJSON []byte, expiresAt time.Time, pkgs []PackageDelivery) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("checkout: begin capture delivery: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
UPDATE public."order" SET delivery_quote = $2::jsonb, delivery_quote_expires_at = $3, updated_at = now()
WHERE id = $1`, orderID, string(quoteJSON), expiresAt); err != nil {
		return fmt.Errorf("checkout: set delivery quote: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM public.order_package_delivery WHERE order_id = $1`, orderID); err != nil {
		return fmt.Errorf("checkout: clear package delivery: %w", err)
	}
	for _, p := range pkgs {
		if _, err := tx.Exec(ctx, `
INSERT INTO public.order_package_delivery
    (order_id, shop_id, method, delivery_fee_amount, promised_from, promised_to)
VALUES ($1, $2, $3, $4::numeric, $5, $6)`,
			orderID, p.ShopID, p.Method, money.FormatCents(p.FeeCents), p.PromisedFrom, p.PromisedTo); err != nil {
			return fmt.Errorf("checkout: insert package delivery: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("checkout: commit capture delivery: %w", err)
	}
	return nil
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

// PendingOrderIntent reads the customer's lingering pending order and its recorded intent.
//
// ⚠ IT RETURNS THE NEWEST, because a customer can hold MORE than one pending order. A row that could
// not be safely recycled is left behind by design — an abandoned pending order is harmless and
// sweepable, a wrongly-recycled one charges for the wrong thing — so "the pending order" is the latest.
//
// The intent may be absent (an order whose intent creation failed still exists). That is reported as
// found=false rather than as an error: there is nothing to settle, and nothing that can collide.
func (s *pgStore) PendingOrderIntent(ctx context.Context, customerID string) (string, string, bool, error) {
	rows, err := s.pool.Query(ctx, `
SELECT o.id::text, COALESCE(pay.stripe_payment_intent_id, '')
FROM public."order" o
LEFT JOIN public.payment pay ON pay.order_id = o.id
WHERE o.customer_id = $1 AND o.status = 'pending_payment'
ORDER BY o.created_at DESC
LIMIT 1`, customerID)
	if err != nil {
		return "", "", false, fmt.Errorf("checkout: pending order intent: %w", err)
	}
	type row struct {
		OrderID  string
		IntentID string
	}
	r, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[row])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", false, nil
		}
		return "", "", false, fmt.Errorf("checkout: scan pending order intent: %w", err)
	}
	if r.IntentID == "" {
		return r.OrderID, "", false, nil
	}
	return r.OrderID, r.IntentID, true, nil
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
    (order_id, shop_id, item_count, subtotal_amount)
SELECT oi.order_id, oi.shop_id, SUM(oi.quantity)::int, SUM(oi.line_subtotal_amount)
FROM public.order_item oi
WHERE oi.order_id = $1
GROUP BY oi.order_id, oi.shop_id
ON CONFLICT (order_id, shop_id) DO NOTHING`, orderID); err != nil {
		return false, fmt.Errorf("checkout: fan-out: %w", err)
	}

	// 2b. Copy the captured per-package delivery (047) onto each fulfilment. Absent for pre-047 orders
	// (no order_package_delivery rows) → columns stay NULL, which is valid. ⚠ delivery_fee_amount is
	// NEVER shown to the shop; it is recorded for the customer receipt and future payout slices.
	if _, err := tx.Exec(ctx, `
UPDATE public.shop_fulfillment sf
SET delivery_method     = opd.method,
    delivery_fee_amount = opd.delivery_fee_amount,
    promised_ready_at   = opd.promised_to,
    updated_at          = now()
FROM public.order_package_delivery opd
WHERE opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id AND sf.order_id = $1`, orderID); err != nil {
		return false, fmt.Errorf("checkout: copy package delivery: %w", err)
	}

	// 2c. Push intents — one shop_new_order per active staff member of each fulfilling shop (050).
	// The fan-out that creates shop_fulfillment lives here, so the "new order to pick" intent does too.
	// One row per (staff sub, fulfilment); dedupe_key makes it exactly-once. No PII (routing ids only).
	if _, err := tx.Exec(ctx, `
INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
SELECT ss.cognito_sub, 'shop', 'shop_new_order',
       jsonb_build_object('entityId', sf.id::text, 'deepLink', 'effy://queue/' || sf.id::text),
       'shop_new_order:' || ss.cognito_sub || ':' || sf.id::text
FROM public.shop_fulfillment sf
JOIN public.shop_staff ss ON ss.shop_id = sf.shop_id AND ss.status = 'active'
WHERE sf.order_id = $1
ON CONFLICT (dedupe_key) DO NOTHING`, orderID); err != nil {
		return false, fmt.Errorf("checkout: shop_new_order intents: %w", err)
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

	// 3b. Push notification intent — the customer's order is paid (050). Same tx as the fact, so it is
	// enqueued exactly once (the dedupe_key is a second guarantee). Recipient is the order's customer
	// sub. No PII in the payload — the deep link + order id only (FR-021).
	var customerSub string
	if err := tx.QueryRow(ctx,
		`SELECT c.cognito_sub FROM public."order" o JOIN public.customer c ON c.id = o.customer_id WHERE o.id = $1`,
		orderID).Scan(&customerSub); err != nil {
		return false, fmt.Errorf("checkout: resolve customer sub: %w", err)
	}
	if err := notifications.Append(ctx, tx, notifications.Request{
		RecipientSub: customerSub,
		Audience:     "customer",
		Type:         "order_paid",
		EntityID:     orderID,
		DeepLink:     "effy://order/" + orderID,
	}); err != nil {
		return false, err
	}

	// 3c. Receipt-email intent (052 FR-019/FR-020).
	//
	// ⚠ INSIDE THIS TRANSACTION, so the row is written in the SAME atomic step as the fact it
	// announces. The transaction is reached only when the status-guarded `pending_payment → paid`
	// update above affected a row, so it runs exactly once per order even under duplicated webhooks —
	// and `receipt_dispatch_auto_uq` (a PARTIAL unique index on order_id WHERE reason='order_paid')
	// is a second, independent guarantee the database itself enforces. Re-processing inserts nothing.
	//
	// ⚠ THE RECIPIENT IS SNAPSHOTTED HERE, not resolved at send time. A customer who later changes
	// their account email must not retroactively change where an already-sent receipt went.
	//
	// ⚠ It does NOT send. The scheduled notifications worker drains this; an SES call on the paid
	// path would make a payment's success depend on a mail service being up.
	if _, err := tx.Exec(ctx, `
INSERT INTO public.receipt_dispatch (order_id, reason, recipient)
SELECT o.id, 'order_paid', c.email
FROM public."order" o JOIN public.customer c ON c.id = o.customer_id
WHERE o.id = $1
ON CONFLICT DO NOTHING`, orderID); err != nil {
		return false, fmt.Errorf("checkout: enqueue receipt: %w", err)
	}

	// 4. Payment succeeded.
	if _, err := tx.Exec(ctx, `UPDATE public.payment SET status='succeeded', updated_at=now() WHERE order_id=$1`, orderID); err != nil {
		return false, fmt.Errorf("checkout: payment succeeded: %w", err)
	}

	// 5. Record the promotional redemption (027 FR-048).
	//
	// ⚠ Inside THIS transaction, which is reached only when the status-guarded `pending_payment → paid`
	// update above affected a row — so it runs exactly once per order even under duplicated Stripe
	// webhooks. `promo_redemption.order_id` is UNIQUE as a second, independent guarantee: the database
	// refuses a double count even if this code were ever called twice.
	if _, err := tx.Exec(ctx, `
INSERT INTO public.promo_redemption (promo_code_id, customer_id, order_id, amount)
SELECT o.promo_code_id, o.customer_id, o.id, o.discount_amount
FROM public."order" o
WHERE o.id = $1 AND o.promo_code_id IS NOT NULL
ON CONFLICT (order_id) DO NOTHING`, orderID); err != nil {
		return false, fmt.Errorf("checkout: record promo redemption: %w", err)
	}

	// 6. Empty the customer's cart.
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

// SavePaymentMethod writes the receipt-safe payment summary (052 FR-006).
//
// ⚠ A PLAIN UPDATE, deliberately outside any transaction. It touches three nullable columns that
// nothing reads for a decision — only the receipt displays them — so there is nothing here to make
// atomic with the paid transition, and a great deal to lose by putting it there.
//
// Empty strings are stored as NULL: "not captured" and "captured as blank" must not be the same row.
func (s *pgStore) SavePaymentMethod(ctx context.Context, orderID string, m PaymentMethodSummary) error {
	if _, err := s.pool.Exec(ctx, `
UPDATE public.payment
   SET method_type  = NULLIF($2, ''),
       method_brand = NULLIF($3, ''),
       method_last4 = NULLIF($4, ''),
       updated_at   = now()
 WHERE order_id = $1`, orderID, m.Type, m.Brand, m.Last4); err != nil {
		return fmt.Errorf("checkout: save payment method: %w", err)
	}
	return nil
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
