package saveditems

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// Handler layer: HTTP only — call the service, map domain → wire DTO.

// ⚠ These shapes are pinned by packages/shared-types/src/saved-item.ts and by
// wire_contract_test.go. A key renamed here without renaming it there is a silent break that
// compiles on both sides.

type savedItemDTO struct {
	ProductID       string   `json:"id"`
	Name            string   `json:"name"`
	Brand           *string  `json:"brand"`
	ImageURL        *string  `json:"imageUrl"`
	PriceAmount     string   `json:"priceAmount"`
	Currency        string   `json:"currency"`
	CompareAtAmount *string  `json:"compareAtAmount"`
	Badges          []string `json:"badges"`
	SavedAt         string   `json:"savedAt"`
	SavedPrice      string   `json:"savedPriceAmount"`
	// ⚠ omitempty is load-bearing: absent means "no drop", and there is deliberately no
	// `priceRose` counterpart (FR-044).
	PriceDropped bool    `json:"priceDropped,omitempty"`
	Verdict      string  `json:"verdict"`
	CategoryKey  *string `json:"categoryKey,omitempty"`
}

type membershipDTO struct {
	ProductIDs []string `json:"productIds"`
	Count      int      `json:"count"`
	// 068. Always present (never null), so a client can read it without a guard.
	NamedProductIDs []string `json:"namedProductIds"`
}

// newMembershipDTO maps the domain to the wire. ⚠ A nil slice marshals as `null`, and a client that
// reads `namedProductIds.includes(...)` on null crashes — so the absence of named products is always
// the empty array.
func newMembershipDTO(m Membership) membershipDTO {
	named := m.NamedProductIDs
	if named == nil {
		named = []string{}
	}
	return membershipDTO{ProductIDs: m.ProductIDs, Count: m.Count, NamedProductIDs: named}
}

type saveRequest struct {
	// Set only by undo, restoring the item to the position it previously held (FR-018).
	RestoreSavedAt *string `json:"restoreSavedAt"`
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// membership answers the whole set of saved product ids for this shopper.
//
// ⚠ NO Cache-Control. This is per-shopper and must never reach a shared cache.
func (h *Handler) membership(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}
	m, err := h.svc.Membership(c.Request.Context(), cust.ID)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("saveditems: membership failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	c.JSON(http.StatusOK, newMembershipDTO(m))
}

// list answers the saved list with a verdict per item, against the shopper's current location.
func (h *Handler) list(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}

	// "Saved" is the default list (068). This route is what installed mobile builds call.
	h.writeItems(c, cust.ID, DefaultListRef)
}

// writeItems answers one list's products. Shared by /v1/saved and /v1/lists/:listId/items so the
// two cannot drift.
func (h *Handler) writeItems(c *gin.Context, customerID, listRef string) {
	items, err := h.svc.List(c.Request.Context(), customerID, listRef)
	if err != nil {
		if errors.Is(err, ErrListNotFound) {
			h.respond(c, err)
			return
		}
		logger.FromContext(c.Request.Context()).Error("saveditems: list failed", zap.Error(err))
		httpx.Internal(c)
		return
	}

	out := make([]savedItemDTO, 0, len(items))
	for _, it := range items {
		out = append(out, savedItemDTO{
			ProductID: it.ProductID, Name: it.Name, Brand: it.Brand, ImageURL: it.ImageURL,
			PriceAmount: it.PriceAmount, Currency: it.Currency, CompareAtAmount: it.CompareAtAmount,
			Badges: it.Badges, SavedAt: it.SavedAt, SavedPrice: it.SavedPriceAmount,
			PriceDropped: it.PriceDropped, Verdict: it.Verdict, CategoryKey: it.CategoryKey,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) save(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}

	var req saveRequest
	// A missing or unparseable body is fine — it only ever carries undo's restore timestamp.
	_ = c.ShouldBindJSON(&req)

	var restore *time.Time
	if req.RestoreSavedAt != nil {
		t, err := time.Parse(time.RFC3339, *req.RestoreSavedAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_restore_saved_at"})
			return
		}
		restore = &t
	}

	h.respond(c, h.svc.Save(c.Request.Context(), cust.ID, c.Param("productId"), restore))
}

func (h *Handler) remove(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}
	h.respond(c, h.svc.Remove(c.Request.Context(), cust.ID, c.Param("productId")))
}

// respond maps the service's sentinels to status codes.
//
// ⚠ ErrCapReached gets a NAMED reason rather than a generic validation failure. "You have too many
// saved items" and "that product does not exist" require completely different things of the shopper,
// and a client that cannot tell them apart can only say "something went wrong" — which is the same
// unhelpfulness 027 removed from promo refusals by giving them eight distinguishable reasons.
func (h *Handler) respond(c *gin.Context, err error) {
	switch {
	case err == nil:
		c.Status(http.StatusNoContent)
	case errors.Is(err, ErrProductNotFound):
		httpx.NotFound(c)
	case errors.Is(err, ErrCapReached):
		httpx.ValidationFailedAs(c, "saved_items_cap_reached",
			"You have reached the maximum number of saved items. Remove one to save another.")
	case errors.Is(err, ErrInNamedLists):
		// ⚠ 068 FR-020. Nothing was removed. A current client reads this as "open the list
		// chooser"; a build from before 068 reads any refusal as "revert the heart", which is the
		// right outcome for it too.
		refuse(c, http.StatusConflict, "in_named_lists",
			"This item is in one of your lists. Remove it from the list to stop saving it.")
	case errors.Is(err, ErrListNotFound):
		refuse(c, http.StatusNotFound, "list_not_found", "That list no longer exists.")
	case errors.Is(err, ErrNameTaken):
		refuse(c, http.StatusConflict, "name_taken", "You already have a list with that name.")
	case errors.Is(err, ErrInvalidName):
		httpx.ValidationFailedAs(c, "invalid_name", "A list name must be 1 to 40 characters.")
	case errors.Is(err, ErrListLimit):
		httpx.ValidationFailedAs(c, "list_limit", "You have reached the maximum number of lists.")
	case errors.Is(err, ErrDefaultList):
		httpx.ValidationFailedAs(c, "default_list", "This list cannot be renamed or deleted.")
	default:
		logger.FromContext(c.Request.Context()).Error("saveditems: write failed", zap.Error(err))
		httpx.Internal(c)
	}
}

// Register mounts the saved-items resource on a customer-scoped group.
//
// ⚠ auth.Middleware BEFORE customeridentity.Middleware — the latter depends on the verified subject.
// The customer is then read from the resolved identity in every handler, NEVER from the request: a
// client-supplied customer id is an authorization bypass.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/saved", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("/ids", h.membership)
	g.GET("", h.list)
	g.PUT("/:productId", h.save)
	// ⚠ Always 204, never 404 — deleting an absent membership is a no-op, and a 404 would make a
	// retried delete look like a failure. Deliberately asymmetric with PUT, which does 404.
	g.DELETE("/:productId", h.remove)
	g.POST("/merge", h.merge)
	g.POST("/add-to-cart", h.addToCart)

	registerLists(v1, verifier, identity, h)
}

