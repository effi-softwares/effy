package orders

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

type summaryDTO struct {
	ID               string  `json:"id"`
	OrderNumber      string  `json:"orderNumber"`
	Status           string  `json:"status"`
	PlacedAt         *string `json:"placedAt"`
	ItemCount        int     `json:"itemCount"`
	GrandTotalAmount string  `json:"grandTotalAmount"`
	Currency         string  `json:"currency"`
}

type itemDTO struct {
	ProductID          string `json:"productId"`
	ProductName        string `json:"productName"`
	UnitPriceAmount    string `json:"unitPriceAmount"`
	Quantity           int    `json:"quantity"`
	LineSubtotalAmount string `json:"lineSubtotalAmount"`
}

// A shortfall the customer is being told about — product name and quantity only, NO shop (FR-018c).
type shortfallDTO struct {
	ProductName string `json:"productName"`
	Quantity    int    `json:"quantity"`
}

type fulfillmentDTO struct {
	Status         string `json:"status"`
	ItemCount      int    `json:"itemCount"`
	SubtotalAmount string `json:"subtotalAmount"`
	// Omitted entirely while the portion is still being picked (FR-018b, SC-017), so a flag that is
	// later undone never reaches the customer. `omitempty` is load-bearing, not cosmetic.
	Unavailable []shortfallDTO `json:"unavailableItems,omitempty"`
}

type orderDTO struct {
	ID                 string           `json:"id"`
	OrderNumber        string           `json:"orderNumber"`
	Status             string           `json:"status"`
	PlacedAt           *string          `json:"placedAt"`
	Items              []itemDTO        `json:"items"`
	DeliveryAddress    json.RawMessage  `json:"deliveryAddress"`
	ItemSubtotalAmount string           `json:"itemSubtotalAmount"`
	DeliveryFeeAmount  string           `json:"deliveryFeeAmount"`
	GrandTotalAmount   string           `json:"grandTotalAmount"`
	Currency           string           `json:"currency"`
	PaymentStatus      string           `json:"paymentStatus"`
	Fulfillments       []fulfillmentDTO `json:"fulfillments"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) list(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	list, err := h.svc.List(c.Request.Context(), cust.ID)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("orders: list failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	out := make([]summaryDTO, 0, len(list))
	for _, o := range list {
		out = append(out, summaryDTO{
			ID: o.ID, OrderNumber: o.OrderNumber, Status: o.Status, PlacedAt: o.PlacedAt,
			ItemCount: o.ItemCount, GrandTotalAmount: o.GrandTotalAmount, Currency: o.Currency,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) get(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	order, err := h.svc.Get(c.Request.Context(), cust.ID, c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.NotFound(c)
			return
		}
		logger.FromContext(c.Request.Context()).Error("orders: get failed", zap.Error(err))
		httpx.Internal(c)
		return
	}

	items := make([]itemDTO, 0, len(order.Items))
	for _, it := range order.Items {
		items = append(items, itemDTO{
			ProductID: it.ProductID, ProductName: it.ProductName, UnitPriceAmount: it.UnitPriceAmount,
			Quantity: it.Quantity, LineSubtotalAmount: it.LineSubtotalAmount,
		})
	}
	ful := make([]fulfillmentDTO, 0, len(order.Fulfillments))
	for _, f := range order.Fulfillments {
		var short []shortfallDTO
		for _, sh := range f.Unavailable {
			short = append(short, shortfallDTO{ProductName: sh.ProductName, Quantity: sh.Quantity})
		}
		ful = append(ful, fulfillmentDTO{
			Status: f.Status, ItemCount: f.ItemCount, SubtotalAmount: f.SubtotalAmount,
			Unavailable: short,
		})
	}
	address := order.DeliveryAddress
	if len(address) == 0 {
		address = json.RawMessage("{}")
	}

	c.JSON(http.StatusOK, orderDTO{
		ID: order.ID, OrderNumber: order.OrderNumber, Status: order.Status, PlacedAt: order.PlacedAt,
		Items: items, DeliveryAddress: address,
		ItemSubtotalAmount: order.ItemSubtotalAmount, DeliveryFeeAmount: order.DeliveryFeeAmount,
		GrandTotalAmount: order.GrandTotalAmount, Currency: order.Currency,
		PaymentStatus: order.PaymentStatus, Fulfillments: ful,
	})
}

// Register mounts the order history + receipt reads on a customer-scoped group.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/orders", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.list)
	g.GET("/:id", h.get)
}
