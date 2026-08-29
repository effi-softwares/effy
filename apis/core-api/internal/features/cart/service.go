// Service layer: cart business rules — re-price against the catalogue, report availability and price
// changes honestly, hold the cart to the platform's ceilings, compute totals in integer cents. No HTTP,
// no SQL.
//
// ── What changed in 027, and why it is shaped this way ──────────────────────────────────────────
//
// The platform is now AUTHORITATIVE for a signed-in shopper's cart (research R0, reversing 019 R8). Two
// consequences run through this file:
//
//   - Every mutation returns the COMPLETE, freshly re-priced cart, so a client never has to guess an
//     outcome or issue a follow-up read (FR-007), and every mutation advances the cart's revision so a
//     client can tell a newer response from an older one (FR-009).
//   - Nothing here trusts a client with money or with a limit. Quantities are clamped here, the
//     distinct-item ceiling is refused here, and the amounts come from public.product at read time.
//
// Quantities are ABSOLUTE, never deltas — the one exception being Add, which increments and therefore
// carries a change id the repository dedupes on (FR-018).
package cart

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/availability"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/pricing"
)

// ⚠ Sized for a REMOTE database, which dev is: core-api runs in local Docker while the dev instance is in
// ap-southeast-2, so every round trip costs real milliseconds and a cart build makes several. At 4s the
// add path intermittently timed out and answered 500 — a latency failure that reads to a shopper exactly
// like a broken cart. The round trips were cut (one combined read; no prune on the write path) AND the
// budget widened, because doing only the first would leave no margin at all.
const writeTimeout = 12 * time.Second

// The one product lifecycle value this service still reasons about directly (016): `archived` is
// TERMINAL, and its line is swept away rather than flagged, because there is nothing to wait for.
// `draft` and `unavailable` are flagged but kept — a shopper may reasonably wait a temporary state
// out (research R11).
//
// ⚠ 054 removed `statusActive` from this package deliberately. "Is this purchasable?" is no longer
// a status comparison — it is availability.Purchasable, which also weighs stock — and leaving the
// constant here would leave the old, now-wrong answer within easy reach of the next person editing
// this file. The guard test refuses its return.
const statusArchived = "archived"

// Sentinel errors mapped by the handler.
var (
	ErrProductNotFound    = errors.New("cart: product not found")
	ErrProductUnavailable = errors.New("cart: product unavailable")
	ErrInvalidQuantity    = errors.New("cart: invalid quantity")
	ErrCartFull           = errors.New("cart: too many distinct items")
	ErrOrderNotFound      = errors.New("cart: order not found")
)

// ── Domain ──────────────────────────────────────────────────────────────────────────────────────

type Line struct {
	ID                 string
	ProductID          string
	Name               string
	ImageURL           string
	UnitPriceAmount    string
	Quantity           int
	LineSubtotalAmount string
	Available          bool
	// The price this line was added at, when it differs from the current one. Empty means "no change to
	// report" — which covers both "unchanged" and "we never recorded one" (a pre-027 row). The two are
	// deliberately not distinguished on the wire: neither is a change.
	PriceChangedFrom string
	// Opaque anonymous grouping token (021) — never a shop id/name.
	PackageKey string
}

// NoticeKind values. Kept as typed constants so a handler cannot invent one.
type NoticeKind string

const (
	NoticeUnavailable          NoticeKind = "unavailable"
	NoticePriceChanged         NoticeKind = "price_changed"
	NoticeRemoved              NoticeKind = "removed"
	NoticeQuantityClamped      NoticeKind = "quantity_clamped"
	NoticeCartFull             NoticeKind = "cart_full"
	NoticePromoNoLongerApplies NoticeKind = "promo_no_longer_applies"
)

type Notice struct {
	// Empty for a cart-level notice (a promotional code that stopped applying).
	ProductID string
	Kind      NoticeKind
	// Specifics where the kind alone is not enough. NEVER names or implies a shop.
	Detail string
}

// BlockedReason is why checkout is unavailable.
type BlockedReason string

const (
	BlockedEmpty          BlockedReason = "empty"
	BlockedNoPayableItems BlockedReason = "no_payable_items"
	BlockedBelowMinimum   BlockedReason = "below_minimum"
)

type CheckoutState struct {
	Allowed       bool
	BlockedReason BlockedReason
	// Empty when no minimum is in force — the client then shows nothing at all (FR-057).
	MinimumSubtotalAmount string
	RemainingAmount       string
}

type Limits struct {
	MaxLineQuantity  int
	MaxDistinctItems int
}

type Discount struct {
	Code   string
	Kind   string // "percentage" | "fixed"
	Amount string
	Label  string
}

type Cart struct {
	Revision           int64
	Lines              []Line
	SavedLines         []Line
	ItemSubtotalAmount string
	DiscountAmount     string
	GrandTotalAmount   string
	Currency           string
	Notices            []Notice
	Discount           *Discount
	Checkout           CheckoutState
	Limits             Limits
}

// LineInput is one line of a client-supplied set (merge, preview).
type LineInput struct {
	ProductID string
	Quantity  int
}

// SkipReason says why a reorder could not bring an item back.
type SkipReason string

const (
	SkipUnavailable SkipReason = "unavailable"
	SkipRemoved     SkipReason = "removed"
	SkipCartFull    SkipReason = "cart_full"
	SkipClamped     SkipReason = "clamped"
)

