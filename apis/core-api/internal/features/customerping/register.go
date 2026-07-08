package customerping

import (
	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
)

// Register mounts the customer-scoped ping under the v1 group, gated by the customer
// pool's verifier. The route group carries the auth boundary (per-pool scoping by
// path class — ARCHITECTURE.md request pipeline).
func Register(v1 *gin.RouterGroup, customer *auth.PoolVerifier) {
	g := v1.Group("/customer", auth.Middleware(customer))
	g.GET("/ping", ping)
}
