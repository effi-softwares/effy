package saveditems

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/features/cart"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
)

// Service layer: business shaping. No HTTP, no SQL. Version-neutral.

// ── Caps (FR-046/FR-047) ────────────────────────────────────────────────────────────────────────

// AccountCap bounds an account's saved list.
//
// 200 is generous for grocery (eBay caps a watchlist at 400, Target lists at 250, commercetools a
// shopping list at 100 line items) and it is what keeps the whole-set membership read cheap enough to
// issue once per screen. ⚠ Reaching it REFUSES the save. Nothing already saved is ever evicted to
// make room — silently discarding something a shopper deliberately saved is unforgivable, and it is
// exactly the "helpful" behaviour that destroys trust in a list.
const AccountCap = 200

// GuestCap bounds a device-held list, which has no account behind it. Enforced client-side; stated
// here so both surfaces read one number.
const GuestCap = 50

// ── Verdicts ────────────────────────────────────────────────────────────────────────────────────

// The five outcomes of "can this shopper buy this, right now, at the address they are shopping for?"
//
// ⚠ FIVE VALUES, NOT A BOOLEAN, because each implies a different next action and collapsing any two
// tells the shopper nothing they can act on. "Unavailable" and "we don't deliver that to you" are
// different statements; merging them is the 031 REGIONAL defect in miniature.
// ⚠ THREE VALUES, NOT FIVE. `not_delivered_to_your_area` and `not_yet_determined` were both derived
// from delivery zones, and delivery zones were withdrawn from the platform. The list still tells the
// truth about stock and withdrawal — it simply has nothing to say about delivery reach, because
// nothing on the platform knows it. Each remaining value still implies a different next action:
//
//	purchasable             → buy now
//	temporarily_unavailable → sold, not in stock — wait
//	no_longer_sold          → withdrawn entirely — give up
//
// ⚠ 054: `temporarily_unavailable` now has TWO causes — the operator switched the product off, or
// the shop has run out — and they collapse to one verdict deliberately. The shopper's next action is
// identical for both ("wait"), and the second cause is not theirs to know about; distinguishing them
// would disclose stock state without changing anything a shopper could do.
const (
	VerdictPurchasable    = "purchasable"
	VerdictTemporarilyOut = "temporarily_unavailable"
	VerdictNoLongerSold   = "no_longer_sold"
)

// ── Domain ──────────────────────────────────────────────────────────────────────────────────────

// Item is one entry in the saved list, as the shopper sees it.
type Item struct {
	ProductID       string
	Name            string
	Brand           *string
	ImageURL        *string
	PriceAmount     string
	Currency        string
	CompareAtAmount *string
	Badges          []string
	SavedAt         string
	// The baseline PriceDropped is measured against — the price at the moment of saving.
	SavedPriceAmount string
	PriceDropped     bool
	Verdict          string
	CategoryKey      *string
}

// Membership is the shopper's whole set of saved product ids.
type Membership struct {
	ProductIDs []string
	Count      int
}

// Reader is the repository seam. Declared here so the service can be tested with a hand-rolled fake
// and no database (the house pattern — see storefront/service_test.go).
type Reader interface {
	MembershipIDs(ctx context.Context, customerID string) ([]string, error)
	List(ctx context.Context, customerID string) ([]listRow, error)
	Save(ctx context.Context, customerID, productID string, savedAt *time.Time, cap int) error
	Remove(ctx context.Context, customerID, productID string) error
	Merge(ctx context.Context, customerID string, items []MergeItem, cap int) (int, []Skip, []string, error)
}

// CartAdder is the cart seam for the bulk add (FR-051).
//
// ⚠ Narrow ON PURPOSE. Saved items must not import the cart feature wholesale — it only needs to put
// one product in, and a wider dependency would let this package start making cart decisions that
// belong to the cart.
type CartAdder interface {
	Add(ctx context.Context, customerID, productID, changeID string, qty int) error
}

type Service struct {
	repo    Reader
	presign media.Presigner
	cart    CartAdder
}

func NewService(repo Reader, presign media.Presigner) *Service {
	return &Service{repo: repo, presign: presign}
}

// WithCart wires the bulk add. Optional, so the service is constructible in tests without a cart.
func (s *Service) WithCart(c CartAdder) *Service { s.cart = c; return s }

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