type Skipped struct {
	ProductID string
	Name      string
	Reason    SkipReason
}

// ReorderResult is the cart plus what could not come back (FR-035).
type ReorderResult struct {
	Cart    Cart
	Skipped []Skipped
}

// ── Seams ───────────────────────────────────────────────────────────────────────────────────────

// Repo is the repository seam (a fake implements it in tests). Every mutation returns `applied`: false
// means the change id was a duplicate, so nothing was done and the CURRENT cart is the right answer.
type Repo interface {
	GetOrCreateCartID(ctx context.Context, customerID string) (string, error)
	Meta(ctx context.Context, cartID string) (CartMeta, error)
	Lines(ctx context.Context, cartID string) ([]cartLineRow, error)
	SavedLines(ctx context.Context, cartID string) ([]cartLineRow, error)
	// AllLines is the combined read — payable lines, saved lines and the revision in ONE round trip.
	AllLines(ctx context.Context, cartID string) (lines, saved []cartLineRow, revision int64, err error)
	CountDistinct(ctx context.Context, cartID string) (int, error)
	ProductStatus(ctx context.Context, productID string) (row productStatusRow, found bool, err error)
	ProductSnapshots(ctx context.Context, productIDs []string) ([]cartLineRow, error)
	OrderItemsForReorder(ctx context.Context, customerID, orderID string) ([]ReorderCandidate, bool, error)

	AddItem(ctx context.Context, cartID, productID, changeID string, qty, max int) (bool, error)
	SetQty(ctx context.Context, cartID, productID, changeID string, qty int) (bool, error)
	RemoveItem(ctx context.Context, cartID, productID, changeID string) (bool, error)
	DeleteAllItems(ctx context.Context, cartID, changeID string) (bool, error)
	DeleteLines(ctx context.Context, cartID string, productIDs []string) error
	MergeItems(ctx context.Context, cartID, changeID string, productIDs []string, quantities []int32, max int) (bool, error)
	PromoByCode(ctx context.Context, code string) (PromoCode, bool, error)
	PromoByID(ctx context.Context, id string) (PromoCode, bool, error)
	PromoUsageFor(ctx context.Context, promoCodeID, customerID string) (PromoUsage, error)
	SetCartPromo(ctx context.Context, cartID string, promoCodeID *string, changeID string) (bool, error)

	SetAside(ctx context.Context, cartID, productID, changeID string) (bool, error)
	RestoreSaved(ctx context.Context, cartID, productID, changeID string, max int) (bool, error)
	DeleteSaved(ctx context.Context, cartID, productID, changeID string) (bool, error)
}

type Service struct {
	repo    Repo
	presign media.Presigner
	policy  cartpolicy.Reader
	metrics StockMetrics
}

// StockMetrics is the cart's telemetry sink for stock refusals (054). Nil-able; low-cardinality
// labels only, never PII or a product id (Principle VII).
//
// ⚠ `stock_blocked` is the number that says whether this FEATURE IS WORKING. A rising count is not a
// fault — it is the oversell being stopped, once per shopper who would previously have been charged
// for something that did not exist.
type StockMetrics interface {
	StockBlocked(stage string) // add | checkout
}

// WithStockMetrics wires the stock telemetry sink. Absent → a no-op, so tests and the local build
// need no metrics registry.
func (s *Service) WithStockMetrics(m StockMetrics) *Service {
	s.metrics = m
	return s
}

// noStockMetrics keeps the call sites free of nil checks — a metric that is not wired is not a
// branch every caller has to remember.
type noStockMetrics struct{}

func (noStockMetrics) StockBlocked(string) {}

func NewService(repo Repo, presign media.Presigner, policy cartpolicy.Reader) *Service {
	return &Service{repo: repo, presign: presign, policy: policy, metrics: noStockMetrics{}}
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

// Get returns the customer's cart, re-priced.
func (s *Service) Get(ctx context.Context, customerID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID, nil)
}

// Policy exposes the order rules for the public `GET /v1/cart/policy` read — how a GUEST, who has no
// server cart, still learns the minimum and the ceilings so their cart can gate honestly (FR-054).
func (s *Service) Policy(ctx context.Context) (cartpolicy.Policy, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return s.policy.Policy(ctx)
}

// Preview re-prices a client-supplied line set and WRITES NOTHING. It exists because a guest has no
// server cart, yet FR-004 (a restored cart shows current prices), FR-021 and FR-022 apply to them just as
// much. Duplicate ids are summed then clamped; ids that do not resolve come back as `removed`.
func (s *Service) Preview(ctx context.Context, lines []LineInput) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}

	ids, qty := dedupe(lines, policy.MaxLineQuantity)
	if len(ids) > policy.MaxDistinctItems {
		ids = ids[:policy.MaxDistinctItems]
	}

	rows, err := s.repo.ProductSnapshots(ctx, ids)
	if err != nil {
		return Cart{}, err
	}
	byID := make(map[string]cartLineRow, len(rows))
	for _, row := range rows {
		byID[row.ProductID] = row
	}

	// Preserve the client's order, and report anything that did not resolve.
	ordered := make([]cartLineRow, 0, len(ids))
	var notices []Notice
	for _, id := range ids {
		row, ok := byID[id]
		if !ok {
			notices = append(notices, Notice{ProductID: id, Kind: NoticeRemoved})
			continue
		}
		row.Quantity = qty[id]
		ordered = append(ordered, row)
	}

	return s.assemble(ctx, assembleInput{
		lineRows: ordered,
		policy:   policy,
		extra:    notices,
		// A preview cannot sweep archived lines (there is no server cart to sweep) — they are reported
		// and excluded, which is the same outcome the shopper sees.
		sweep: false,
	})
}

