// Handler layer: HTTP only — parse, call the service, map domain → wire DTO.
// Versioning lives HERE and only here: v1 and v2 are different wire shapes over the
// same service (research A3; versioning-policy rule 5). The v2 reshape is the
// platform's canonical breaking-shape example (spec US4/SC-010).
package platformstatus

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// v1 wire shape: flat (contracts/core-api.contract.md).
type statusV1DTO struct {
	Environment       string    `json:"environment"`
	DatabaseName      string    `json:"database_name"`
	DatabaseTime      time.Time `json:"database_time"`
	MigrationVersion  int64     `json:"migration_version"`
	MigrationsApplied int64     `json:"migrations_applied"`
}

// v2 wire shape: deliberately reshaped — migration fields nest under database, and
// the contract version is explicit.
type statusV2DTO struct {
	ContractVersion int              `json:"contract_version"`
	Environment     string           `json:"environment"`
	Database        statusV2Database `json:"database"`
}

type statusV2Database struct {
	Name      string            `json:"name"`
	Time      time.Time         `json:"time"`
	Migration statusV2Migration `json:"migration"`
}

type statusV2Migration struct {
	Version int64 `json:"version"`
	Applied int64 `json:"applied"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) getV1(c *gin.Context) {
	status, ok := h.load(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, statusV1DTO{
		Environment:       status.Environment,
		DatabaseName:      status.DatabaseName,
		DatabaseTime:      status.DatabaseTime,
		MigrationVersion:  status.MigrationVersion,
		MigrationsApplied: status.MigrationsApplied,
	})
}

func (h *Handler) getV2(c *gin.Context) {
	status, ok := h.load(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, statusV2DTO{
		ContractVersion: 2,
		Environment:     status.Environment,
		Database: statusV2Database{
			Name: status.DatabaseName,
			Time: status.DatabaseTime,
			Migration: statusV2Migration{
				Version: status.MigrationVersion,
				Applied: status.MigrationsApplied,
			},
		},
	})
}

// load runs the version-neutral read and writes the uniform problem on failure.
func (h *Handler) load(c *gin.Context) (PlatformStatus, bool) {
	status, err := h.svc.Get(c.Request.Context())
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("platformstatus: read failed", zap.Error(err))
		if errors.Is(err, context.DeadlineExceeded) {
			httpx.Unavailable(c)
		} else {
			httpx.Internal(c)
		}
		return PlatformStatus{}, false
	}
	return status, true
}
