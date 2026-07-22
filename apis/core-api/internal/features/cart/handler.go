// Handler layer: HTTP only. Every route is customer-scoped — the customer id comes from the resolved
// identity in context (never the client), and the cart is always that customer's.
package cart

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// Wire DTOs (cart.ts).
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
	ProductID string `json:"productId"`
	Kind      string `json:"kind"`
}

type cartDTO struct {
	Lines              []cartLineDTO   `json:"lines"`
	ItemSubtotalAmount string          `json:"itemSubtotalAmount"`
	DeliveryFeeAmount  string          `json:"deliveryFeeAmount"`
	GrandTotalAmount   string          `json:"grandTotalAmount"`
	Currency           string          `json:"currency"`
	Notices            []cartNoticeDTO `json:"notices"`
}

type addToCartRequest struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}

type updateCartLineRequest struct {
	Quantity int `json:"quantity"`
}

type mergeCartRequest struct {
	Lines []struct {
		ProductID string `json:"productId"`
		Quantity  int    `json:"quantity"`
	} `json:"lines"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) get(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Get(c.Request.Context(), cust.ID)
	h.respond(c, cart, err)
}

func (h *Handler) addItem(c *gin.Context) {
	var req addToCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "productId and quantity are required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Add(c.Request.Context(), cust.ID, req.ProductID, req.Quantity)
	h.respond(c, cart, err)
}

func (h *Handler) setItem(c *gin.Context) {
	var req updateCartLineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "quantity is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.SetQty(c.Request.Context(), cust.ID, c.Param("productId"), req.Quantity)
	h.respond(c, cart, err)
}

func (h *Handler) removeItem(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Remove(c.Request.Context(), cust.ID, c.Param("productId"))
	h.respond(c, cart, err)
}

func (h *Handler) merge(c *gin.Context) {
	var req mergeCartRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "lines are required")
		return
	}
	lines := make([]MergeLine, 0, len(req.Lines))
	for _, l := range req.Lines {
		lines = append(lines, MergeLine{ProductID: l.ProductID, Quantity: l.Quantity})
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cart, err := h.svc.Merge(c.Request.Context(), cust.ID, lines)
	h.respond(c, cart, err)
}

// respond maps a cart/error to the wire, translating the sentinel errors to problems.
func (h *Handler) respond(c *gin.Context, cart Cart, err error) {
	if err != nil {
		switch {
		case errors.Is(err, ErrProductNotFound):
			httpx.NotFound(c)
		case errors.Is(err, ErrProductUnavailable):
			httpx.ValidationFailed(c, "that product is currently unavailable")
		case errors.Is(err, ErrInvalidQuantity):
			httpx.ValidationFailed(c, "quantity must be between 1 and 99")
		default:
			logger.FromContext(c.Request.Context()).Error("cart: operation failed", zap.Error(err))
			httpx.Internal(c)
		}
		return
	}
	c.JSON(http.StatusOK, toCartDTO(cart))
}

func toCartDTO(cart Cart) cartDTO {
	lines := make([]cartLineDTO, 0, len(cart.Lines))
	for _, l := range cart.Lines {
		var img *string
		if l.ImageURL != "" {
			img = &l.ImageURL
		}
		lines = append(lines, cartLineDTO{
			ID:                 l.ID,
			ProductID:          l.ProductID,
			Name:               l.Name,
			ImageURL:           img,
			UnitPriceAmount:    l.UnitPriceAmount,
			Quantity:           l.Quantity,
			LineSubtotalAmount: l.LineSubtotalAmount,
			Available:          l.Available,
			PackageKey:         l.PackageKey,
		})
	}
	notices := make([]cartNoticeDTO, 0, len(cart.Notices))
	for _, n := range cart.Notices {
		notices = append(notices, cartNoticeDTO{ProductID: n.ProductID, Kind: n.Kind})
	}
	return cartDTO{
		Lines:              lines,
		ItemSubtotalAmount: cart.ItemSubtotalAmount,
		DeliveryFeeAmount:  cart.DeliveryFeeAmount,
		GrandTotalAmount:   cart.GrandTotalAmount,
		Currency:           cart.Currency,
		Notices:            notices,
	}
}