// ── Mutations ───────────────────────────────────────────────────────────────────────────────────

// Add adds or increments a product. Refuses a missing/unpurchasable product and a cart already at the
// distinct-item ceiling; clamps the quantity rather than failing.
func (s *Service) Add(ctx context.Context, customerID, productID, changeID string, qty int) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}

	// The ceiling applies to DISTINCT products, so incrementing something already in the cart is always
	// allowed — being full must not stop a shopper adjusting what they already chose (FR-038).
	existing, err := s.repo.Lines(ctx, cartID)
	if err != nil {
		return Cart{}, err
	}
	if !containsProduct(existing, productID) && len(existing) >= policy.MaxDistinctItems {
		return Cart{}, ErrCartFull
	}

	// ⚠ 054: the stock check is on the RESULTING line quantity. Adding 2 to a line already holding 4
	// asks the shop for 6, and checking only the increment would let a shopper walk a line past the
	// shelf two taps at a time — the exact defect this feature exists to close. The read happens
	// AFTER the cart is resolved for that reason, and it subsumes the old purchasability check.
	if err := s.assertCanTake(ctx, productID, quantityOf(existing, productID)+qty); err != nil {
		return Cart{}, err
	}

	requested := qty
	clamped := clampTo(qty, policy.MaxLineQuantity)
	applied, err := s.repo.AddItem(ctx, cartID, productID, changeID, clamped, policy.MaxLineQuantity)
	if err != nil {
		return Cart{}, err
	}

	var extra []Notice
	// A duplicate change id means this exact action already happened: report nothing new, just the cart.
	if applied && (requested != clamped || wouldClamp(existing, productID, clamped, policy.MaxLineQuantity)) {
		extra = append(extra, Notice{
			ProductID: productID,
			Kind:      NoticeQuantityClamped,
			Detail:    fmt.Sprintf("Limited to %d per item", policy.MaxLineQuantity),
		})
	}
	return s.buildWith(ctx, cartID, policy, extra)
}

// SetQty sets a line's ABSOLUTE quantity; 0 or less removes it. The quantity is clamped to the ceiling
// with a notice rather than refused, because a clamp is not a failure — the shopper still gets a cart.
func (s *Service) SetQty(ctx context.Context, customerID, productID, changeID string, qty int) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if !validUUID(productID) {
		return Cart{}, ErrProductNotFound
	}
	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}

	if qty <= 0 {
		if _, err := s.repo.RemoveItem(ctx, cartID, productID, changeID); err != nil {
			return Cart{}, err
		}
		return s.buildWith(ctx, cartID, policy, nil)
	}

	// An absolute set asks for exactly `qty`, so that is what the shop must be able to supply.
	if err := s.assertCanTake(ctx, productID, qty); err != nil {
		return Cart{}, err
	}

	clamped := clampTo(qty, policy.MaxLineQuantity)
	applied, err := s.repo.SetQty(ctx, cartID, productID, changeID, clamped)
	if err != nil {
		return Cart{}, err
	}
	var extra []Notice
	if applied && clamped != qty {
		extra = append(extra, Notice{
			ProductID: productID,
			Kind:      NoticeQuantityClamped,
			Detail:    fmt.Sprintf("Limited to %d per item", policy.MaxLineQuantity),
		})
	}
	return s.buildWith(ctx, cartID, policy, extra)
}

// Remove deletes a payable line.
func (s *Service) Remove(ctx context.Context, customerID, productID, changeID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if !validUUID(productID) {
		return Cart{}, ErrProductNotFound
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if _, err := s.repo.RemoveItem(ctx, cartID, productID, changeID); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID, nil)
}

// Clear empties the payable cart. Set-aside items are deliberately untouched (FR-030).
func (s *Service) Clear(ctx context.Context, customerID, changeID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if _, err := s.repo.DeleteAllItems(ctx, cartID, changeID); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID, nil)
}

// Merge folds a device cart into the account cart at sign-in: the union of both, taking the GREATER
// quantity where they overlap (FR-011). Idempotent, so signing in twice or retrying an interrupted merge
// changes nothing (FR-012). Missing/unpurchasable products and non-positive quantities are skipped; an
// unavailable-but-existing product is still merged, and arrives flagged rather than silently dropped.
func (s *Service) Merge(ctx context.Context, customerID, changeID string, lines []LineInput) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}

	ids, qtyByID := dedupe(lines, policy.MaxLineQuantity)

	// Keep only products that still exist and are not archived. An `unavailable` product IS merged: the
	// shopper chose it, and FR (US3 scenario 4) requires it to arrive flagged, not disappeared.
	keptIDs := make([]string, 0, len(ids))
	quantities := make([]int32, 0, len(ids))
	for _, id := range ids {
		prod, found, err := s.repo.ProductStatus(ctx, id)
		if err != nil {
			return Cart{}, err
		}
		if !found || prod.Status == statusArchived {
			continue
		}
		keptIDs = append(keptIDs, id)
		quantities = append(quantities, int32(qtyByID[id]))
	}
	// Respect the distinct-item ceiling across the merged result rather than per item.
	keptIDs, quantities = capDistinct(ctx, s.repo, cartID, keptIDs, quantities, policy.MaxDistinctItems)

	if _, err := s.repo.MergeItems(ctx, cartID, changeID, keptIDs, quantities, policy.MaxLineQuantity); err != nil {
		return Cart{}, err
	}
	return s.buildWith(ctx, cartID, policy, nil)
}

