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

	"github.com/effyshopping/effy/apis/core-api/internal/platform/cartpolicy"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
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

// Product lifecycle values this service reasons about (016). Only `active` is purchasable; `archived` is
// terminal and its line is swept away; `draft` and `unavailable` are flagged but kept, because a shopper
// may reasonably wait a temporary state out (research R11).
const (
	statusActive   = "active"
	statusArchived = "archived"
)

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
	DeliveryFeeAmount  string
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
	ProductStatus(ctx context.Context, productID string) (status, price string, found bool, err error)
	ProductSnapshots(ctx context.Context, productIDs []string) ([]cartLineRow, error)
	OrderItemsForReorder(ctx context.Context, customerID, orderID string) ([]ReorderCandidate, bool, error)

	AddItem(ctx context.Context, cartID, productID, changeID string, qty, max int) (bool, error)
	SetQty(ctx context.Context, cartID, productID, changeID string, qty int) (bool, error)
	RemoveItem(ctx context.Context, cartID, productID, changeID string) (bool, error)
	DeleteAllItems(ctx context.Context, cartID, changeID string) (bool, error)
	DeleteLines(ctx context.Context, cartID string, productIDs []string) error
	MergeItems(ctx context.Context, cartID, changeID string, productIDs []string, quantities []int32, max int) (bool, error)
	SetAside(ctx context.Context, cartID, productID, changeID string) (bool, error)
	RestoreSaved(ctx context.Context, cartID, productID, changeID string, max int) (bool, error)
	DeleteSaved(ctx context.Context, cartID, productID, changeID string) (bool, error)
}

type Service struct {
	repo    Repo
	presign media.Presigner
	policy  cartpolicy.Reader
}

func NewService(repo Repo, presign media.Presigner, policy cartpolicy.Reader) *Service {
	return &Service{repo: repo, presign: presign, policy: policy}
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
	if err := s.assertPurchasable(ctx, productID); err != nil {
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
		status, _, found, err := s.repo.ProductStatus(ctx, id)
		if err != nil {
			return Cart{}, err
		}
		if !found || status == statusArchived {
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
		cartID:    cartID,
		lineRows:  lineRows,
		savedRows: savedRows,
		revision:  revision,
		policy:    policy,
		extra:     extra,
		sweep:     true,
	})
}

type assembleInput struct {
	cartID    string
	lineRows  []cartLineRow
	savedRows []cartLineRow
	revision  int64
	policy    cartpolicy.Policy
	extra     []Notice
	sweep     bool
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
	discountCents := int64(0)
	grandCents := subtotalCents - discountCents

	return Cart{
		Revision:           revision,
		Lines:              lines,
		SavedLines:         savedLines,
		ItemSubtotalAmount: money.FormatCents(subtotalCents),
		DiscountAmount:     money.FormatCents(discountCents),
		DeliveryFeeAmount:  money.FormatCents(0),
		GrandTotalAmount:   money.FormatCents(grandCents),
		Currency:           pricing.Currency,
		Notices:            notices,
		Discount:           nil,
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
		available := row.Status == statusActive
		unitCents, err := money.ParseCents(row.UnitPriceAmount)
		if err != nil {
			return nil, 0, nil, err
		}
		lineCents := unitCents * int64(row.Quantity)

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
		} else if collectNotices {
			notices = append(notices, Notice{ProductID: row.ProductID, Kind: NoticeUnavailable, Detail: row.Name})
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
			PriceChangedFrom:   changedFrom,
			PackageKey:         delivery.PackageKey(row.ShopID),
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

// assertPurchasable verifies the product exists and is active.
func (s *Service) assertPurchasable(ctx context.Context, productID string) error {
	if !validUUID(productID) {
		return ErrProductNotFound
	}
	status, _, found, err := s.repo.ProductStatus(ctx, productID)
	if err != nil {
		return err
	}
	if !found {
		return ErrProductNotFound
	}
	if status != statusActive {
		return ErrProductUnavailable
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
