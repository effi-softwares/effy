package favorites

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

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

type favoriteDTO struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Brand           *string  `json:"brand"`
	ImageURL        *string  `json:"imageUrl"`
	PriceAmount     string   `json:"priceAmount"`
	Currency        string   `json:"currency"`
	CompareAtAmount *string  `json:"compareAtAmount"`
	Badges          []string `json:"badges"`
	Available       bool     `json:"available"`
	SavedAt         string   `json:"savedAt"`
}

func (h *Handler) list(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	favs, err := h.svc.List(c.Request.Context(), cust.ID)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("favorites: list failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	out := make([]favoriteDTO, 0, len(favs))
	for _, f := range favs {
		var img *string
		if f.ImageURL != "" {
			img = &f.ImageURL
		}
		out = append(out, favoriteDTO{
			ID: f.ID, Name: f.Name, Brand: f.Brand, ImageURL: img, PriceAmount: f.PriceAmount,
			Currency: f.Currency, CompareAtAmount: f.CompareAtAmount, Badges: f.Badges,
			Available: f.Available, SavedAt: f.SavedAt,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) save(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	h.respond(c, h.svc.Save(c.Request.Context(), cust.ID, c.Param("productId")))
}

func (h *Handler) remove(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	h.respond(c, h.svc.Remove(c.Request.Context(), cust.ID, c.Param("productId")))
}

func (h *Handler) respond(c *gin.Context, err error) {
	if err != nil {
		if errors.Is(err, ErrProductNotFound) {
			httpx.NotFound(c)
			return
		}
		logger.FromContext(c.Request.Context()).Error("favorites: operation failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	c.Status(http.StatusNoContent)
}

// Register mounts the save/un-save routes on a customer-scoped group.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/favorites", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.list) // US6
	g.PUT("/:productId", h.save)
	g.DELETE("/:productId", h.remove)
}
