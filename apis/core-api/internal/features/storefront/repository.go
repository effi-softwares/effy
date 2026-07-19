// Repository layer: SQL only. Reads the 016 catalog (public.product/product_media/category) for the
// CUSTOMER projection — only status='active' products, primary image joined, money cast to text so it
// crosses the wire exactly (research R9). Wire rows are mapped to domain in the service; they never
// leave this file.
package storefront

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// cardSelect is the shared product-card projection. The LATERAL join picks one image: primary first,
// then lowest display_order. Money is cast to text to preserve exactness.
const cardSelect = `
SELECT p.id::text                 AS id,
       p.name                     AS name,
       p.brand                    AS brand,
       p.price_amount::text       AS price_amount,
       p.currency                 AS currency,
       p.compare_at_amount::text  AS compare_at_amount,
       m.storage_key              AS storage_key,
       m.alt_text                 AS alt_text,
       p.created_at               AS created_at
FROM public.product p
LEFT JOIN LATERAL (
    SELECT storage_key, alt_text
    FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true
`

// cardRow is the wire shape of cardSelect; it never leaves this file.
type cardRow struct {
	ID              string    `db:"id"`
	Name            string    `db:"name"`
	Brand           *string   `db:"brand"`
	PriceAmount     string    `db:"price_amount"`
	Currency        string    `db:"currency"`
	CompareAtAmount *string   `db:"compare_at_amount"`
	StorageKey      *string   `db:"storage_key"`
	AltText         *string   `db:"alt_text"`
	CreatedAt       time.Time `db:"created_at"`
}

// railCandidate is a category that has active products (drives the Home category rails).
type railCandidate struct {
	Key  string `db:"key"`
	Name string `db:"name"`
}

// categoryRow is the wire shape of the category tree read.
type categoryRow struct {
	Key       string  `db:"key"`
	Name      string  `db:"name"`
	ParentKey *string `db:"parent_key"`
}

type Repository struct {
	db db.DBTX
}

func NewRepository(dbtx db.DBTX) *Repository {
	return &Repository{db: dbtx}
}

func (r *Repository) collectCards(ctx context.Context, sql string, args ...any) ([]cardRow, error) {
	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("storefront: query cards: %w", err)
	}
	cards, err := pgx.CollectRows(rows, pgx.RowToStructByName[cardRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan cards: %w", err)
	}
	return cards, nil
}

// NewestCards backs the "Featured" rail — newest active products.
func (r *Repository) NewestCards(ctx context.Context, limit int) ([]cardRow, error) {
	return r.collectCards(ctx, cardSelect+`
WHERE p.status = 'active'
ORDER BY p.created_at DESC
LIMIT $1`, limit)
}

// OnSaleCards backs the "On sale" rail — active products with a compare-at above the current price.
func (r *Repository) OnSaleCards(ctx context.Context, limit int) ([]cardRow, error) {
	return r.collectCards(ctx, cardSelect+`
WHERE p.status = 'active'
  AND p.compare_at_amount IS NOT NULL
  AND p.compare_at_amount > p.price_amount
ORDER BY p.created_at DESC
LIMIT $1`, limit)
}

// CategoryCards backs a category rail — active products whose primary category is categoryKey.
func (r *Repository) CategoryCards(ctx context.Context, categoryKey string, limit int) ([]cardRow, error) {
	return r.collectCards(ctx, cardSelect+`
WHERE p.status = 'active'
  AND p.primary_category_id = (SELECT id FROM public.category WHERE key = $1)
ORDER BY p.created_at DESC
LIMIT $2`, categoryKey, limit)
}

// CardsByIDs hydrates a set of ids (recently-viewed), active only. Order is not guaranteed — the
// caller re-orders to its id list.
func (r *Repository) CardsByIDs(ctx context.Context, ids []string) ([]cardRow, error) {
	return r.collectCards(ctx, cardSelect+`
WHERE p.status = 'active'
  AND p.id = ANY($1::uuid[])`, ids)
}

// RailCandidates returns up to `limit` active categories that directly hold active products (most
// products first), so Home only renders non-empty category rails regardless of taxonomy depth.
func (r *Repository) RailCandidates(ctx context.Context, limit int) ([]railCandidate, error) {
	rows, err := r.db.Query(ctx, `
SELECT c.key AS key, c.name AS name
FROM public.category c
JOIN public.product p ON p.primary_category_id = c.id AND p.status = 'active'
WHERE c.status = 'active'
GROUP BY c.key, c.name, c.display_order
ORDER BY c.display_order ASC, count(p.id) DESC
LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("storefront: query rail candidates: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[railCandidate])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan rail candidates: %w", err)
	}
	return out, nil
}

// Categories returns the active category tree (chips/filters), each with its parent key.
func (r *Repository) Categories(ctx context.Context) ([]categoryRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT c.key AS key,
       c.name AS name,
       (SELECT pc.key FROM public.category pc WHERE pc.id = c.parent_id) AS parent_key
FROM public.category c
WHERE c.status = 'active'
ORDER BY c.display_order ASC, c.name ASC`)
	if err != nil {
		return nil, fmt.Errorf("storefront: query categories: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[categoryRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan categories: %w", err)
	}
	return out, nil
}
