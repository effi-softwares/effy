package cart

import (
	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
)

// Register mounts the cart routes on a CUSTOMER-scoped group: the customer pool verifier gates the
// token, then the identity middleware resolves the record (refusing a barred/missing customer) and
// stores it in context. Every handler reads the customer id from there — never from the client.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/cart", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.get)
	g.POST("/items", h.addItem)
	g.PATCH("/items/:productId", h.setItem)
	g.DELETE("/items/:productId", h.removeItem)
	g.POST("/merge", h.merge)
}