// SetAside moves a line out of the payable cart, keeping it (FR-028).
func (s *Service) SetAside(ctx context.Context, customerID, productID, changeID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if !validUUID(productID) {
		return Cart{}, ErrProductNotFound
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if _, err := s.repo.SetAside(ctx, cartID, productID, changeID); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID, nil)
}

// RestoreSaved moves a set-aside line back into the cart at its CURRENT price (FR-029). An unavailable
// product is refused: putting a line back that cannot be bought is not a restore, it is a trap (FR-031).
func (s *Service) RestoreSaved(ctx context.Context, customerID, productID, changeID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if err := s.assertPurchasable(ctx, productID); err != nil {
		return Cart{}, err
	}
	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}

	existing, err := s.repo.Lines(ctx, cartID)
	if err != nil {
		return Cart{}, err
	}
	if !containsProduct(existing, productID) && len(existing) >= policy.MaxDistinctItems {
		return Cart{}, ErrCartFull
	}
	if _, err := s.repo.RestoreSaved(ctx, cartID, productID, changeID, policy.MaxLineQuantity); err != nil {
		return Cart{}, err
	}
	return s.buildWith(ctx, cartID, policy, nil)
}

// DeleteSaved discards a set-aside line.
func (s *Service) DeleteSaved(ctx context.Context, customerID, productID, changeID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if !validUUID(productID) {
		return Cart{}, ErrProductNotFound
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if _, err := s.repo.DeleteSaved(ctx, cartID, productID, changeID); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID, nil)
}

// Reorder puts a past order's items back in the cart (FR-034), and reports exactly what could not come
// back (FR-035).
//
// ⚠ Union with MAXIMUM against the current cart, not an addition — so a double tap cannot double
// quantities (SC-011), which is the same property merge relies on. The ceiling is applied to the BATCH as
// a whole rather than item by item, which is what makes "3 added, 2 could not be" an honest sentence
// rather than an arbitrary prefix of the order.
//
// The report names no shop, ever (FR-062): it carries the product's own name and a reason, nothing else.
func (s *Service) Reorder(ctx context.Context, customerID, orderID, changeID string) (ReorderResult, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if !validUUID(orderID) {
		return ReorderResult{}, ErrOrderNotFound
	}
	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return ReorderResult{}, err
	}
	candidates, found, err := s.repo.OrderItemsForReorder(ctx, customerID, orderID)
	if err != nil {
		return ReorderResult{}, err
	}
	// No rows means either "no such order" or "not this customer's". Both are a 404, deliberately: whether
	// an order exists is not disclosed to someone who does not own it.
	if !found {
		return ReorderResult{}, ErrOrderNotFound
	}

	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return ReorderResult{}, err
	}
	existing, err := s.repo.Lines(ctx, cartID)
	if err != nil {
		return ReorderResult{}, err
	}
	present := map[string]bool{}
	for _, row := range existing {
		present[row.ProductID] = true
	}
	room := policy.MaxDistinctItems - len(existing)

	skipped := make([]Skipped, 0)
	ids := make([]string, 0, len(candidates))
	quantities := make([]int32, 0, len(candidates))

	for _, c := range candidates {
		switch {
		case c.Status == nil || *c.Status == statusArchived:
			// The product is gone for good. Reported, never silently omitted.
			skipped = append(skipped, Skipped{ProductID: c.ProductID, Name: c.Name, Reason: SkipRemoved})
			continue
		// 054: a reorder of something the shop has run out of is skipped as unavailable, exactly like
		// one the operator withdrew. Same outcome, and the shopper is told either way — what they must
		// NOT get is it silently added to a cart that cannot be paid for.
		case !availability.Purchasable(*c.Status, c.StockTracked != nil && *c.StockTracked, c.StockOnHand):
			skipped = append(skipped, Skipped{ProductID: c.ProductID, Name: c.Name, Reason: SkipUnavailable})
			continue
		}
		if !present[c.ProductID] {
			if room <= 0 {
				skipped = append(skipped, Skipped{ProductID: c.ProductID, Name: c.Name, Reason: SkipCartFull})
				continue
			}
			room--
		}
		qty := c.Quantity
		if qty > policy.MaxLineQuantity {
			qty = policy.MaxLineQuantity
			skipped = append(skipped, Skipped{ProductID: c.ProductID, Name: c.Name, Reason: SkipClamped})
		}
		ids = append(ids, c.ProductID)
		quantities = append(quantities, int32(qty))
	}

	if len(ids) > 0 {
		if _, err := s.repo.MergeItems(ctx, cartID, changeID, ids, quantities, policy.MaxLineQuantity); err != nil {
			return ReorderResult{}, err
		}
	}
	cart, err := s.buildWith(ctx, cartID, policy, nil)
	if err != nil {
		return ReorderResult{}, err
	}
	return ReorderResult{Cart: cart, Skipped: skipped}, nil
}

