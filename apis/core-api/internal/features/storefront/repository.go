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
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// The shared product-card projection, split into its column list and its FROM so search can splice a
// relevance-score column between them (025). The LATERAL join picks one image: primary first, then
// lowest display_order. Money is cast to text to preserve exactness.
const cardColumns = `p.id::text                 AS id,
       p.name                     AS name,
       p.brand                    AS brand,
       p.price_amount::text       AS price_amount,
       p.currency                 AS currency,
       p.compare_at_amount::text  AS compare_at_amount,
       m.storage_key              AS storage_key,
       m.alt_text                 AS alt_text,
       p.created_at               AS created_at`

const cardFrom = `
FROM public.product p
LEFT JOIN LATERAL (
    SELECT storage_key, alt_text
    FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true
`

// cardSelect is the full projection used by every non-search read.
const cardSelect = "\nSELECT " + cardColumns + cardFrom

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

// searchRow is cardRow plus the relevance score. pgx.RowToStructByName requires the struct to match
// the result set exactly, so search — which always selects a score column — needs its own row type
// rather than an optional field on cardRow.
type searchRow struct {
	ID              string    `db:"id"`
	Name            string    `db:"name"`
	Brand           *string   `db:"brand"`
	PriceAmount     string    `db:"price_amount"`
	Currency        string    `db:"currency"`
	CompareAtAmount *string   `db:"compare_at_amount"`
	StorageKey      *string   `db:"storage_key"`
	AltText         *string   `db:"alt_text"`
	CreatedAt       time.Time `db:"created_at"`
	Score           float32   `db:"score"`
}

// card projects a search row onto the shared card shape the service already knows how to map.
func (r searchRow) card() cardRow {
	return cardRow{
		ID: r.ID, Name: r.Name, Brand: r.Brand,
		PriceAmount: r.PriceAmount, Currency: r.Currency, CompareAtAmount: r.CompareAtAmount,
		StorageKey: r.StorageKey, AltText: r.AltText, CreatedAt: r.CreatedAt,
	}
}

// railCandidate is a category that has active products (drives the Home category rails).
type railCandidate struct {
	Key  string `db:"key"`
	Name string `db:"name"`
}

// categoryRow is the wire shape of the category tree read. ProductCount and ImageKey were added by
// 025 so browse can show a real, scannable category grid (contracts/storefront-categories.contract.md).
type categoryRow struct {
	Key          string  `db:"key"`
	Name         string  `db:"name"`
	ParentKey    *string `db:"parent_key"`
	ProductCount int     `db:"product_count"`
	ImageKey     *string `db:"image_key"`
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

// Categories returns the active category tree (chips/filters/browse), each with its parent key, its
// active-product count, and a representative image key.
//
// ⚠ The image is DERIVED, not stored — public.category has no image column and 025 FR-001 forbids
// adding one. The choice is deterministic (oldest active product in the category that has media, then
// that product's primary image) precisely because an arbitrary pick would make a category change its
// face between two page loads, which reads as a bug even though nothing is wrong.
func (r *Repository) Categories(ctx context.Context) ([]categoryRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT c.key AS key,
       c.name AS name,
       (SELECT pc.key FROM public.category pc WHERE pc.id = c.parent_id) AS parent_key,
       (SELECT count(*)
          FROM public.product p
         WHERE p.primary_category_id = c.id AND p.status = 'active') AS product_count,
       (SELECT m.storage_key
          FROM public.product p
          JOIN LATERAL (
              SELECT storage_key
              FROM public.product_media
              WHERE product_id = p.id
              ORDER BY is_primary DESC, display_order ASC, created_at ASC
              LIMIT 1
          ) m ON true
         WHERE p.primary_category_id = c.id AND p.status = 'active'
         ORDER BY p.created_at ASC, p.id ASC
         LIMIT 1) AS image_key
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

// Serviceable answers whether a postcode is in any delivery zone (025 FR-014).
//
// ⚠ It delegates to delivery.ZoneForPostcode rather than issuing its own SELECT. That is the entire
// mechanism behind FR-014b: checkout's DestinationZone calls the same function, so the answer a
// shopper gets in the storefront header and the answer they get at payment come from one
// implementation and cannot drift apart. Do not inline the SQL back into this file.
func (r *Repository) Serviceable(ctx context.Context, postcode string) (bool, error) {
	_, ok, err := delivery.ZoneForPostcode(ctx, r.db, postcode)
	return ok, err
}
