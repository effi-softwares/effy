// Package orders is the customer's order history + receipt read (019 US3 receipt / US5 history). The
// receipt is what the customer sees: ONE order itemized by product, with an ANONYMOUS per-shop
// fulfillment summary — shop identity is never exposed (FR-029/FR-033). Owner-scoped.
package orders

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/features/refunds"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

var ErrNotFound = errors.New("orders: not found")

// ── Domain ──────────────────────────────────────────────────────────────────────────────────────

type Summary struct {
	ID               string
	OrderNumber      string
	Status           string
	PlacedAt         *string
	ItemCount        int
	GrandTotalAmount string
	Currency         string
}

type Item struct {
	// 055 — the LINE's own id, needed so a customer can name an item in a refund request. See the
	// note on `itemDTO.OrderItemID`: two lines of the same product are indistinguishable by product id.
	OrderItemID        string
	ProductID          string
	ProductName        string
	UnitPriceAmount    string
	Quantity           int
	LineSubtotalAmount string
	// 052 — a presigned GET url for the product's primary image, or nil. DECORATION ONLY: the line
	// renders complete without it, and nothing on the receipt may be gated on its presence.
	ImageURL *string
}

// Shortfall is an item the customer paid for and will NOT receive (020 FR-018b).
//
// Disclosed at item level, but ONLY on a terminal portion — a flag raised and undone mid-pick must
// never reach the customer (SC-017). Carries no refund promise: no money moves in 020, and the debt
// is left deliberately visible for a later refunds slice.
type Shortfall struct {
	ProductName string
	Quantity    int
}

type Fulfillment struct {
	Status         string
	ItemCount      int
	SubtotalAmount string
	// Nil while the portion is still being picked. Never carries shop identity.
	Unavailable []Shortfall
}

type Order struct {
	ID              string
	OrderNumber     string
	Status          string
	PlacedAt        *string
	Items           []Item
	DeliveryAddress json.RawMessage
	// BillingAddress is the billing snapshot (023). nil/empty means "same as shipping" — the client
	// renders "Billing: same as shipping" rather than repeating the address. NEVER from the shop.
	BillingAddress     json.RawMessage
	ItemSubtotalAmount string
	// 051 FR-043 — the delivery fee as charged, so the receipt's lines reconcile to its total.
	DeliveryFeeAmount string
	// 027: what the promotional code took off, and the code itself. From the ORDER — a receipt explains
	// itself years later without re-deriving anything from a promotion that may since have changed.
	DiscountAmount   string
	PromoCode        *string
	GrandTotalAmount string
	Currency         string
	PaymentStatus    string
	Fulfillments     []Fulfillment

	// 052 — the customer-facing progress word, derived from Fulfillments by StageFor (FR-008).
	Stage Stage
	// 052 — how it was paid. nil when never captured (pre-052 order, or a failed post-commit capture).
	PaymentMethod *PaymentMethod
	// 052 — when each package is expected to arrive. Dates only; never a time (research R4).
	ArrivalEstimates []ArrivalEstimate

	// 055 — may the SHOPPER still cancel this themselves? Derived from the portions, never left for a
	// client to work out (FR-012, T050). Advisory: the server re-decides under the row lock.
	Cancellable bool

	// 055 US5 — what has happened to this shopper's money (FR-023). Empty when nothing was refunded,
	// and the client then renders NOTHING (FR-028) rather than an empty section.
	Refunds []CustomerRefund
	// The sum of every refund not in a terminal failure, as a 2-dp string. "0.00" when none.
	RefundedTotal string
	// What the shopper is actually out of pocket: grand total minus RefundedTotal.
	AmountPaidAfterRefunds string
	// ⚠ DERIVED FROM THE TOTALS, never a stored flag — so reaching it line by line and reaching it in
	// one act are the same fact (FR-023). A flag could be true while the numbers disagreed.
	FullyRefunded bool
}

// CustomerRefund is one refund as the SHOPPER sees it (055 FR-025).
//
// ⚠ THREE STATES AND NO FAILURE TEXT. See `refunds.CustomerState` for why five become three; the
// provider's reason is not carried here because it is not selected from the database at all.
type CustomerRefund struct {
	Amount string
	State  string
	// When the money actually landed. Null until it has — never a promise of when it will.
	RefundedAt *string
}