// ── The guest → account join (FR-028/FR-032) ────────────────────────────────────────────────────

type mergeItemDTO struct {
	ProductID string `json:"productId"`
	// ⚠ Nullable. Absent means the device never observed a price — the platform then uses the
	// product's current price as the baseline rather than fabricating one.
	SavedPriceAmount *string `json:"savedPriceAmount"`
	SavedCurrency    *string `json:"savedCurrency"`
	SavedAt          string  `json:"savedAt"`
}

type mergeRequestDTO struct {
	Items []mergeItemDTO `json:"items"`
}

type skipDTO struct {
	ProductID string `json:"productId"`
	Reason    string `json:"reason"`
}

type mergeResultDTO struct {
	Added      int       `json:"added"`
	Skipped    []skipDTO `json:"skipped"`
	ProductIDs []string  `json:"productIds"`
}

// merge folds a device-held guest list into the account.
//
// ⚠ Returns the RESULTING set so the client seeds its store from this response rather than issuing a
// second read — and `added` so the surface can DISCLOSE the join by count instead of silently
// absorbing someone else's saves on a shared device.
func (h *Handler) merge(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}

	var req mergeRequestDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}

	items := make([]MergeItem, 0, len(req.Items))
	for _, it := range req.Items {
		// ⚠ An unparseable timestamp takes now() rather than rejecting the whole merge. One bad row
		// from a device must not cost the shopper their entire guest list.
		at, err := time.Parse(time.RFC3339, it.SavedAt)
		if err != nil {
			at = time.Now().UTC()
		}
		// ⚠ An empty string is treated as ABSENT, not as zero. "0" would report the item as having
		// dropped from nothing, which is a fabricated fact and worse than no baseline at all.
		price, currency := it.SavedPriceAmount, it.SavedCurrency
		if price != nil && *price == "" {
			price = nil
		}
		if currency != nil && *currency == "" {
			currency = nil
		}
		items = append(items, MergeItem{
			ProductID: it.ProductID, SavedPriceAmount: price, SavedCurrency: currency, SavedAt: at,
		})
	}

	res, err := h.svc.Merge(c.Request.Context(), cust.ID, items)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("saveditems: merge failed", zap.Error(err))
		httpx.Internal(c)
		return
	}

	skipped := make([]skipDTO, 0, len(res.Skipped))
	for _, s := range res.Skipped {
		skipped = append(skipped, skipDTO{ProductID: s.ProductID, Reason: s.Reason})
	}
	c.JSON(http.StatusOK, mergeResultDTO{
		Added: res.Added, Skipped: skipped, ProductIDs: res.ProductIDs,
	})
}

// ── Adding to the cart (FR-051/FR-052) ──────────────────────────────────────────────────────────

type addToCartRequestDTO struct {
	ChangeID string `json:"changeId"`
}

type addToCartResultDTO struct {
	Added   []string  `json:"added"`
	Skipped []skipDTO `json:"skipped"`
}

// addToCart puts every purchasable saved item in the cart.
//
// ⚠ 200 EVEN WHEN NOTHING COULD BE ADDED. Nothing was wrong with the request — the shopper's list
// simply contains nothing they can buy where they are. The client renders the refusal from `skipped`;
// a 4xx would make a correct request look like a client bug.
func (h *Handler) addToCart(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}
	h.writeAddToCart(c, cust.ID, DefaultListRef)
}

// writeAddToCart adds ONE list's purchasable products to the cart. Shared by /v1/saved/add-to-cart
// (the default list) and /v1/lists/:listId/add-to-cart.
func (h *Handler) writeAddToCart(c *gin.Context, customerID, listRef string) {
	var req addToCartRequestDTO
	_ = c.ShouldBindJSON(&req)

	res, err := h.svc.AddAllToCart(c.Request.Context(), customerID, listRef, req.ChangeID)
	if err != nil {
		if errors.Is(err, ErrListNotFound) {
			h.respond(c, err)
			return
		}
		logger.FromContext(c.Request.Context()).Error("saveditems: add to cart failed", zap.Error(err))
		httpx.Internal(c)
		return
	}

	skipped := make([]skipDTO, 0, len(res.Skipped))
	for _, s := range res.Skipped {
		skipped = append(skipped, skipDTO{ProductID: s.ProductID, Reason: s.Reason})
	}
	c.JSON(http.StatusOK, addToCartResultDTO{Added: res.Added, Skipped: skipped})
}
