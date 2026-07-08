// Package health serves the unversioned process endpoints: /healthz (liveness) and
// /readyz (readiness = dependency reachability). Probes read status codes; bodies are
// informational and never name hosts or credentials (research B7, data-model §3).
package health

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

const readinessTimeout = 2 * time.Second

// Pinger is the slice of the pgx pool readiness needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Register mounts the endpoints on the root router — outside /v1, outside auth,
// outside request-log noise (deliberately unversioned: they describe the process,
// not the API contract).
func Register(r gin.IRoutes, db Pinger) {
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/readyz", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), readinessTimeout)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			logger.FromContext(c.Request.Context()).Warn("readiness: database unreachable")
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "unavailable",
				"checks": gin.H{"database": "unreachable"},
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status": "ready",
			"checks": gin.H{"database": "ok"},
		})
	})
}
