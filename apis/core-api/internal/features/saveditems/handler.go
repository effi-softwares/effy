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
	c.JSON(http.StatusOK, membershipDTO{ProductIDs: m.ProductIDs, Count: m.Count})
}

// list answers the saved list with a verdict per item, against the shopper's current location.
func (h *Handler) list(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}

	postcode := c.Query("postcode")
	// ⚠ An ABSENT postcode is a first-class case, not an error — it means the shopper has not said
	// where they live, and every item reports "not yet determined" (FR-038). Only a MALFORMED one is
	// refused. The bare {"error": ...} shape matches /v1/storefront/serviceability, the sibling this
	// convention comes from.
	if postcode != "" && !validPostcode(postcode) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_postcode"})
		return
	}

	items, err := h.svc.List(c.Request.Context(), cust.ID, postcode)
	if err != nil {
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
	default:
		logger.FromContext(c.Request.Context()).Error("saveditems: write failed", zap.Error(err))
		httpx.Internal(c)
	}
}

// validPostcode accepts the four-digit Australian form. Normalisation happens in the service, via the
// shared delivery package — this only rejects shapes that could never resolve.
func validPostcode(s string) bool {
	if len(s) != 4 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
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
	Postcode string `json:"postcode"`
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

	var req addToCartRequestDTO
	_ = c.ShouldBindJSON(&req)

	if req.Postcode != "" && !validPostcode(req.Postcode) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_postcode"})
		return
	}

	res, err := h.svc.AddAllToCart(c.Request.Context(), cust.ID, req.Postcode, req.ChangeID)
	if err != nil {
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