// Membership returns the shopper's saved product ids.
func (s *Service) Membership(ctx context.Context, customerID string) (Membership, error) {
	ids, err := s.repo.MembershipIDs(ctx, customerID)
	if err != nil {
		return Membership{}, err
	}
	return Membership{ProductIDs: ids, Count: len(ids)}, nil
}

// List returns the saved list with a verdict per item.
//
// ⚠ It takes no location. Delivery zones were withdrawn, so purchasability is decided by catalogue
// status alone and every address is implicitly deliverable.
func (s *Service) List(ctx context.Context, customerID string) ([]Item, error) {
	rows, err := s.repo.List(ctx, customerID)
	if err != nil {
		return nil, err
	}

	out := make([]Item, 0, len(rows))
	for _, r := range rows {
		out = append(out, Item{
			ProductID:        r.ProductID,
			Name:             r.Name,
			Brand:            r.Brand,
			ImageURL:         s.imageURL(ctx, r.StorageKey),
			PriceAmount:      r.PriceAmount,
			Currency:         r.Currency,
			CompareAtAmount:  r.CompareAtAmount,
			Badges:           badges(r),
			SavedAt:          r.SavedAt.UTC().Format(time.RFC3339),
			SavedPriceAmount: r.SavedPriceAmount,
			PriceDropped:     r.PriceDropped,
			Verdict:          r.Verdict,
			CategoryKey:      r.CategoryKey,
		})
	}
	return out, nil
}

// imageURL presigns the primary image.
//
// ⚠ A failed presign blanks the image and NEVER fails the read. A shopper losing one thumbnail is a
// blemish; losing their whole saved list because S3 hiccuped is an outage (storefront does the same).
func (s *Service) imageURL(ctx context.Context, key *string) *string {
	if key == nil || s.presign == nil {
		return nil
	}
	url, err := s.presign.PresignGet(ctx, *key)
	if err != nil {
		return nil
	}
	return &url
}

// badges derives the card badges the same way the storefront does, so a product does not look
// different here than it did where the shopper saved it.
//
// ⚠ The predecessor computed these server-side and both clients then DISCARDED them, passing
// brand=null / badges=[] into the card. The data was always there; the mapper threw it away.
func badges(r listRow) []string {
	out := make([]string, 0, 2)
	if r.CompareAtAmount != nil {
		out = append(out, "on_sale")
	}
	if r.IsNew {
		out = append(out, "new")
	}
	return out
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────

// Save records a saved item, idempotently.
//
// restoreSavedAt is set only by undo, which returns the item to the position it previously held
// (FR-018). An ordinary save leaves it nil and the row lands at the top — a deliberate re-save after
// a completed removal is a NEW save, and the list must be able to say so.
func (s *Service) Save(ctx context.Context, customerID, productID string, restoreSavedAt *time.Time) error {
	if !validUUID(productID) {
		// A malformed id names no product. 404 is the honest answer, not a validation error.
		return ErrProductNotFound
	}
	return s.repo.Save(ctx, customerID, productID, restoreSavedAt, AccountCap)
}

// Remove un-saves a product.
//
// ⚠ Deliberately does NOT check the product exists. Removing something absent is a no-op with the
// same end state; answering 404 would make a retried delete look like a failure.
func (s *Service) Remove(ctx context.Context, customerID, productID string) error {
	if !validUUID(productID) {
		return nil
	}
	return s.repo.Remove(ctx, customerID, productID)
}

// ── Zone resolution wired to the shared predicate ───────────────────────────────────────────────

// ── The guest → account join ────────────────────────────────────────────────────────────────────

// MergeResult is what the shopper's surface needs to DISCLOSE the join (FR-032).
type MergeResult struct {
	Added      int
	Skipped    []Skip
	ProductIDs []string
}

// Merge folds a device-held list into the account.
//
// ⚠ Sorted NEWEST-FIRST before it reaches the repository, because the cap truncates in the order it
// receives things. Left in the client's order, whichever items happened to be sent first would win —
// which is arbitrary. Newest-first at least means the shopper keeps what they cared about most
// recently, and it is a stated rule rather than an accident of iteration.
func (s *Service) Merge(ctx context.Context, customerID string, items []MergeItem) (MergeResult, error) {
	ordered := make([]MergeItem, len(items))
	copy(ordered, items)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].SavedAt.After(ordered[j].SavedAt) })

	added, skipped, ids, err := s.repo.Merge(ctx, customerID, ordered, AccountCap)
	if err != nil {
		return MergeResult{}, err
	}
	return MergeResult{Added: added, Skipped: skipped, ProductIDs: ids}, nil
}

