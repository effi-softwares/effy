// Package favorites is the customer's saved-products capability (019 US2 save/un-save; the list is US6).
// Save is idempotent (PK on (customer_id, product_id)). Every operation is customer-scoped from the
// resolved identity, never a client-supplied id.
package favorites

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
)

var ErrProductNotFound = errors.New("favorites: product not found")

// Favorite is a saved product (a storefront card + when it was saved).
type Favorite struct {
	ID              string
	Name            string
	Brand           *string
	ImageURL        string
	PriceAmount     string
	Currency        string
	CompareAtAmount *string
	Badges          []string
	Available       bool
	SavedAt         string
}

// ── Repository ──────────────────────────────────────────────────────────────────────────────────

type Repository struct {
	db db.DBTX
}

func NewRepository(dbtx db.DBTX) *Repository {
	return &Repository{db: dbtx}
}

type favoriteRow struct {
	ID              string    `db:"id"`
	Name            string    `db:"name"`
	Brand           *string   `db:"brand"`
	PriceAmount     string    `db:"price_amount"`
	Currency        string    `db:"currency"`
	CompareAtAmount *string   `db:"compare_at_amount"`
	StorageKey      *string   `db:"storage_key"`
	Status          string    `db:"status"`
	CreatedAt       time.Time `db:"created_at"`
	IsNew           bool      `db:"is_new"`
}

// List returns the customer's saved products, most-recent-first (any status — you may favorite an
// item that later goes unavailable; the card carries the `available` flag).
func (r *Repository) List(ctx context.Context, customerID string) ([]favoriteRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT p.id::text                 AS id,
       p.name                     AS name,
       p.brand                    AS brand,
       p.price_amount::text       AS price_amount,
       p.currency                 AS currency,
       p.compare_at_amount::text  AS compare_at_amount,
       m.storage_key              AS storage_key,
       p.status                   AS status,
       cf.created_at              AS created_at,
       (p.created_at >= now() - interval '14 days') AS is_new
FROM public.customer_favorite cf
JOIN public.product p ON p.id = cf.product_id
LEFT JOIN LATERAL (
    SELECT storage_key FROM public.product_media
    WHERE product_id = p.id ORDER BY is_primary DESC, display_order ASC, created_at ASC LIMIT 1
) m ON true
WHERE cf.customer_id = $1
ORDER BY cf.created_at DESC`, customerID)
	if err != nil {
		return nil, fmt.Errorf("favorites: list: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[favoriteRow])
	if err != nil {
		return nil, fmt.Errorf("favorites: scan list: %w", err)
	}
	return out, nil
}

func (r *Repository) ProductExists(ctx context.Context, productID string) (bool, error) {
	rows, err := r.db.Query(ctx, `SELECT 1 FROM public.product WHERE id = $1`, productID)
	if err != nil {
		return false, fmt.Errorf("favorites: query product: %w", err)
	}
	_, err = pgx.CollectExactlyOneRow(rows, pgx.RowTo[int])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("favorites: scan product: %w", err)
	}
	return true, nil
}

func (r *Repository) Save(ctx context.Context, customerID, productID string) error {
	_, err := r.db.Exec(ctx, `
INSERT INTO public.customer_favorite (customer_id, product_id) VALUES ($1, $2)
ON CONFLICT (customer_id, product_id) DO NOTHING`, customerID, productID)
	if err != nil {
		return fmt.Errorf("favorites: save: %w", err)
	}
	return nil
}

func (r *Repository) Remove(ctx context.Context, customerID, productID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM public.customer_favorite WHERE customer_id = $1 AND product_id = $2`, customerID, productID)
	if err != nil {
		return fmt.Errorf("favorites: remove: %w", err)
	}
	return nil
}

// ── Service ─────────────────────────────────────────────────────────────────────────────────────

type Repo interface {
	ProductExists(ctx context.Context, productID string) (bool, error)
	Save(ctx context.Context, customerID, productID string) error
	Remove(ctx context.Context, customerID, productID string) error
	List(ctx context.Context, customerID string) ([]favoriteRow, error)
}

type Service struct {
	repo    Repo
	presign media.Presigner
}

func NewService(repo Repo, presign media.Presigner) *Service {
	return &Service{repo: repo, presign: presign}
}

// List returns the customer's saved products (presigned images, derived badges).
func (s *Service) List(ctx context.Context, customerID string) ([]Favorite, error) {
	rows, err := s.repo.List(ctx, customerID)
	if err != nil {
		return nil, err
	}
	out := make([]Favorite, 0, len(rows))
	for _, row := range rows {
		var imageURL string
		if row.StorageKey != nil {
			if url, e := s.presign.PresignGet(ctx, *row.StorageKey); e == nil {
				imageURL = url
			}
		}
		badges := make([]string, 0, 2)
		if row.CompareAtAmount != nil {
			badges = append(badges, "on_sale")
		}
		if row.IsNew {
			badges = append(badges, "new")
		}
		out = append(out, Favorite{
			ID: row.ID, Name: row.Name, Brand: row.Brand, ImageURL: imageURL,
			PriceAmount: row.PriceAmount, Currency: row.Currency, CompareAtAmount: row.CompareAtAmount,
			Badges: badges, Available: row.Status == "active", SavedAt: row.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

// Save is idempotent — saving an already-saved product is a no-op success.
func (s *Service) Save(ctx context.Context, customerID, productID string) error {
	if _, err := uuid.Parse(productID); err != nil {
		return ErrProductNotFound
	}
	exists, err := s.repo.ProductExists(ctx, productID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrProductNotFound
	}
	return s.repo.Save(ctx, customerID, productID)
}

// Remove is idempotent — un-saving a product that is not saved is a no-op success.
func (s *Service) Remove(ctx context.Context, customerID, productID string) error {
	if _, err := uuid.Parse(productID); err != nil {
		return ErrProductNotFound
	}
	return s.repo.Remove(ctx, customerID, productID)
}
