package httpx

import (
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/services/core-api/internal/platform/logger"
)

// RecoveryMiddleware converts panics into the uniform internal problem. The panic
// value and stack reach ONLY the log (correlated by request_id) — never the caller
// (error-envelope conformance test 3).
func RecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				logger.FromContext(c.Request.Context()).Error("panic recovered",
					zap.Any("panic", r), zap.Stack("stack"))
				Internal(c)
			}
		}()
		c.Next()
	}
}
