package platformstatus

import "github.com/gin-gonic/gin"

// Register mounts the feature's routes on the version groups. The proving read is
// deliberately public (contracts/core-api.contract.md); unchanged endpoints would
// register the SAME handler in both groups — this feature's v1/v2 differ on purpose
// (the coexistence demo).
func Register(v1, v2 *gin.RouterGroup, h *Handler) {
	v1.GET("/platform/status", h.getV1)
	v2.GET("/platform/status", h.getV2)
}