// ── Adding to the cart (FR-049/FR-051/FR-052) ───────────────────────────────────────────────────

// AddToCartResult names what went in and what did not.
type AddToCartResult struct {
	Added   []string
	Skipped []Skip
}

// AddAllToCart puts every PURCHASABLE saved item in the cart.
//
// ⚠ THE SERVER DECIDES PURCHASABILITY, not the client. A client filtering by its own copy of the
// verdict would be re-implementing the four-term delivery predicate, and the two would drift — which
// is the exact class of defect this feature exists to remove.
//
// ⚠ NOTHING IS EVER SILENTLY OMITTED (FR-052). Every item that does not go in comes back named, with
// a reason. A bulk add that quietly drops what it could not take leaves the shopper believing they
// bought something they did not, and they find out at the till.
func (s *Service) AddAllToCart(ctx context.Context, customerID, changeID string) (AddToCartResult, error) {
	items, err := s.List(ctx, customerID)
	if err != nil {
		return AddToCartResult{}, err
	}

	res := AddToCartResult{Added: []string{}, Skipped: []Skip{}}
	for _, it := range items {
		if it.Verdict != VerdictPurchasable {
			// The verdict IS the reason — the shopper is told the same thing the list already says,
			// so the two can never give different explanations for the same item.
			res.Skipped = append(res.Skipped, Skip{ProductID: it.ProductID, Reason: it.Verdict})
			continue
		}
		if s.cart == nil {
			res.Skipped = append(res.Skipped, Skip{ProductID: it.ProductID, Reason: "unavailable"})
			continue
		}
		// ⚠ A DISTINCT changeId per item. They are separate shopper-visible outcomes, and one
		// id across the batch would let the cart's own dedupe treat the second item as a retry of
		// the first.
		if err := s.cart.Add(ctx, customerID, it.ProductID, itemChangeID(changeID, it.ProductID), 1); err != nil {
			// ⚠ The CART's refusal, carried through verbatim rather than flattened. "Your cart is
			// full" and "that is out of stock" need different things from the shopper.
			res.Skipped = append(res.Skipped, Skip{ProductID: it.ProductID, Reason: cartReason(err)})
			continue
		}
		res.Added = append(res.Added, it.ProductID)
	}
	return res, nil
}

// savedBulkNamespace seeds the per-item change ids a bulk add derives. Fixed forever: change it and
// every in-flight retry stops matching the id its first attempt used.
var savedBulkNamespace = uuid.MustParse("9c0a2f31-6e58-4a0e-9b3f-3f6a1c7f2d54")

// itemChangeID derives ONE change id per (batch, product).
//
// ⚠ THIS WAS `changeID + ":" + productID`, AND IT MADE THE ENTIRE BULK ADD A NO-OP.
//
// `public.cart_change_log.change_id` is a **uuid** column, and `"<uuid>:<uuid>"` is not a uuid — so
// every single insert failed with `invalid input syntax for type uuid`, the cart returned an error for
// every item, and `cartReason`'s default reported each one as "unavailable". On the phone that read as
// "0 items added to your cart" with all three products refused: the shopper is told their *products*
// are the problem when the request never reached the cart at all.
//
// ⚠ It was invisible to the tests because the fake cart in `service_test.go` accepts any string — the
// fixture agreed with the code instead of with the database, which is this slice's own recurring
// lesson (027 R13, 028's five defects). `TestItemChangeID*` now asserts the shape the column requires.
//
// v5 (name-based, SHA-1) rather than a fresh random id, because the determinism is the point: a
// retried bulk add carrying the same batch `changeId` must derive the SAME per-item ids, or the cart's
// dedupe cannot recognise the retry and the shopper is charged for two of everything.
func itemChangeID(changeID, productID string) string {
	return uuid.NewSHA1(savedBulkNamespace, []byte(changeID+":"+productID)).String()
}

// cartReason maps the cart's sentinels to a reason a client can act on.
func cartReason(err error) string {
	switch {
	case errors.Is(err, cart.ErrCartFull):
		return "cart_full"
	case errors.Is(err, cart.ErrProductUnavailable):
		return "temporarily_unavailable"
	case errors.Is(err, cart.ErrProductNotFound):
		return "not_found"
	default:
		return "unavailable"
	}
}