// PaymentMethod is the receipt-safe description of how an order was paid (052 FR-006).
//
// ⚠ NO CARD DATA BEYOND Last4, ever. There is no field here for a card number, an expiry or a
// cardholder name, and none may be added — 051's rule, restated where the next person will read it.
type PaymentMethod struct {
	// Effy's own family: card | wallet | pay_over_time | other. Never the provider's own string.
	Type  string
	Brand *string
	Last4 *string
}

// ArrivalEstimate is one package's expected arrival, as the customer was shown at checkout.
//
// ⚠ Dates, not times, and it carries no shop reference (FR-009).
type ArrivalEstimate struct {
	Method       string
	PromisedFrom *string
	PromisedTo   *string
}

// ── Repository ──────────────────────────────────────────────────────────────────────────────────

type Repository struct {
	db db.DBTX
}

func NewRepository(dbtx db.DBTX) *Repository {
	return &Repository{db: dbtx}
}

type summaryRow struct {
	ID          string  `db:"id"`
	OrderNumber string  `db:"order_number"`
	Status      string  `db:"status"`
	PlacedAt    *string `db:"placed_at"`
	ItemCount   int     `db:"item_count"`
	GrandTotal  string  `db:"grand_total_amount"`
	Currency    string  `db:"currency"`
}

func (r *Repository) List(ctx context.Context, customerID string) ([]summaryRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT o.id::text AS id, o.order_number AS order_number, o.status AS status,
       o.placed_at::text AS placed_at,
       COALESCE((SELECT SUM(quantity) FROM public.order_item WHERE order_id = o.id), 0)::int AS item_count,
       o.grand_total_amount::text AS grand_total_amount, o.currency AS currency
FROM public."order" o
WHERE o.customer_id = $1
ORDER BY o.created_at DESC`, customerID)
	if err != nil {
		return nil, fmt.Errorf("orders: list: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[summaryRow])
	if err != nil {
		return nil, fmt.Errorf("orders: scan list: %w", err)
	}
	return out, nil
}

type orderRow struct {
	ID           string  `db:"id"`
	OrderNumber  string  `db:"order_number"`
	Status       string  `db:"status"`
	PlacedAt     *string `db:"placed_at"`
	Address      []byte  `db:"delivery_address"`
	Billing      []byte  `db:"billing_address"`
	ItemSubtotal string  `db:"item_subtotal_amount"`
	// 027: the discount as computed at payment, and the code that justifies it. Read from the ORDER, not
	// re-derived from the promotion — a receipt must stay explainable even after the code changes.
	Discount string `db:"discount_amount"`
	// 051 FR-043: the delivery fee as charged. ⚠ The column has existed since 019 and the receipt read
	// never selected it, so delivery sat inside the total and appeared nowhere — a receipt whose lines
	// do not add up to its total is not one a shopper can check.
	DeliveryFee   string  `db:"delivery_fee_amount"`
	PromoCode     *string `db:"promo_code"`
	GrandTotal    string  `db:"grand_total_amount"`
	Currency      string  `db:"currency"`
	PaymentStatus *string `db:"payment_status"`
}

func (r *Repository) Get(ctx context.Context, customerID, orderID string) (orderRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT o.id::text AS id, o.order_number AS order_number, o.status AS status,
       o.placed_at::text AS placed_at, o.delivery_address AS delivery_address,
       o.billing_address AS billing_address,
       o.item_subtotal_amount::text AS item_subtotal_amount,
       o.discount_amount::text AS discount_amount, o.promo_code AS promo_code,
       o.delivery_fee_amount::text AS delivery_fee_amount,
       o.grand_total_amount::text AS grand_total_amount, o.currency AS currency,
       (SELECT status FROM public.payment WHERE order_id = o.id) AS payment_status
FROM public."order" o
WHERE o.id = $1 AND o.customer_id = $2`, orderID, customerID)
	if err != nil {
		return orderRow{}, fmt.Errorf("orders: get: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[orderRow])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return orderRow{}, ErrNotFound
		}
		return orderRow{}, fmt.Errorf("orders: scan get: %w", err)
	}
	return row, nil
}

type itemRow struct {
	OrderItemID  string `db:"order_item_id"`
	ProductID    string `db:"product_id"`
	ProductName  string `db:"product_name"`
	UnitPrice    string `db:"unit_price_amount"`
	Quantity     int    `db:"quantity"`
	LineSubtotal string `db:"line_subtotal_amount"`
	// 052 — the primary media object key, or nil. Presigned in the service; never emitted raw.
	ImageKey *string `db:"image_key"`
}

