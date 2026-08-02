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

// advertisedPromoRow is one promotion cleared for public display on Home (028).
type advertisedPromoRow struct {
	ID              string     `db:"id"`
	Code            string     `db:"code"`
	Title           string     `db:"banner_title"`
	Subtitle        *string    `db:"banner_subtitle"`
	ImageKey        *string    `db:"banner_image_key"`
	Position        int        `db:"banner_position"`
	MinimumSubtotal string     `db:"minimum_subtotal_amount"`
	Currency        string     `db:"currency"`
	Placement       string     `db:"banner_placement"`
	EndsAt          *time.Time `db:"ends_at"`
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

// advertisedPromoSelect and advertisedPromoPredicate are shared by the Home banner read and the
// single-promotion read behind a banner tap. They are consts rather than two hand-copied statements
// because the predicate IS the visibility rule — two copies would eventually disagree about whether a
// promotion is live, and a shopper would meet a detail screen for a promotion Home had already
// stopped showing.
//
// ⚠ `p.id::text = $1` in the by-id read, NOT `p.id = $1`. A malformed id (a truncated paste, a stale
// deep link) sent at a uuid column raises `invalid input syntax for type uuid`, which surfaces as a
// 503 — the platform claiming it is broken when the truth is simply that no such promotion exists.
// The cast cannot error on any input, so a bad id gets the honest answer: 404.
const advertisedPromoSelect = `
SELECT p.id,
       p.code,
       p.banner_title,
       p.banner_subtitle,
       p.banner_image_key,
       p.banner_position,
       p.minimum_subtotal_amount,
       p.currency,
       p.banner_placement,
       p.ends_at
FROM public.promo_code p`

const advertisedPromoPredicate = `p.is_advertised
  AND p.status = 'active'
  AND (p.starts_at IS NULL OR p.starts_at <= now())
  AND (p.ends_at   IS NULL OR p.ends_at   >  now())
  AND (p.max_redemptions IS NULL
       OR (SELECT count(*) FROM public.promo_redemption r WHERE r.promo_code_id = p.id) < p.max_redemptions)`

// AdvertisedPromotions returns the promotions cleared to appear as banners on Home (028 FR-036/037c).
//
// ⚠ ONE query, and the visibility predicate lives ONLY here. Five terms decide it, and four of them
// are ordinary promotion semantics the cart already honours — the fifth (is_advertised) is what 028
// adds. Keeping them in one statement is what stops the banner read and the redemption path drifting
// into disagreeing about whether a promotion is live.
//
// ⚠ Exhaustion is COUNTED from promo_redemption, never read from a stored counter. That is 027's rule
// and its reason holds exactly here: a counter and the rows can disagree, and then nobody knows which
// is true. It is also what makes "an exhausted promotion stops being advertised" automatic rather than
// something an operator has to remember to do.
//
// The ORDER BY is served by promo_code_advertised_idx (partial, on the same columns), so this adds a
// single indexed read to a Home composition that already issues up to seven.
func (r *Repository) AdvertisedPromotions(ctx context.Context) ([]advertisedPromoRow, error) {
	const sql = advertisedPromoSelect + `
WHERE ` + advertisedPromoPredicate + `
ORDER BY p.banner_placement, p.banner_position, p.created_at`

	rows, err := r.db.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("storefront: query advertised promotions: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[advertisedPromoRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan advertised promotions: %w", err)
	}
	return out, nil
}

// AdvertisedPromotionByID returns ONE promotion cleared for public display, backing the promotion
// detail screen a banner tap opens.
//
// ⚠ It re-applies [advertisedPromoPredicate] rather than reading the row by id alone, and that is the
// whole point of the endpoint. A shopper's Home payload is a snapshot: between composing it and
// tapping a banner, the promotion can expire, be exhausted by other shoppers, be disabled, or be
// un-advertised. Serving the detail from the row-by-id would present terms for a promotion that is no
// longer live — the exact failure FR-036 ("true at the moment it is shown") forbids. Sharing the
// predicate as a const, rather than restating it, is what keeps the two reads from drifting into
// disagreeing about whether a promotion is live.
//
// A promotion that is not advertised is reported NOT FOUND, never "forbidden": whether a private
// promotion exists is not a shopper's business, and a distinguishable refusal would let anyone
// enumerate the operator's unadvertised codes by id.
func (r *Repository) AdvertisedPromotionByID(ctx context.Context, id string) (advertisedPromoRow, bool, error) {
	const sql = advertisedPromoSelect + `
WHERE p.id::text = $1
  AND ` + advertisedPromoPredicate

	rows, err := r.db.Query(ctx, sql, id)
	if err != nil {
		return advertisedPromoRow{}, false, fmt.Errorf("storefront: query advertised promotion: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[advertisedPromoRow])
	if err != nil {
		if err == pgx.ErrNoRows {
			return advertisedPromoRow{}, false, nil
		}
		return advertisedPromoRow{}, false, fmt.Errorf("storefront: scan advertised promotion: %w", err)
	}
	return row, true, nil
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
