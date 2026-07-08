// Package customerping is the identity-enforcement proving slice: a protected route
// on the customer pool that echoes the VERIFIED identity (spec US3). It exists to
// make Principle IV demonstrable — cross-pool tokens die in the auth middleware
// before this handler ever runs.
package customerping

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/services/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/services/core-api/internal/platform/httpx"
)

type pingDTO struct {
	Audience string `json:"audience"`
	Subject  string `json:"subject"`
	Message  string `json:"message"`
}

func ping(c *gin.Context) {
	id, ok := auth.IdentityFromContext(c.Request.Context())
	if !ok {
		// Unreachable behind the middleware; fail closed anyway.
		httpx.Unauthenticated(c)
		return
	}
	c.JSON(http.StatusOK, pingDTO{
		Audience: id.Audience,
		Subject:  id.Subject,
		Message:  "pong",
	})
}