// 052 — one package's arrival estimate, as captured at checkout (FR-007).
//
// ⚠ NOTE WHAT IS NOT SELECTED: `shop_id`. This table is keyed by it, and the customer must never learn
// which node handles which package (FR-009). The service aggregates these into an ordered list and the
// id never enters a struct that can reach a DTO.
//
// ⚠ promised_from/promised_to are `date` columns. The platform has no delivery TIME window and cannot
// derive one (research R4) — scanning them as strings keeps that honest all the way to the wire.
type arrivalRow struct {
	Method       string  `db:"method"`
	PromisedFrom *string `db:"promised_from"`
	PromisedTo   *string `db:"promised_to"`
}

// 052 — how the order was paid (FR-006). All three nullable: they are captured best-effort AFTER the
// finalize transaction commits, so NULL means "not captured" — a pre-052 order, or a failed follow-up.
type methodRow struct {
	Type  *string `db:"method_type"`
	Brand *string `db:"method_brand"`
	Last4 *string `db:"method_last4"`
}

func (r *Repository) Items(ctx context.Context, orderID string) ([]itemRow, error) {
	// 052 — the line image comes from the LIVE catalogue by product_id, while every other column on
	// this row is the order's own immutable snapshot (019). That asymmetry is deliberate: a renamed or
	// re-priced product must still show what was actually bought (FR-011), but a photograph is
	// DECORATION and the current one is the useful one.
	//
	// ⚠ LEFT JOIN, never INNER. A product with no media, or whose primary flag was cleared, must still
	// produce its line — the receipt is the record of a purchase, not a gallery. `order_item.product_id`
	// is ON DELETE RESTRICT so the product row itself always survives.
	rows, err := r.db.Query(ctx, `
SELECT oi.id::text AS order_item_id,
       oi.product_id::text AS product_id, oi.product_name AS product_name,
       oi.unit_price_amount::text AS unit_price_amount, oi.quantity AS quantity,
       oi.line_subtotal_amount::text AS line_subtotal_amount,
       pm.storage_key AS image_key
FROM public.order_item oi
LEFT JOIN public.product_media pm ON pm.product_id = oi.product_id AND pm.is_primary
WHERE oi.order_id = $1 ORDER BY oi.created_at ASC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("orders: items: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[itemRow])
	if err != nil {
		return nil, fmt.Errorf("orders: scan items: %w", err)
	}
	return out, nil
}

type fulfillmentRow struct {
	ID       string `db:"id"`
	Status   string `db:"status"`
	Count    int    `db:"item_count"`
	Subtotal string `db:"subtotal_amount"`
}

type shortfallRow struct {
	FulfillmentID string `db:"shop_fulfillment_id"`
	ProductName   string `db:"product_name"`
	Quantity      int    `db:"quantity"`
}

// Fulfillments returns the per-shop portions WITHOUT shop identity (only status/count/subtotal).
//
// 020 gave `status` a life: 019 created every portion `pending` and nothing could ever change it.
// The id is selected only to join shortfalls below — it is NOT a shop id and never reaches the wire.
func (r *Repository) Fulfillments(ctx context.Context, orderID string) ([]fulfillmentRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT id::text AS id, status AS status, item_count AS item_count, subtotal_amount::text AS subtotal_amount
FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY created_at ASC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("orders: fulfillments: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[fulfillmentRow])
	if err != nil {
		return nil, fmt.Errorf("orders: scan fulfillments: %w", err)
	}
	return out, nil
}

// Shortfalls returns items the customer paid for but will not receive (020 US5, FR-018b).
//
// The `sf.status IN (terminal)` predicate is the WHOLE POINT and is enforced here in SQL rather than
// filtered in Go: a shop may flag an item unavailable and then un-flag it when it turns up
// (FR-010d), and a customer watching live would otherwise see the item vanish and reappear. They are
// told a settled fact, per portion, or nothing at all (SC-017).
//
// Selects the customer's own product name and quantity — and NO shop column. Naming the customer's
// own item discloses nothing about fulfilment structure (FR-018c), but a shop id would (FR-018).
func (r *Repository) Shortfalls(ctx context.Context, orderID string) ([]shortfallRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT fi.shop_fulfillment_id::text AS shop_fulfillment_id,
       oi.product_name              AS product_name,
       fi.unavailable_quantity      AS quantity
FROM public.fulfillment_item fi
JOIN public.shop_fulfillment sf ON sf.id = fi.shop_fulfillment_id
JOIN public.order_item oi       ON oi.id = fi.order_item_id
WHERE sf.order_id = $1
  AND sf.status IN ('ready_for_pickup', 'collected')
  AND fi.unavailable_quantity > 0
ORDER BY oi.product_name ASC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("orders: shortfalls: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[shortfallRow])
	if err != nil {
		return nil, fmt.Errorf("orders: scan shortfalls: %w", err)
	}
	return out, nil
}

// Arrivals returns one row per package: the method the customer chose and the DATE RANGE they were
// shown at checkout (052 FR-007).
//
// ⚠ `shop_id` is neither selected nor ordered by. The rows are ordered by the promise itself so the
// output is stable and says nothing about internal grouping (FR-009).
func (r *Repository) Arrivals(ctx context.Context, orderID string) ([]arrivalRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT method AS method,
       promised_from::text AS promised_from,
       promised_to::text   AS promised_to
FROM public.order_package_delivery
WHERE order_id = $1
ORDER BY promised_from ASC NULLS LAST, promised_to ASC NULLS LAST, method ASC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("orders: arrivals: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[arrivalRow])
	if err != nil {
		return nil, fmt.Errorf("orders: scan arrivals: %w", err)
	}
	return out, nil
}

// refundRow is one refund on the order, as the CUSTOMER's read needs it.
//
// ⚠ NO `failure_reason` COLUMN IS SELECTED, and that is a deliberate omission rather than an
// oversight. The provider's own words are staff information; a shopper cannot act on "your bank
// rejected the refund" and surfacing it invites them to argue with a message that will not change
// (FR-026). Not selecting it means no later mapper can leak it by accident.
type refundRow struct {
	Amount    string  `db:"amount"`
	Status    string  `db:"status"`
	SettledAt *string `db:"settled_at"`
}

// Refunds returns every refund on an order, newest first (055 FR-023).
//
// ⚠ `submitting` IS INCLUDED, unlike in the CEILING. The ceiling asks "how much may still be
// returned", and an unaccepted attempt must not hold that down. This asks "what has happened to your
// money", and a refund we asked for and cannot confirm is something the shopper should see — as
// "on its way", which is exactly what it is.
func (r *Repository) Refunds(ctx context.Context, orderID string) ([]refundRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT amount::text        AS amount,
       status              AS status,
       settled_at::text    AS settled_at
FROM public.refund
WHERE order_id = $1
ORDER BY created_at DESC, id DESC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("orders: refunds: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[refundRow])
	if err != nil {
		return nil, fmt.Errorf("orders: scan refunds: %w", err)
	}
	return out, nil
}

// PaymentMethod returns the captured method summary for an order, or a zero row when none was
// captured (052 FR-006). Absence is normal, not an error — see methodRow.
func (r *Repository) PaymentMethod(ctx context.Context, orderID string) (methodRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT method_type AS method_type, method_brand AS method_brand, method_last4 AS method_last4
FROM public.payment WHERE order_id = $1`, orderID)
	if err != nil {
		return methodRow{}, fmt.Errorf("orders: payment method: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[methodRow])
	if err != nil {
		return methodRow{}, fmt.Errorf("orders: scan payment method: %w", err)
	}
	if len(out) == 0 {
		return methodRow{}, nil
	}
	return out[0], nil
}

// ── Service ─────────────────────────────────────────────────────────────────────────────────────

type Repo interface {
	List(ctx context.Context, customerID string) ([]summaryRow, error)
	Get(ctx context.Context, customerID, orderID string) (orderRow, error)
	Items(ctx context.Context, orderID string) ([]itemRow, error)
	Fulfillments(ctx context.Context, orderID string) ([]fulfillmentRow, error)
	Shortfalls(ctx context.Context, orderID string) ([]shortfallRow, error)
	Arrivals(ctx context.Context, orderID string) ([]arrivalRow, error)
	PaymentMethod(ctx context.Context, orderID string) (methodRow, error)
	Refunds(ctx context.Context, orderID string) ([]refundRow, error)
}

type Service struct {
	repo Repo
	// 052 — mints the short-lived image urls on the receipt. Optional: nil presigner means every line
	// renders without a picture, which is a supported state rather than a failure.
	presign media.Presigner
}

// NewService wires the receipt read. `presign` MAY be nil — every line then renders without a
// picture, which is a supported state (052 FR-003: imagery is decoration, never a carrier of meaning).
func NewService(repo Repo, presign media.Presigner) *Service {
	return &Service{repo: repo, presign: presign}
}

func (s *Service) List(ctx context.Context, customerID string) ([]Summary, error) {
	rows, err := s.repo.List(ctx, customerID)
	if err != nil {
		return nil, err
	}
	out := make([]Summary, 0, len(rows))
	for _, r := range rows {
		out = append(out, Summary{
			ID: r.ID, OrderNumber: r.OrderNumber, Status: r.Status, PlacedAt: r.PlacedAt,
			ItemCount: r.ItemCount, GrandTotalAmount: r.GrandTotal, Currency: r.Currency,
		})
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, customerID, orderID string) (Order, error) {
	if _, err := uuid.Parse(orderID); err != nil {
		return Order{}, ErrNotFound
	}
	row, err := s.repo.Get(ctx, customerID, orderID)
	if err != nil {
		return Order{}, err
	}
	items, err := s.repo.Items(ctx, orderID)
	if err != nil {
		return Order{}, err
	}
	ful, err := s.repo.Fulfillments(ctx, orderID)
	if err != nil {
		return Order{}, err
	}

	domainItems := make([]Item, 0, len(items))
	for _, it := range items {
		domainItems = append(domainItems, Item{
			OrderItemID: it.OrderItemID, ProductID: it.ProductID, ProductName: it.ProductName, UnitPriceAmount: it.UnitPrice,
			Quantity: it.Quantity, LineSubtotalAmount: it.LineSubtotal,
			ImageURL: s.imageURL(ctx, it.ImageKey),
		})
	}
	short, err := s.repo.Shortfalls(ctx, orderID)
	if err != nil {
		return Order{}, err
	}
	byPortion := make(map[string][]Shortfall, len(short))
	for _, sh := range short {
		byPortion[sh.FulfillmentID] = append(byPortion[sh.FulfillmentID],
			Shortfall{ProductName: sh.ProductName, Quantity: sh.Quantity})
	}

	domainFul := make([]Fulfillment, 0, len(ful))
	for _, f := range ful {
		// f.ID is used ONLY to attach shortfalls here; it never reaches the DTO. The portion stays
		// anonymous to the customer (FR-018, SC-009).
		domainFul = append(domainFul, Fulfillment{
			Status: f.Status, ItemCount: f.Count, SubtotalAmount: f.Subtotal,
			Unavailable: byPortion[f.ID],
		})
	}
	payment := "requires_payment"
	if row.PaymentStatus != nil {
		payment = *row.PaymentStatus
	}

	// 052 — the arrival estimates the customer was shown. A read failure must not cost them their
	// receipt: the promise is supporting detail, while the money and the items are the record.
	arrivals := make([]ArrivalEstimate, 0)
	if rows, err := s.repo.Arrivals(ctx, orderID); err == nil {
		for _, a := range rows {
			arrivals = append(arrivals, ArrivalEstimate{
				Method: a.Method, PromisedFrom: a.PromisedFrom, PromisedTo: a.PromisedTo,
			})
		}
	}

	// 052 — how it was paid. Absence is normal (pre-052 order, or a failed post-commit capture), so a
	// missing summary is nil and the client omits the line rather than showing a blank.
	var method *PaymentMethod
	if m, err := s.repo.PaymentMethod(ctx, orderID); err == nil && m.Type != nil {
		method = &PaymentMethod{Type: *m.Type, Brand: m.Brand, Last4: m.Last4}
	}

	order := Order{
		ID: row.ID, OrderNumber: row.OrderNumber, Status: row.Status, PlacedAt: row.PlacedAt,
		Items: domainItems, DeliveryAddress: json.RawMessage(row.Address), BillingAddress: json.RawMessage(row.Billing),
		ItemSubtotalAmount: row.ItemSubtotal, DiscountAmount: row.Discount, PromoCode: row.PromoCode,
		DeliveryFeeAmount: row.DeliveryFee,
		GrandTotalAmount:  row.GrandTotal, Currency: row.Currency,
		PaymentStatus: payment, Fulfillments: domainFul,
		// ⚠ Derived HERE, from the portions, and put on the wire — never left for a client to work out
		// (052 FR-008, research R5).
		Stage:            StageFor(domainFul),
		PaymentMethod:    method,
		ArrivalEstimates: arrivals,
		Cancellable:      CustomerCancellable(row.Status, domainFul),
	}

	// ⚠ 055 US5 — READ AFTER, AND A FAILURE IS SWALLOWED. A refund read failing must not fail the
	// whole receipt: the order and its lines are the document, and the refund block is an addition to
	// it. The same reasoning as the payment-method read above, which 052 settled.
	if refundRows, err := s.repo.Refunds(ctx, orderID); err == nil {
		applyRefunds(&order, refundRows)
	}
	return order, nil
}

// imageURL mints a short-lived GET url for a media key, or returns nil.
//
// ⚠ A presign failure is SWALLOWED on purpose. The alternative is failing a receipt read because a
// photograph could not be signed, and this platform has already learned that lesson the expensive way:
// 029's storefront intermittently 503'd because a supporting read sat on the critical path.
func (s *Service) imageURL(ctx context.Context, key *string) *string {
	if key == nil || *key == "" || s.presign == nil {
		return nil
	}
	url, err := s.presign.PresignGet(ctx, *key)
	if err != nil || url == "" {
		return nil
	}
	return &url
}

// applyRefunds folds the refund rows onto the order the shopper reads (055 FR-023).
//
// ⚠ THE ARITHMETIC IS IN INTEGER CENTS AND FORMATTED ONCE. 051 and 052 each shipped a receipt whose
// lines did not add up, and a refund puts a SECOND set of figures on the same document — so the one
// place they are computed had better not accumulate 2-dp strings as floats, where `0.1 + 0.2` reaches
// a shopper's order page as `0.30000000000000004`.
//
// ⚠ THE RECEIPT ITSELF IS UNCHANGED (FR-024). `ItemSubtotalAmount`, `DeliveryFeeAmount`,
// `DiscountAmount` and `GrandTotalAmount` are what was CHARGED — a historical record. A refund is a
// later event shown alongside it, never folded back into it. An order whose receipt silently rewrote
// itself after a refund would be a document nobody could reconcile against their bank statement.
func applyRefunds(order *Order, rows []refundRow) {
	order.RefundedTotal = money.FormatCents(0)
	order.AmountPaidAfterRefunds = order.GrandTotalAmount
	if len(rows) == 0 {
		// ⚠ FR-028 — nothing at all, not an empty section. `Refunds` stays nil so the client renders
		// no block, and SC-011 (an unrefunded order is byte-identical to its pre-slice self) holds.
		return
	}

	var refundedCents int64
	out := make([]CustomerRefund, 0, len(rows))
	for _, r := range rows {
		state := refunds.CustomerState(r.Status)
		// ⚠ COUNTED BY THE SAME RULE AS THE CEILING, which excludes `submitting`: money we asked to
		// return and could not confirm has not left, so it must not be subtracted from what the
		// shopper paid. It still APPEARS in the list, as "on its way" — which is what it is.
		if r.Status != refunds.StatusSubmitting && state != refunds.CustomerProblem {
			refundedCents += cents(r.Amount)
		}
		out = append(out, CustomerRefund{Amount: r.Amount, State: state, RefundedAt: r.SettledAt})
	}

	paidCents := cents(order.GrandTotalAmount)
	order.Refunds = out
	order.RefundedTotal = money.FormatCents(refundedCents)
	order.AmountPaidAfterRefunds = money.FormatCents(max64(0, paidCents-refundedCents))
	// ⚠ DERIVED FROM THE TOTALS, never a stored flag — so reaching it line by line and reaching it in
	// one act are the same fact. `> 0` guards the degenerate free order, which is not "fully refunded".
	order.FullyRefunded = paidCents > 0 && refundedCents >= paidCents
}

// cents parses a 2-dp decimal string. `round`, because `12.34 * 100` is `1233.9999…` in binary.
func cents(amount string) int64 {
	v, err := strconv.ParseFloat(amount, 64)
	if err != nil {
		return 0
	}
	return int64(math.Round(v * 100))
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
