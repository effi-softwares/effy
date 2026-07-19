package customeridentity

import (
	"context"
	"errors"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

type customerCtxKey struct{}

// Middleware resolves the verified subject to a customer record and stores it in the request context.
// It MUST be mounted AFTER auth.Middleware (which puts the verified identity in context). A missing
// record fails as 401 (the customer must complete the cold-path bootstrap); a barred customer as 403.
func Middleware(r *Resolver) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := auth.IdentityFromContext(c.Request.Context())
		if !ok {
			httpx.Unauthenticated(c)
			return
		}
		cust, err := r.Resolve(c.Request.Context(), id.Subject)
		if err != nil {
			switch {
			case errors.Is(err, ErrBarred):
				httpx.Forbidden(c)
			case errors.Is(err, ErrNotFound):
				httpx.Unauthenticated(c)
			default:
				logger.FromContext(c.Request.Context()).Error("customeridentity: resolve failed", zap.Error(err))
				httpx.Internal(c)
			}
			return
		}
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), customerCtxKey{}, cust))
		c.Next()
	}
}

// FromContext returns the resolved customer for a request that passed Middleware.
func FromContext(ctx context.Context) (Customer, bool) {
	cust, ok := ctx.Value(customerCtxKey{}).(Customer)
	return cust, ok
}
