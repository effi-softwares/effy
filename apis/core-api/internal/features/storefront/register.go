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
	// The detail behind a promotional banner tap. Public like the rest — an advertised promotion is by
	// definition public, and requiring a session to read one would hide it from exactly the guests the
	// storefront exists to convert.
	g.GET("/promotions/:id", h.getPromotion)
	// 025 US1: "do we deliver to you?" answered BEFORE a cart exists. Public and cacheable like the
	// rest — it discloses nothing about the caller and nothing about where Effy fulfils from.
	g.GET("/serviceability", h.getServiceability)
	// 030 US1: "which places could you mean?" — the other half of the same interaction, which is why
	// it is mounted here rather than anywhere else. It fires while the shopper is typing, so it is
	// hot-path work by definition. ⚠ Its results never reflect delivery coverage (FR-011).
	g.GET("/localities", h.getLocalities)
}
