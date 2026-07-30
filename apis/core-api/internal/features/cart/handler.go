// Handler layer: HTTP only. Every authenticated route is customer-scoped — the customer id comes from
// the resolved identity in context, never from the client, so the cart is always that customer's.
//
// Two routes here are PUBLIC (`preview`, `policy`). They exist because a guest has no server cart, yet
// still deserves current prices, honest availability, and to be told the minimum spend before they build a
// basket they cannot check out (research R10). Neither writes anything.
package cart

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// ── Wire DTOs (packages/shared-types/src/cart.ts is the SSOT) ───────────────────────────────────

type cartLineDTO struct {
	ID                 string  `json:"id"`
	ProductID          string  `json:"productId"`
	Name               string  `json:"name"`
	ImageURL           *string `json:"imageUrl"`
	UnitPriceAmount    string  `json:"unitPriceAmount"`
	Quantity           int     `json:"quantity"`
	LineSubtotalAmount string  `json:"lineSubtotalAmount"`
	Available          bool    `json:"available"`
	PriceChangedFrom   *string `json:"priceChangedFrom"`
	PackageKey         string  `json:"packageKey"`
}

type cartNoticeDTO struct {
	ProductID *string `json:"productId"`
	Kind      string  `json:"kind"`
	Detail    *string `json:"detail"`
}

type cartDiscountDTO struct {
	Code   string `json:"code"`
	Kind   string `json:"kind"`
	Amount string `json:"amount"`
	Label  string `json:"label"`
}

type cartCheckoutStateDTO struct {
	Allowed               bool    `json:"allowed"`
	BlockedReason         *string `json:"blockedReason"`
	MinimumSubtotalAmount *string `json:"minimumSubtotalAmount"`
	RemainingAmount       *string `json:"remainingAmount"`
}

type cartLimitsDTO struct {
	MaxLineQuantity  int `json:"maxLineQuantity"`
	MaxDistinctItems int `json:"maxDistinctItems"`
}

type cartDTO struct {
	Revision           int64                `json:"revision"`
	Lines              []cartLineDTO        `json:"lines"`
	SavedLines         []cartLineDTO        `json:"savedLines"`
	ItemSubtotalAmount string               `json:"itemSubtotalAmount"`
	DiscountAmount     string               `json:"discountAmount"`
	DeliveryFeeAmount  string               `json:"deliveryFeeAmount"`
	GrandTotalAmount   string               `json:"grandTotalAmount"`
	Currency           string               `json:"currency"`
	Notices            []cartNoticeDTO      `json:"notices"`
	Discount           *cartDiscountDTO     `json:"discount"`
	Checkout           cartCheckoutStateDTO `json:"checkout"`
	Limits             cartLimitsDTO        `json:"limits"`
}

type cartPolicyDTO struct {
	MinimumSubtotalAmount string `json:"minimumSubtotalAmount"`
	Currency              string `json:"currency"`
	MaxLineQuantity       int    `json:"maxLineQuantity"`
	MaxDistinctItems      int    `json:"maxDistinctItems"`
}

type cartLineInput struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}

type addToCartRequest struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
	ChangeID  string `json:"changeId"`
}

type updateCartLineRequest struct {
	Quantity int    `json:"quantity"`
	ChangeID string `json:"changeId"`
}

type mergeCartRequest struct {
	Lines    []cartLineInput `json:"lines"`
	ChangeID string          `json:"changeId"`
}