// ApplyPromo puts a code on the cart (FR-041).
//
// ⚠ Validated entirely here (FR-042). The client sends a string; it never decides whether a code is good
// or what it is worth. The code is stored on the cart; the AMOUNT is not, because it has to be recomputed
// against whatever the cart looks like when it is next read.
func (s *Service) ApplyPromo(ctx context.Context, customerID, rawCode string, now time.Time) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}
	code, found, err := s.repo.PromoByCode(ctx, NormalisePromoCode(rawCode))
	if err != nil {
		return Cart{}, err
	}
	if !found {
		return Cart{}, ErrPromoUnknown
	}
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	usage, err := s.repo.PromoUsageFor(ctx, code.ID, customerID)
	if err != nil {
		return Cart{}, err
	}

	// Evaluate against the CURRENT payable subtotal — the same figure the shopper is looking at.
	lines, _, _, err := s.repo.AllLines(ctx, cartID)
	if err != nil {
		return Cart{}, err
	}
	payable := payableCents(lines)
	if _, err := EvaluatePromo(code, usage, payable, now); err != nil {
		return Cart{}, err
	}

	if _, err := s.repo.SetCartPromo(ctx, cartID, &code.ID, ""); err != nil {
		return Cart{}, err
	}
	return s.buildWith(ctx, cartID, policy, nil)
}

// RemovePromo takes the code off. Idempotent — removing nothing is not an error.
func (s *Service) RemovePromo(ctx context.Context, customerID string) (Cart, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return Cart{}, err
	}
	if _, err := s.repo.SetCartPromo(ctx, cartID, nil, ""); err != nil {
		return Cart{}, err
	}
	return s.build(ctx, cartID, nil)
}

// DiscountForCustomer re-computes the cart's discount at the moment money is decided (027 FR-027).
//
// ⚠ This is checkout's `PromoSource`. It exists so the amount charged is recomputed from the code and the
// payable subtotal at intent time — never carried from a cart response the client saw, and never taken
// from the request. The caps are re-checked HERE too: a code the shopper has since exhausted on another
// order must not still discount this one.
func (s *Service) DiscountForCustomer(ctx context.Context, customerID string, payableCents int64, now time.Time) (int64, string, string, error) {
	cartID, err := s.repo.GetOrCreateCartID(ctx, customerID)
	if err != nil {
		return 0, "", "", err
	}
	meta, err := s.repo.Meta(ctx, cartID)
	if err != nil || meta.PromoCodeID == "" {
		return 0, "", "", err
	}
	code, found, err := s.repo.PromoByID(ctx, meta.PromoCodeID)
	if err != nil || !found {
		return 0, "", "", err
	}
	usage, err := s.repo.PromoUsageFor(ctx, code.ID, customerID)
	if err != nil {
		return 0, "", "", err
	}
	amount, evalErr := EvaluatePromo(code, usage, payableCents, now)
	if evalErr != nil {
		// A code that no longer qualifies simply does not discount. It is NOT an error: refusing the whole
		// checkout because a promotion lapsed would be a worse outcome than charging the honest full price,
		// and the cart already told the shopper it stopped applying.
		return 0, "", "", nil
	}
	return amount, code.ID, code.Code, nil
}

// payableCents sums the lines the shopper can actually buy.
func payableCents(rows []cartLineRow) int64 {
	var total int64
	for _, row := range rows {
		// ⚠ 054 FR-017: a line the shop cannot supply is excluded from the PAYABLE total. This is the
		// one place that decides what a shopper is actually asked to pay, so an out-of-stock line
		// dropping out here is what keeps FR-020 true — the amount never covers units that are gone.
		if !availability.Purchasable(row.Status, row.StockTracked, row.StockOnHand) {
			continue
		}
		if cents, err := money.ParseCents(row.UnitPriceAmount); err == nil {
			total += cents * int64(row.Quantity)
		}
	}
	return total
}

// ── Assembly ────────────────────────────────────────────────────────────────────────────────────

func (s *Service) build(ctx context.Context, cartID string, extra []Notice) (Cart, error) {
	policy, err := s.policy.Policy(ctx)
	if err != nil {
		return Cart{}, err
	}
	return s.buildWith(ctx, cartID, policy, extra)
}

func (s *Service) buildWith(ctx context.Context, cartID string, policy cartpolicy.Policy, extra []Notice) (Cart, error) {
	// ONE round trip for the payable lines, the set-aside lines and the revision. It used to be three.
	lineRows, savedRows, revision, err := s.repo.AllLines(ctx, cartID)
	if err != nil {
		return Cart{}, err
	}
	return s.assemble(ctx, assembleInput{
		cartID:       cartID,
		lineRows:     lineRows,
		savedRows:    savedRows,
		revision:     revision,
		policy:       policy,
		extra:        extra,
		sweep:        true,
		withDiscount: true,
	})
}

