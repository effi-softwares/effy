// Service layer: cart business rules — re-price against the catalog, flag unavailable lines, clamp
// quantity, compute totals in integer cents (money), merge a guest cart. No HTTP, no SQL.
package cart

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/pricing"
)

const (
	writeTimeout = 4 * time.Second
	maxQuantity  = 99
)

// Sentinel errors mapped by the handler (400/404/409). ErrProductUnavailable covers a non-active product.
var (
	ErrProductNotFound    = errors.New("cart: product not found")
	ErrProductUnavailable = errors.New("cart: product unavailable")
	ErrInvalidQuantity    = errors.New("cart: invalid quantity")
)

// Domain.
type Line struct {
	ID                 string
	ProductID          string
	Name               string
	ImageURL           string
	UnitPriceAmount    string
	Quantity           int
	LineSubtotalAmount string
	Available          bool
	// Opaque anonymous grouping token (021) — never a shop id/name.
	PackageKey string
}

type Notice struct {
	ProductID string
	Kind      string // "unavailable" (price_changed is client-derived per R8)
}

type Cart struct {
	Lines              []Line
	ItemSubtotalAmount string
	DeliveryFeeAmount  string
	GrandTotalAmount   string
	Currency           string
	Notices            []Notice
}

// MergeLine is one line of a guest cart being merged on sign-in.
type MergeLine struct {
	ProductID string
	Quantity  int
}

// Repo is the repository seam (a fake implements it in tests).
type Repo interface {
	GetOrCreateCartID(ctx context.Context, customerID string) (string, error)
	Lines(ctx context.Context, cartID string) ([]cartLineRow, error)
	ProductStatus(ctx context.Context, productID string) (string, bool, error)
	AddItem(ctx context.Context, cartID, productID string, qty, max int) error
	SetQty(ctx context.Context, cartID, productID string, qty int) error
	RemoveItem(ctx context.Context, cartID, productID string) error
}

type Service struct {
	repo    Repo
	presign media.Presigner
}

func NewService(repo Repo, presign media.Presigner) *Service {
	return &Service{repo: repo, presign: presign}
}

// Get returns the customer's re-priced cart.
func (s *Service) Get(ctx context.Context, customerID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID)
}

// Add adds/increments a product; rejects a missing or unavailable product, clamps quantity.
func (s *Service) Add(ctx context.Context, customerID, productID string, qty int) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if err := s.assertPurchasable(ctx, productID); err != nil {
		return Cart{}, err
	}
	qty = clampAdd(qty)
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if err := s.repo.AddItem(ctx, cartID, productID, qty, maxQuantity); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID)
}

// SetQty sets a line's quantity; 0 removes it. Quantity is clamped to the max.
func (s *Service) SetQty(ctx context.Context, customerID, productID string, qty int) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if !validUUID(productID) {
		return Cart{}, ErrProductNotFound
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if qty <= 0 {
		if err := s.repo.RemoveItem(ctx, cartID, productID); err != nil {
			return Cart{}, err
		}
	} else {
		if qty > maxQuantity {
			qty = maxQuantity
		}
		if err := s.repo.SetQty(ctx, cartID, productID, qty); err != nil {
			return Cart{}, err
		}
	}
	return s.build(ctx, cartID)
}

// Remove deletes a line.
func (s *Service) Remove(ctx context.Context, customerID, productID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if !validUUID(productID) {
		return Cart{}, ErrProductNotFound
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if err := s.repo.RemoveItem(ctx, cartID, productID); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID)
}

// Merge folds a guest cart into the server cart (sum quantities); missing/unavailable products are
// skipped silently (best-effort — a guest may have stale items).
func (s *Service) Merge(ctx context.Context, customerID string, lines []MergeLine) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	for _, l := range lines {
		if l.Quantity <= 0 || s.assertPurchasable(ctx, l.ProductID) != nil {
			continue
		}
		if err := s.repo.AddItem(ctx, cartID, l.ProductID, clampAdd(l.Quantity), maxQuantity); err != nil {
			return Cart{}, err
		}
	}
	return s.build(ctx, cartID)
}

// assertPurchasable verifies the product exists and is active.
func (s *Service) assertPurchasable(ctx context.Context, productID string) error {
	if !validUUID(productID) {
		return ErrProductNotFound
	}
	status, found, err := s.repo.ProductStatus(ctx, productID)
	if err != nil {
		return err
	}
	if !found {
		return ErrProductNotFound
	}
	if status != "active" {
		return ErrProductUnavailable
	}
	return nil
}

// build reads the cart lines, presigns images, and computes totals in cents. Unavailable lines are
// flagged and EXCLUDED from the payable subtotal (FR-022); the flat delivery fee applies only when
// there is something payable.
func (s *Service) build(ctx context.Context, cartID string) (Cart, error) {
	rows, err := s.repo.Lines(ctx, cartID)
	if err != nil {
		return Cart{}, err
	}

	lines := make([]Line, 0, len(rows))
	notices := make([]Notice, 0)
	var subtotalCents int64

	for _, row := range rows {
		available := row.Status == "active"
		unitCents, perr := money.ParseCents(row.UnitPriceAmount)
		if perr != nil {
			return Cart{}, perr
		}
		lineCents := unitCents * int64(row.Quantity)

		var imageURL string
		if row.StorageKey != nil {
			if url, e := s.presign.PresignGet(ctx, *row.StorageKey); e == nil {
				imageURL = url
			}
		}

		if available {
			subtotalCents += lineCents
		} else {
			notices = append(notices, Notice{ProductID: row.ProductID, Kind: "unavailable"})
		}

		lines = append(lines, Line{
			ID:                 row.ID,
			ProductID:          row.ProductID,
			Name:               row.Name,
			ImageURL:           imageURL,
			UnitPriceAmount:    row.UnitPriceAmount,
			Quantity:           row.Quantity,
			LineSubtotalAmount: money.FormatCents(lineCents),
			Available:          available,
			PackageKey:         delivery.PackageKey(row.ShopID),
		})
	}

	// 021: delivery is priced per package at checkout (needs the address), not in the cart. The cart
	// shows the item subtotal only; DeliveryFeeAmount is 0 here and the client renders "calculated at
	// checkout". GrandTotal == item subtotal at cart stage.
	return Cart{
		Lines:              lines,
		ItemSubtotalAmount: money.FormatCents(subtotalCents),
		DeliveryFeeAmount:  money.FormatCents(0),
		GrandTotalAmount:   money.FormatCents(subtotalCents),
		Currency:           pricing.Currency,
		Notices:            notices,
	}, nil
}

func clampAdd(qty int) int {
	if qty < 1 {
		return 1
	}
	if qty > maxQuantity {
		return maxQuantity
	}
	return qty
}

func validUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}