type cartPreviewRequest struct {
	Lines []cartLineInput `json:"lines"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ── Authenticated routes ────────────────────────────────────────────────────────────────────────

func (h *Handler) get(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Get(c.Request.Context(), cust.ID)
	h.respond(c, cart, err)
}

func (h *Handler) addItem(c *gin.Context) {
	var req addToCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "productId, quantity and changeId are required")
		return
	}
	// changeId is REQUIRED on add and only on add: it is the one cart operation that is not idempotent,
	// so without it a retry after an ambiguous failure would add the item twice (FR-018).
	if req.ChangeID == "" {
		httpx.ValidationFailed(c, "changeId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Add(c.Request.Context(), cust.ID, req.ProductID, req.ChangeID, req.Quantity)
	h.respond(c, cart, err)
}

func (h *Handler) setItem(c *gin.Context) {
	var req updateCartLineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "quantity is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.SetQty(c.Request.Context(), cust.ID, c.Param("productId"), req.ChangeID, req.Quantity)
	h.respond(c, cart, err)
}

func (h *Handler) removeItem(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Remove(c.Request.Context(), cust.ID, c.Param("productId"), c.Query("changeId"))
	h.respond(c, cart, err)
}

// clear empties the payable cart. Set-aside items survive it (FR-030/FR-032).
func (h *Handler) clear(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Clear(c.Request.Context(), cust.ID, c.Query("changeId"))
	h.respond(c, cart, err)
}

// merge folds the client's device cart into the account cart at sign-in — union with MAXIMUM quantity, so
// running it twice changes nothing (FR-011/FR-012). An absent/empty `lines` is valid and is a no-op: an
// empty guest cart must never empty the account cart.
func (h *Handler) merge(c *gin.Context) {
	var req mergeCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "lines are required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Merge(c.Request.Context(), cust.ID, req.ChangeID, toLineInputs(req.Lines))
	h.respond(c, cart, err)
}

func (h *Handler) setAside(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.SetAside(c.Request.Context(), cust.ID, c.Param("productId"), c.Query("changeId"))
	h.respond(c, cart, err)
}

func (h *Handler) restoreSaved(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.RestoreSaved(c.Request.Context(), cust.ID, c.Param("productId"), c.Query("changeId"))
	h.respond(c, cart, err)
}

func (h *Handler) deleteSaved(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.DeleteSaved(c.Request.Context(), cust.ID, c.Param("productId"), c.Query("changeId"))
	h.respond(c, cart, err)
}

// ── Public routes ───────────────────────────────────────────────────────────────────────────────

// preview re-prices a guest's device cart. No auth, no writes.
func (h *Handler) preview(c *gin.Context) {
	var req cartPreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "lines are required")
		return
	}
	cart, err := h.svc.Preview(c.Request.Context(), toLineInputs(req.Lines))
	h.respond(c, cart, err)
}

// policy publishes the minimum spend and the two ceilings, so a guest cart gates and explains from the
// same numbers the platform enforces.
func (h *Handler) policy(c *gin.Context) {
	p, err := h.svc.Policy(c.Request.Context())
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("cart: policy read failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	c.JSON(http.StatusOK, cartPolicyDTO{
		MinimumSubtotalAmount: money.FormatCents(p.MinimumSubtotalCents),
		Currency:              p.Currency,
		MaxLineQuantity:       p.MaxLineQuantity,
		MaxDistinctItems:      p.MaxDistinctItems,
	})
}

// ── Mapping ─────────────────────────────────────────────────────────────────────────────────────

// respond maps a cart/error to the wire, translating the sentinel errors to problems.
func (h *Handler) respond(c *gin.Context, cart Cart, err error) {
	if err != nil {
		switch {
		case errors.Is(err, ErrProductNotFound):
			httpx.NotFound(c)
		case errors.Is(err, ErrOrderNotFound):
			// Never 403: whether an order exists is not disclosed to someone who does not own it.
			httpx.NotFound(c)
		case errors.Is(err, ErrProductUnavailable):
			httpx.ValidationFailed(c, "that product is currently unavailable")
		case errors.Is(err, ErrInvalidQuantity):
			httpx.ValidationFailed(c, "that quantity is not valid")
		case errors.Is(err, ErrCartFull):
			httpx.ValidationFailed(c, "your cart is full — remove an item to add another")
		default:
			logger.FromContext(c.Request.Context()).Error("cart: operation failed", zap.Error(err))
			httpx.Internal(c)
		}
		return
	}
	c.JSON(http.StatusOK, toCartDTO(cart))
}

func toLineInputs(in []cartLineInput) []LineInput {
	out := make([]LineInput, 0, len(in))
	for _, l := range in {
		out = append(out, LineInput{ProductID: l.ProductID, Quantity: l.Quantity})
	}
	return out
}

func toCartDTO(cart Cart) cartDTO {
	return cartDTO{
		Revision:           cart.Revision,
		Lines:              toLineDTOs(cart.Lines),
		SavedLines:         toLineDTOs(cart.SavedLines),
		ItemSubtotalAmount: cart.ItemSubtotalAmount,
		DiscountAmount:     cart.DiscountAmount,
		DeliveryFeeAmount:  cart.DeliveryFeeAmount,
		GrandTotalAmount:   cart.GrandTotalAmount,
		Currency:           cart.Currency,
		Notices:            toNoticeDTOs(cart.Notices),
		Discount:           toDiscountDTO(cart.Discount),
		Checkout:           toCheckoutDTO(cart.Checkout),
		Limits:             cartLimitsDTO{MaxLineQuantity: cart.Limits.MaxLineQuantity, MaxDistinctItems: cart.Limits.MaxDistinctItems},
	}
}

func toLineDTOs(lines []Line) []cartLineDTO {
	out := make([]cartLineDTO, 0, len(lines))
	for _, l := range lines {
		out = append(out, cartLineDTO{
			ID:                 l.ID,
			ProductID:          l.ProductID,
			Name:               l.Name,
			ImageURL:           optional(l.ImageURL),
			UnitPriceAmount:    l.UnitPriceAmount,
			Quantity:           l.Quantity,
			LineSubtotalAmount: l.LineSubtotalAmount,
			Available:          l.Available,
			PriceChangedFrom:   optional(l.PriceChangedFrom),
			PackageKey:         l.PackageKey,
		})
	}
	return out
}

func toNoticeDTOs(notices []Notice) []cartNoticeDTO {
	out := make([]cartNoticeDTO, 0, len(notices))
	for _, n := range notices {
		out = append(out, cartNoticeDTO{
			ProductID: optional(n.ProductID),
			Kind:      string(n.Kind),
			Detail:    optional(n.Detail),
		})
	}
	return out
}

func toDiscountDTO(d *Discount) *cartDiscountDTO {
	if d == nil {
		return nil
	}
	return &cartDiscountDTO{Code: d.Code, Kind: d.Kind, Amount: d.Amount, Label: d.Label}
}

func toCheckoutDTO(s CheckoutState) cartCheckoutStateDTO {
	return cartCheckoutStateDTO{
		Allowed:               s.Allowed,
		BlockedReason:         optional(string(s.BlockedReason)),
		MinimumSubtotalAmount: optional(s.MinimumSubtotalAmount),
		RemainingAmount:       optional(s.RemainingAmount),
	}
}

// optional renders an empty string as JSON null — the wire contract distinguishes "absent" from "", and
// an empty amount or reason is absence, not a value.
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