// discountFor re-evaluates the cart's applied code against what the cart looks like NOW.
//
// ⚠ Re-evaluated on EVERY read, never stored. A shopper who applies a $10-off-$50 code and then removes
// half their basket must stop getting $10 off — and must be TOLD, not silently charged more than the total
// they were last shown (FR-047). A stored amount could not do either.
//
// Returns the discount, a notice when the code has stopped applying, and whether it should be cleared.
func (s *Service) discountFor(ctx context.Context, cartID string, payable int64, now time.Time) (*Discount, int64, []Notice) {
	meta, err := s.repo.Meta(ctx, cartID)
	if err != nil || meta.PromoCodeID == "" {
		return nil, 0, nil
	}
	code, found, err := s.repo.PromoByID(ctx, meta.PromoCodeID)
	if err != nil || !found {
		return nil, 0, nil
	}
	// Usage is not re-counted here: the caps were checked when the code was applied, and a read is not the
	// moment to spend a query proving a cap the shopper cannot have moved by looking at their cart. The
	// authoritative check happens again at checkout, where it matters.
	amount, evalErr := EvaluatePromo(code, PromoUsage{}, payable, now)
	if evalErr != nil {
		return nil, 0, []Notice{{
			Kind:   NoticePromoNoLongerApplies,
			Detail: promoReason(evalErr, code),
		}}
	}
	return &Discount{
		Code:   code.Code,
		Kind:   code.Kind,
		Amount: money.FormatCents(amount),
		Label:  PromoLabel(code),
	}, amount, nil
}

// promoReason is the shopper-facing explanation for a code that stopped applying. Never names a shop.
func promoReason(err error, code PromoCode) string {
	switch {
	case errors.Is(err, ErrPromoBelowMinimum):
		return "Your cart is now below the " + money.FormatCents(code.MinimumSubtotalCents) + " minimum for this code."
	case errors.Is(err, ErrPromoExpired):
		return "That code has expired."
	case errors.Is(err, ErrPromoNotStarted):
		return "That code is not active yet."
	case errors.Is(err, ErrPromoDisabled):
		return "That code is no longer available."
	default:
		return "That code no longer applies to your cart."
	}
}

type assembleInput struct {
	cartID       string
	lineRows     []cartLineRow
	savedRows    []cartLineRow
	revision     int64
	policy       cartpolicy.Policy
	extra        []Notice
	sweep        bool
	withDiscount bool
}

// assemble turns rows into the cart the client sees: presigned images, honest availability and price
// change reporting, totals in integer cents, and the checkout gate.
func (s *Service) assemble(ctx context.Context, in assembleInput) (Cart, error) {
	notices := make([]Notice, 0, len(in.extra)+len(in.lineRows))
	notices = append(notices, in.extra...)

	// An `archived` product is terminal — sweep the line rather than leaving a shopper looking at
	// something they can never buy (research R11). `unavailable`/`draft` are kept and flagged.
	var archived []string
	kept := make([]cartLineRow, 0, len(in.lineRows))
	for _, row := range in.lineRows {
		if row.Status == statusArchived {
			archived = append(archived, row.ProductID)
			notices = append(notices, Notice{ProductID: row.ProductID, Kind: NoticeRemoved, Detail: row.Name})
			continue
		}
		kept = append(kept, row)
	}
	if in.sweep && len(archived) > 0 {
		if err := s.repo.DeleteLines(ctx, in.cartID, archived); err != nil {
			return Cart{}, err
		}
	}

	lines, subtotalCents, lineNotices, err := s.toLines(ctx, kept, true)
	if err != nil {
		return Cart{}, err
	}
	notices = append(notices, lineNotices...)

	// Saved lines are shown honestly but contribute to NOTHING. Their notices are omitted on purpose:
	// a cart-level warning about something the shopper has explicitly set aside is noise, and the line
	// itself already shows its state.
	savedLines, _, _, err := s.toLines(ctx, in.savedRows, false)
	if err != nil {
		return Cart{}, err
	}

	// The revision came with the lines (one round trip). A sweep mutates, so it advances the revision by
	// exactly the number of sweeps performed — cheaper than paying for another read to discover that.
	revision := in.revision
	if in.sweep && len(archived) > 0 {
		revision++
	}

	// 021: delivery is priced per package at checkout (it needs an address), not in the cart. The cart
	// shows the item subtotal only, and the client renders "calculated at checkout".
	var discount *Discount
	discountCents := int64(0)
	if in.withDiscount && in.cartID != "" {
		d, cents, promoNotices := s.discountFor(ctx, in.cartID, subtotalCents, time.Now())
		discount, discountCents = d, cents
		notices = append(notices, promoNotices...)
	}
	grandCents := subtotalCents - discountCents

	return Cart{
		Revision:           revision,
		Lines:              lines,
		SavedLines:         savedLines,
		ItemSubtotalAmount: money.FormatCents(subtotalCents),
		DiscountAmount:     money.FormatCents(discountCents),
		GrandTotalAmount:   money.FormatCents(grandCents),
		Currency:           pricing.Currency,
		Notices:            notices,
		Discount:           discount,
		Checkout:           checkoutState(len(lines), payableCount(lines), grandCents, in.policy),
		Limits:             Limits{MaxLineQuantity: in.policy.MaxLineQuantity, MaxDistinctItems: in.policy.MaxDistinctItems},
	}, nil
}

