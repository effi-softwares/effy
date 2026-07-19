package addresses

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

type addressDTO struct {
	ID            string  `json:"id"`
	Label         *string `json:"label"`
	RecipientName string  `json:"recipientName"`
	Phone         *string `json:"phone"`
	Line1         string  `json:"line1"`
	Line2         *string `json:"line2"`
	City          string  `json:"city"`
	Region        *string `json:"region"`
	PostalCode    string  `json:"postalCode"`
	Country       string  `json:"country"`
	IsDefault     bool    `json:"isDefault"`
}

type createAddressRequest struct {
	Label         *string `json:"label"`
	RecipientName *string `json:"recipientName"`
	Phone         *string `json:"phone"`
	Line1         *string `json:"line1"`
	Line2         *string `json:"line2"`
	City          *string `json:"city"`
	Region        *string `json:"region"`
	PostalCode    *string `json:"postalCode"`
	Country       *string `json:"country"`
	MakeDefault   bool    `json:"makeDefault"`
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
		h.fail(c, err)
		return
	}
	out := make([]addressDTO, 0, len(list))
	for _, a := range list {
		out = append(out, toDTO(a))
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) create(c *gin.Context) {
	var req createAddressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "a valid address is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	addr, err := h.svc.Create(c.Request.Context(), cust.ID, req.toInput())
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, toDTO(addr))
}

func (h *Handler) update(c *gin.Context) {
	var req createAddressRequest // same optional shape (all fields nullable + makeDefault)
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "a valid address update is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	addr, err := h.svc.Update(c.Request.Context(), cust.ID, c.Param("id"), req.toInput())
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, toDTO(addr))
}

func (h *Handler) remove(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	if err := h.svc.Delete(c.Request.Context(), cust.ID, c.Param("id")); err != nil {
		h.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.NotFound(c)
	case errors.Is(err, ErrValidation):
		httpx.ValidationFailed(c, "recipient name, line 1, city and postal code are required")
	default:
		logger.FromContext(c.Request.Context()).Error("addresses: operation failed", zap.Error(err))
		httpx.Internal(c)
	}
}

func (r createAddressRequest) toInput() Input {
	return Input{
		Label: r.Label, RecipientName: r.RecipientName, Phone: r.Phone, Line1: r.Line1, Line2: r.Line2,
		City: r.City, Region: r.Region, PostalCode: r.PostalCode, Country: r.Country, MakeDefault: r.MakeDefault,
	}
}

func toDTO(a Address) addressDTO {
	return addressDTO{
		ID: a.ID, Label: a.Label, RecipientName: a.RecipientName, Phone: a.Phone,
		Line1: a.Line1, Line2: a.Line2, City: a.City, Region: a.Region,
		PostalCode: a.PostalCode, Country: a.Country, IsDefault: a.IsDefault,
	}
}

// Register mounts the address CRUD on a customer-scoped group.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/addresses", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.list)
	g.POST("", h.create)
	g.PATCH("/:id", h.update)
	g.DELETE("/:id", h.remove)
}
