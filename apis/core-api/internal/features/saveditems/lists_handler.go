package saveditems

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// Lists (068): the edge. Bind, call the service, map the result.
//
// ⚠ A LIST'S NAME NEVER APPEARS IN A PATH, A QUERY STRING OR A LOG LINE (FR-040). Lists are addressed
// by id; names travel only in request and response bodies, which the request log does not record.
// Every error logged below carries the error and nothing from the body.

// listDTO is one list on the wire. `id` is "default" for the default list and `name` is null for
// it: "Saved" is each client's string.
type listDTO struct {
	ID            string  `json:"id"`
	IsDefault     bool    `json:"isDefault"`
	Name          *string `json:"name"`
	Count         int     `json:"count"`
	OnlyHereCount int     `json:"onlyHereCount"`
	// Present only when the read named a product.
	ContainsProduct *bool `json:"containsProduct,omitempty"`
}

func toListDTO(l List) listDTO {
	return listDTO{
		ID: l.ID, IsDefault: l.IsDefault, Name: l.Name, Count: l.Count,
		OnlyHereCount: l.OnlyHereCount, ContainsProduct: l.ContainsProduct,
	}
}

type createListRequest struct {
	Name      string  `json:"name"`
	ProductID *string `json:"productId"`
}

type renameListRequest struct {
	Name string `json:"name"`
}

type entryRequest struct {
	RestoreAddedAt *string `json:"restoreAddedAt"`
}

// refuse writes a refusal the client can tell apart by reason. The reason is the last segment of
// the problem's `type`, with `_` written as `-`, exactly as httpx.ValidationFailedAs does for 400s.
func refuse(c *gin.Context, status int, reason, detail string) {
	httpx.WriteProblem(c, status,
		"https://effyshopping.com/problems/"+strings.ReplaceAll(reason, "_", "-"),
		http.StatusText(status), detail)
}

func registerLists(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/lists", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.lists)
	g.POST("", h.createList)
	g.PATCH("/:listId", h.renameList)
	g.DELETE("/:listId", h.deleteList)
	g.GET("/:listId/items", h.listItems)
	g.PUT("/:listId/entries/:productId", h.addEntry)
	g.DELETE("/:listId/entries/:productId", h.removeEntry)
	g.POST("/:listId/add-to-cart", h.listAddToCart)
}

// customer resolves the caller, answering 401 itself when there is none.
func customerID(c *gin.Context) (string, bool) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return "", false
	}
	return cust.ID, true
}

func (h *Handler) lists(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}

	var productID *string
	if p := c.Query("productId"); p != "" {
		if !validUUID(p) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_product_id"})
			return
		}
		productID = &p
	}

	lists, err := h.svc.Lists(c.Request.Context(), id, productID)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("saveditems: lists failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	out := make([]listDTO, 0, len(lists))
	for _, l := range lists {
		out = append(out, toListDTO(l))
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) createList(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}
	var req createListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	if req.ProductID != nil && !validUUID(*req.ProductID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_product_id"})
		return
	}

	l, err := h.svc.CreateList(c.Request.Context(), id, req.Name, req.ProductID)
	if err != nil {
		h.respond(c, err)
		return
	}
	c.JSON(http.StatusCreated, toListDTO(l))
}

func (h *Handler) renameList(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}
	var req renameListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}

	l, err := h.svc.RenameList(c.Request.Context(), id, c.Param("listId"), req.Name)
	if err != nil {
		h.respond(c, err)
		return
	}
	c.JSON(http.StatusOK, toListDTO(l))
}

func (h *Handler) deleteList(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}
	h.respond(c, h.svc.DeleteList(c.Request.Context(), id, c.Param("listId")))
}

func (h *Handler) listItems(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}
	h.writeItems(c, id, c.Param("listId"))
}

func (h *Handler) addEntry(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}

	var req entryRequest
	// The body is optional — an ordinary add sends none — so a bind failure is not an error.
	_ = c.ShouldBindJSON(&req)

	var restore *time.Time
	if req.RestoreAddedAt != nil {
		t, err := time.Parse(time.RFC3339, *req.RestoreAddedAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_restore_added_at"})
			return
		}
		restore = &t
	}

	h.respond(c, h.svc.AddEntry(c.Request.Context(), id, c.Param("listId"), c.Param("productId"), restore))
}

func (h *Handler) removeEntry(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}
	h.respond(c, h.svc.RemoveEntry(c.Request.Context(), id, c.Param("listId"), c.Param("productId")))
}

func (h *Handler) listAddToCart(c *gin.Context) {
	id, ok := customerID(c)
	if !ok {
		return
	}
	h.writeAddToCart(c, id, c.Param("listId"))
}
