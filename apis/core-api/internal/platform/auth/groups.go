package auth

import (
	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
)

// RequireGroups gates a route on group membership from the VERIFIED token.
// Rules (research D4): unauthenticated → 401; authenticated with no intersection —
// including the absent-claim case, since a group-less user has no cognito:groups
// claim at all — → 403. Comparison is exact-case (Cognito group names are
// case-sensitive identifiers). Any group hierarchy (admin ⊃ manager ⊃ csa) is encoded
// here once, never per handler.
func RequireGroups(groups ...string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(groups))
	for _, g := range groups {
		allowed[g] = struct{}{}
	}

	return func(c *gin.Context) {
		id, ok := IdentityFromContext(c.Request.Context())
		if !ok {
			httpx.Unauthenticated(c)
			return
		}
		for _, g := range id.Groups {
			if _, hit := allowed[g]; hit {
				c.Next()
				return
			}
		}
		httpx.Forbidden(c)
	}
}
