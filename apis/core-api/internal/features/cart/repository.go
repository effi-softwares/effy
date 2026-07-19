// Repository layer: SQL only. The server cart stores ONLY product + quantity; price and availability
// are re-read from public.product on every read (authoritative — R8). One cart per customer.
package cart

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// cartLineRow is the wire shape of the cart read (cart_item ⋈ product ⋈ primary media).
type cartLineRow struct {
	ID              string  `db:"id"`
	ProductID       string  `db:"product_id"`
	Quantity        int     `db:"quantity"`
	Name            string  `db:"name"`
	UnitPriceAmount string  `db:"unit_price_amount"`
	Currency        string  `db:"currency"`
	Status          string  `db:"status"`
	StorageKey      *string `db:"storage_key"`
}

type Repository struct {
	db db.DBTX
}

func NewRepository(dbtx db.DBTX) *Repository {
	return &Repository{db: dbtx}
}

// GetOrCreateCartID returns the customer's cart id, creating the cart on first use.
func (r *Repository) GetOrCreateCartID(ctx context.Context, customerID string) (string, error) {
	rows, err := r.db.Query(ctx, `
INSERT INTO public.cart (customer_id) VALUES ($1)
ON CONFLICT (customer_id) DO UPDATE SET updated_at = now()
RETURNING id::text`, customerID)
	if err != nil {
		return "", fmt.Errorf("cart: upsert cart: %w", err)
	}
	id, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[string])
	if err != nil {
		return "", fmt.Errorf("cart: scan cart id: %w", err)
	}
	return id, nil
}

// Lines returns the cart's lines, re-priced against product, oldest first.
func (r *Repository) Lines(ctx context.Context, cartID string) ([]cartLineRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT ci.id::text          AS id,
       ci.product_id::text  AS product_id,
       ci.quantity          AS quantity,
       p.name               AS name,
       p.price_amount::text  AS unit_price_amount,
       p.currency           AS currency,
       p.status             AS status,
       m.storage_key        AS storage_key
FROM public.cart_item ci
JOIN public.product p ON p.id = ci.product_id
LEFT JOIN LATERAL (
    SELECT storage_key FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true
WHERE ci.cart_id = $1
ORDER BY ci.added_at ASC`, cartID)
	if err != nil {
		return nil, fmt.Errorf("cart: query lines: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[cartLineRow])
	if err != nil {
		return nil, fmt.Errorf("cart: scan lines: %w", err)
	}
	return out, nil
}

// ProductStatus returns the product's status; found=false if it does not exist.
func (r *Repository) ProductStatus(ctx context.Context, productID string) (string, bool, error) {
	rows, err := r.db.Query(ctx, `SELECT status FROM public.product WHERE id = $1`, productID)
	if err != nil {
		return "", false, fmt.Errorf("cart: query product status: %w", err)
	}
	status, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[string])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("cart: scan product status: %w", err)
	}
	return status, true, nil
}

// AddItem inserts or increments a line, clamping to the max quantity.
func (r *Repository) AddItem(ctx context.Context, cartID, productID string, qty, max int) error {
	_, err := r.db.Exec(ctx, `
INSERT INTO public.cart_item (cart_id, product_id, quantity) VALUES ($1, $2, $3)
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(public.cart_item.quantity + EXCLUDED.quantity, $4), updated_at = now()`,
		cartID, productID, qty, max)
	if err != nil {
		return fmt.Errorf("cart: add item: %w", err)
	}
	return nil
}

// SetQty sets a line's quantity (caller has clamped/validated qty > 0).
func (r *Repository) SetQty(ctx context.Context, cartID, productID string, qty int) error {
	_, err := r.db.Exec(ctx, `
UPDATE public.cart_item SET quantity = $3, updated_at = now()
WHERE cart_id = $1 AND product_id = $2`, cartID, productID, qty)
	if err != nil {
		return fmt.Errorf("cart: set qty: %w", err)
	}
	return nil
}

// RemoveItem deletes a line.
func (r *Repository) RemoveItem(ctx context.Context, cartID, productID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = $2`, cartID, productID)
	if err != nil {
		return fmt.Errorf("cart: remove item: %w", err)
	}
	return nil
}