// toLines maps rows to domain lines, presigning images and reporting price changes. `collectNotices`
// is false for saved lines (see assemble).
func (s *Service) toLines(ctx context.Context, rows []cartLineRow, collectNotices bool) ([]Line, int64, []Notice, error) {
	lines := make([]Line, 0, len(rows))
	notices := make([]Notice, 0)
	var subtotalCents int64

	for _, row := range rows {
		available := availability.Purchasable(row.Status, row.StockTracked, row.StockOnHand)
		unitCents, err := money.ParseCents(row.UnitPriceAmount)
		if err != nil {
			return nil, 0, nil, err
		}
		// ⚠ 054 FR-017: the PRESENTED quantity is capped at what the shop can supply, and the subtotal
		// is computed from that capped number.
		//
		// ⚠ WHY CAP THE QUANTITY RATHER THAN JUST THE SUBTOTAL. Leaving `Quantity` at 5 while charging
		// for 2 makes `lineSubtotal != unitPrice × quantity`, which is exactly the defect 051/052 had
		// to chase on the mobile receipt — lines that did not add up. Every surface that renders a cart
		// does that multiplication somewhere, and one that disagrees with the server is a bug nobody
		// can see in a DOM assertion. The cart ROW is untouched: if stock returns, so does the 5.
		payableQty := row.Quantity
		if row.StockTracked && row.StockOnHand != nil && *row.StockOnHand < payableQty {
			payableQty = *row.StockOnHand
		}
		if payableQty < 0 {
			payableQty = 0
		}
		lineCents := unitCents * int64(payableQty)

		var imageURL string
		if row.StorageKey != nil {
			if url, e := s.presign.PresignGet(ctx, *row.StorageKey); e == nil {
				imageURL = url
			}
		}

		// A price change is only reportable when we recorded what it was. A NULL add-time price (a line
		// predating 027) reports nothing — inventing a comparison would fabricate a change.
		changedFrom := ""
		if row.UnitPriceAtAdd != nil && *row.UnitPriceAtAdd != row.UnitPriceAmount {
			changedFrom = *row.UnitPriceAtAdd
			if collectNotices {
				notices = append(notices, Notice{ProductID: row.ProductID, Kind: NoticePriceChanged, Detail: row.Name})
			}
		}

		if available {
			subtotalCents += lineCents
			// Partially supplied: the shopper asked for more than the shop has. Told, not silently
			// reduced — FR-017's "the shopper MUST be told what changed".
			if collectNotices && payableQty < row.Quantity {
				notices = append(notices, Notice{
					ProductID: row.ProductID,
					Kind:      NoticeQuantityClamped,
					Detail:    fmt.Sprintf("Only %d of %s available", payableQty, row.Name),
				})
			}
		} else if collectNotices {
			// ⚠ ONE NOTICE KIND, TWO CAUSES, AND THE CAUSE IS IN THE DETAIL (FR-014). "Out of stock"
			// and "no longer sold" ask different things of a shopper — wait, versus give up — and this
			// is the surface where they are about to pay, so collapsing them here would undo the
			// distinction the saved list is built around.
			notices = append(notices, Notice{
				ProductID: row.ProductID,
				Kind:      NoticeUnavailable,
				Detail:    unavailableDetail(row),
			})
		}

		lines = append(lines, Line{
			ID:                 row.ID,
			ProductID:          row.ProductID,
			Name:               row.Name,
			ImageURL:           imageURL,
			UnitPriceAmount:    row.UnitPriceAmount,
			Quantity:           payableQty,
			LineSubtotalAmount: money.FormatCents(lineCents),
			Available:          available,
			PriceChangedFrom:   changedFrom,
			PackageKey:         PackageKey(row.ShopID),
		})
	}
	return lines, subtotalCents, notices, nil
}

