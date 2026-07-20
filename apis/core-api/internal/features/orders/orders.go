// Package orders is the customer's order history + receipt read (019 US3 receipt / US5 history). The
// receipt is what the customer sees: ONE order itemized by product, with an ANONYMOUS per-shop
// fulfillment summary — shop identity is never exposed (FR-029/FR-033). Owner-scoped.
package orders

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
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
	ProductID          string
	ProductName        string
	UnitPriceAmount    string
	Quantity           int
	LineSubtotalAmount string
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
	ID                 string
	OrderNumber        string
	Status             string
	PlacedAt           *string
	Items              []Item
	DeliveryAddress    json.RawMessage
	ItemSubtotalAmount string
	DeliveryFeeAmount  string
	GrandTotalAmount   string
	Currency           string
	PaymentStatus      string
	Fulfillments       []Fulfillment
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
	ID            string  `db:"id"`
	OrderNumber   string  `db:"order_number"`
	Status        string  `db:"status"`
	PlacedAt      *string `db:"placed_at"`
	Address       []byte  `db:"delivery_address"`
	ItemSubtotal  string  `db:"item_subtotal_amount"`
	DeliveryFee   string  `db:"delivery_fee_amount"`
	GrandTotal    string  `db:"grand_total_amount"`
	Currency      string  `db:"currency"`
	PaymentStatus *string `db:"payment_status"`
}

func (r *Repository) Get(ctx context.Context, customerID, orderID string) (orderRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT o.id::text AS id, o.order_number AS order_number, o.status AS status,
       o.placed_at::text AS placed_at, o.delivery_address AS delivery_address,
       o.item_subtotal_amount::text AS item_subtotal_amount,
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
	ProductID    string `db:"product_id"`
	ProductName  string `db:"product_name"`
	UnitPrice    string `db:"unit_price_amount"`
	Quantity     int    `db:"quantity"`
	LineSubtotal string `db:"line_subtotal_amount"`
}

func (r *Repository) Items(ctx context.Context, orderID string) ([]itemRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT product_id::text AS product_id, product_name AS product_name,
       unit_price_amount::text AS unit_price_amount, quantity AS quantity,
       line_subtotal_amount::text AS line_subtotal_amount
FROM public.order_item WHERE order_id = $1 ORDER BY created_at ASC`, orderID)
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

// ── Service ─────────────────────────────────────────────────────────────────────────────────────

type Repo interface {
	List(ctx context.Context, customerID string) ([]summaryRow, error)
	Get(ctx context.Context, customerID, orderID string) (orderRow, error)
	Items(ctx context.Context, orderID string) ([]itemRow, error)
	Fulfillments(ctx context.Context, orderID string) ([]fulfillmentRow, error)
	Shortfalls(ctx context.Context, orderID string) ([]shortfallRow, error)
}

type Service struct {
	repo Repo
}

func NewService(repo Repo) *Service {
	return &Service{repo: repo}
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
			ProductID: it.ProductID, ProductName: it.ProductName, UnitPriceAmount: it.UnitPrice,
			Quantity: it.Quantity, LineSubtotalAmount: it.LineSubtotal,
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

	return Order{
		ID: row.ID, OrderNumber: row.OrderNumber, Status: row.Status, PlacedAt: row.PlacedAt,
		Items: domainItems, DeliveryAddress: json.RawMessage(row.Address),
		ItemSubtotalAmount: row.ItemSubtotal, DeliveryFeeAmount: row.DeliveryFee,
		GrandTotalAmount: row.GrandTotal, Currency: row.Currency,
		PaymentStatus: payment, Fulfillments: domainFul,
	}, nil
}
