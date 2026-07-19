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

type Fulfillment struct {
	Status         string
	ItemCount      int
	SubtotalAmount string
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
	Status   string `db:"status"`
	Count    int    `db:"item_count"`
	Subtotal string `db:"subtotal_amount"`
}

// Fulfillments returns the per-shop portions WITHOUT shop identity (only status/count/subtotal).
func (r *Repository) Fulfillments(ctx context.Context, orderID string) ([]fulfillmentRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT status AS status, item_count AS item_count, subtotal_amount::text AS subtotal_amount
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

// ── Service ─────────────────────────────────────────────────────────────────────────────────────

type Repo interface {
	List(ctx context.Context, customerID string) ([]summaryRow, error)
	Get(ctx context.Context, customerID, orderID string) (orderRow, error)
	Items(ctx context.Context, orderID string) ([]itemRow, error)
	Fulfillments(ctx context.Context, orderID string) ([]fulfillmentRow, error)
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
	domainFul := make([]Fulfillment, 0, len(ful))
	for _, f := range ful {
		domainFul = append(domainFul, Fulfillment{Status: f.Status, ItemCount: f.Count, SubtotalAmount: f.Subtotal})
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