// checkoutState decides whether the shopper may proceed, and says why not when they may not — so the
// cart states it up front instead of letting them walk into a refusal at payment (FR-054). The same
// decision is re-made server-side at checkout intent, because a client may ignore this (FR-056).
func checkoutState(lineCount, payable int, payableCents int64, policy cartpolicy.Policy) CheckoutState {
	minimum := ""
	if policy.HasMinimum() {
		minimum = money.FormatCents(policy.MinimumSubtotalCents)
	}
	switch {
	case lineCount == 0:
		return CheckoutState{BlockedReason: BlockedEmpty, MinimumSubtotalAmount: minimum}
	case payable == 0:
		return CheckoutState{BlockedReason: BlockedNoPayableItems, MinimumSubtotalAmount: minimum}
	case !policy.Meets(payableCents):
		return CheckoutState{
			BlockedReason:         BlockedBelowMinimum,
			MinimumSubtotalAmount: minimum,
			RemainingAmount:       money.FormatCents(policy.Remaining(payableCents)),
		}
	default:
		return CheckoutState{Allowed: true, MinimumSubtotalAmount: minimum}
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

// InsufficientStockError refuses a quantity the shop cannot supply, AND SAYS HOW MANY IT CAN.
//
// ⚠ THE NUMBER IS THE POINT (FR-016, FR-015b). "That product is unavailable" leaves a shopper with
// nothing to do; "only 2 available" lets them take the two. It is also the one place a count may
// reach a customer at all — FR-015 keeps stock off every browse surface — and it is permitted here
// precisely because the cap already discloses that bound: a shopper who tries 5, then 3, then 2
// learns the number anyway, so withholding it removes only their ability to act on it.
type InsufficientStockError struct {
	ProductID string
	Available int
}

func (e *InsufficientStockError) Error() string {
	return fmt.Sprintf("cart: only %d available", e.Available)
}

// assertPurchasable verifies the product exists and can actually be bought right now.
//
// ⚠ 054: "can be bought" is availability.Purchasable, not `status == active`. The rule is defined
// once, in one package, and every surface that asks this question reads it from there — see
// internal/platform/availability for why that matters more than it looks like it should.
func (s *Service) assertPurchasable(ctx context.Context, productID string) error {
	if !validUUID(productID) {
		return ErrProductNotFound
	}
	prod, found, err := s.repo.ProductStatus(ctx, productID)
	if err != nil {
		return err
	}
	if !found {
		return ErrProductNotFound
	}
	if !availability.Purchasable(prod.Status, prod.StockTracked, prod.StockOnHand) {
		return ErrProductUnavailable
	}
	return nil
}

// assertCanTake is assertPurchasable plus "and there are at least `want` of them".
//
// ⚠ `want` is the RESULTING line quantity, not the increment. Adding 2 to a line that already holds 4
// asks the shop for 6, and checking only the increment would let a shopper walk a line past the shelf
// two at a time — which is the whole defect this feature exists to close.
func (s *Service) assertCanTake(ctx context.Context, productID string, want int) error {
	if !validUUID(productID) {
		return ErrProductNotFound
	}
	prod, found, err := s.repo.ProductStatus(ctx, productID)
	if err != nil {
		return err
	}
	if !found {
		return ErrProductNotFound
	}
	if !availability.Purchasable(prod.Status, prod.StockTracked, prod.StockOnHand) {
		return ErrProductUnavailable
	}
	if prod.StockTracked && prod.StockOnHand != nil && want > *prod.StockOnHand {
		s.metrics.StockBlocked("add")
		return &InsufficientStockError{ProductID: productID, Available: *prod.StockOnHand}
	}
	return nil
}

// dedupe sums duplicate product ids, clamps to max, drops non-positive quantities and invalid ids, and
// returns the ids in first-appearance order (so the shopper's own ordering survives).
func dedupe(lines []LineInput, max int) ([]string, map[string]int) {
	qty := map[string]int{}
	order := make([]string, 0, len(lines))
	for _, l := range lines {
		if l.Quantity <= 0 || !validUUID(l.ProductID) {
			continue
		}
		if _, seen := qty[l.ProductID]; !seen {
			order = append(order, l.ProductID)
		}
		qty[l.ProductID] += l.Quantity
	}
	for id, q := range qty {
		qty[id] = clampTo(q, max)
	}
	return order, qty
}

// capDistinct trims a batch so the resulting cart cannot exceed the distinct-item ceiling. Products
// already in the cart are free (they are updates, not additions).
func capDistinct(ctx context.Context, repo Repo, cartID string, ids []string, quantities []int32, max int) ([]string, []int32) {
	existing, err := repo.Lines(ctx, cartID)
	if err != nil {
		return ids, quantities // the mutation itself will still be bounded by the table's own constraints
	}
	present := map[string]bool{}
	for _, row := range existing {
		present[row.ProductID] = true
	}
	room := max - len(existing)
	outIDs := make([]string, 0, len(ids))
	outQty := make([]int32, 0, len(ids))
	for i, id := range ids {
		if !present[id] {
			if room <= 0 {
				continue
			}
			room--
		}
		outIDs = append(outIDs, id)
		outQty = append(outQty, quantities[i])
	}
	return outIDs, outQty
}

// unavailableDetail says WHY a line cannot be supplied, in words a shopper can act on.
//
// ⚠ It never discloses a count or a shop — FR-015. "Out of stock" is a state, not a number, and it is
// the shopper's own cart, so naming the product is not a disclosure.
func unavailableDetail(row cartLineRow) string {
	if row.Status == statusArchived {
		return row.Name + " is no longer sold"
	}
	if row.StockTracked && (row.StockOnHand == nil || *row.StockOnHand <= 0) {
		return row.Name + " is out of stock"
	}
	return row.Name + " is unavailable right now"
}

// quantityOf is what the line already holds — 0 when the product is not in the cart.
func quantityOf(rows []cartLineRow, productID string) int {
	for _, r := range rows {
		if r.ProductID == productID {
			return r.Quantity
		}
	}
	return 0
}

func containsProduct(rows []cartLineRow, productID string) bool {
	for _, row := range rows {
		if row.ProductID == productID {
			return true
		}
	}
	return false
}

// wouldClamp reports whether incrementing an existing line by `add` would hit the ceiling.
func wouldClamp(rows []cartLineRow, productID string, add, max int) bool {
	for _, row := range rows {
		if row.ProductID == productID {
			return row.Quantity+add > max
		}
	}
	return false
}

func payableCount(lines []Line) int {
	n := 0
	for _, l := range lines {
		if l.Available {
			n++
		}
	}
	return n
}

func clampTo(qty, max int) int {
	if qty < 1 {
		return 1
	}
	if qty > max {
		return max
	}
	return qty
}

func validUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}
