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

// ReplaceLine is one line of the client's local cart being pushed to the server (the idempotent
// checkout snapshot — R8 amended to Option B: the device-local cart is the source of truth).
type ReplaceLine struct {
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
	// ReplaceItems sets the cart to EXACTLY these (deduped) product/quantity pairs in one atomic
	// statement — the backing of the idempotent Replace. productIDs[i] pairs with quantities[i].
	ReplaceItems(ctx context.Context, cartID string, productIDs []string, quantities []int32, max int) error
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

// Replace sets the server cart to EXACTLY the client's local cart (R8 amended → Option B: the
// device-local cart is authoritative; the server cart is an idempotent checkout snapshot). Missing /
// unavailable products and non-positive quantities are skipped; duplicate product ids are summed then
// clamped. This is IDEMPOTENT — re-running with the same input is a no-op — so re-entering checkout can
// never accumulate quantities, and a stale line from an abandoned attempt is overwritten, not added to.
func (s *Service) Replace(ctx context.Context, customerID string, lines []ReplaceLine) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	// Dedupe (sum dup product ids) + validate (skip non-purchasable / non-positive). Deduping is
	// required: ReplaceItems' upsert cannot touch the same row twice in one statement.
	qtyByProduct := map[string]int{}
	order := make([]string, 0, len(lines))
	for _, l := range lines {
		if l.Quantity <= 0 || s.assertPurchasable(ctx, l.ProductID) != nil {
			continue
		}
		if _, seen := qtyByProduct[l.ProductID]; !seen {
			order = append(order, l.ProductID)
		}
		qtyByProduct[l.ProductID] += l.Quantity
	}
	productIDs := make([]string, 0, len(order))
	quantities := make([]int32, 0, len(order))
	for _, pid := range order {
		productIDs = append(productIDs, pid)
		quantities = append(quantities, int32(clampAdd(qtyByProduct[pid])))
	}
	if err := s.repo.ReplaceItems(ctx, cartID, productIDs, quantities, maxQuantity); err != nil {
		return Cart{}, err
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
