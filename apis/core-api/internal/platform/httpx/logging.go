package httpx

import (
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// quiet paths describe the process, not the product — logging them per-scrape/probe is
// pure noise (they stay observable through metrics and their own status codes).
var quietPaths = map[string]struct{}{
	"/healthz": {},
	"/readyz":  {},
	"/metrics": {},
}

// LoggingMiddleware derives the request-scoped logger (request_id enrichment) and
// emits exactly ONE structured record per handled request (spec FR-005). It never
// logs bodies, headers, tokens, or query values — only shape and outcome.
func LoggingMiddleware(base *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		reqLogger := base.With(zap.String("request_id", RequestID(c)))
		c.Request = c.Request.WithContext(logger.WithContext(c.Request.Context(), reqLogger))

		c.Next()

		if _, quiet := quietPaths[c.Request.URL.Path]; quiet {
			return
		}

		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		fields := []zap.Field{
			zap.String("method", c.Request.Method),
			zap.String("route", route),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("duration", time.Since(start)),
		}
		// gin collects handler-attached errors; surface the last one for correlation.
		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("error", c.Errors.Last().Error()))
		}

		switch {
		case c.Writer.Status() >= 500:
			reqLogger.Error("request", fields...)
		case c.Writer.Status() >= 400:
			reqLogger.Warn("request", fields...)
		default:
			reqLogger.Info("request", fields...)
		}
	}
}
