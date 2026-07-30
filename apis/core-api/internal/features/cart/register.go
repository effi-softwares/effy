package cart

import (
	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
)

// Register mounts the cart routes.
//
// Two groups, deliberately:
//
//   - The CUSTOMER group: the customer pool verifier gates the token, then the identity middleware
//     resolves the record (refusing a barred or missing customer). Every handler reads the customer id
//     from context — never from the client.
//   - A PUBLIC group for `preview` and `policy`. A guest has no server cart, but FR-004/FR-021/FR-022
//     (current prices, honest availability) and FR-054 (state the minimum) apply to them too. Neither
//     route writes, and neither takes a customer id from anywhere — there is nothing to scope and
//     nothing to leak (research R10).
//
// ⚠ `PUT ""` (019's whole-cart replace) is GONE, not deprecated. Its absence is what makes FR-010
// structural: no client holds an operation capable of deleting a line it has never heard of, so a device
// that has been offline for a week cannot clobber a cart built elsewhere (research R0/R1).
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	// Public — no auth, no writes.
	pub := v1.Group("/cart")
	pub.POST("/preview", h.preview)
	pub.GET("/policy", h.policy)

	// Customer-scoped.
	g := v1.Group("/cart", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.get)
	g.DELETE("", h.clear)                       // empty the payable cart; saved items survive
	g.POST("/merge", h.merge)                   // sign-in adoption: union with MAXIMUM quantity
	g.POST("/items", h.addItem)                 // the only non-idempotent write — requires changeId
	g.PATCH("/items/:productId", h.setItem)     // ABSOLUTE quantity; 0 removes
	g.DELETE("/items/:productId", h.removeItem) //
	g.POST("/reorder", h.reorder)               // a past order, back in the cart (union-with-max, so a double tap is safe)
	g.POST("/items/:productId/set-aside", h.setAside)
	g.POST("/saved/:productId/restore", h.restoreSaved)
	g.DELETE("/saved/:productId", h.deleteSaved)
}
