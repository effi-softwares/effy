package storefront

import "github.com/gin-gonic/gin"

// Register mounts the storefront reads on the v1 group. These are deliberately PUBLIC (no auth) and
// cacheable — the guest-first storefront (011). Facets are query params, never path segments (FR-017).
func Register(v1 *gin.RouterGroup, h *Handler) {
	g := v1.Group("/storefront")
	g.GET("/home", h.getHome)
	g.GET("/categories", h.getCategories)
	g.GET("/products", h.getProducts)        // ?ids= now; full search/browse form in US4
	g.GET("/products/:id", h.getProductByID) // product detail (US2)
}
