package storefront

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// ServiceabilityMetric records a serviceability check by outcome. ⚠ Implementations MUST NOT accept a
// postcode — the label is a boolean only (Principle VII; no PII, low cardinality).
type ServiceabilityMetric interface {
	ServiceabilityChecked(serviced bool)
}

// DeliveryReads serves the PUBLIC, cacheable delivery reads that live beside the storefront (047):
// "do we deliver to you?" and the locality typeahead. They read directly (no service layer) — each is a
// single indexed query with no business shaping, and neither discloses anything about the caller or
// where Effy fulfils.
type DeliveryReads struct {
	q      db.DBTX
	metric ServiceabilityMetric // nil-able: no metric wired → no-op (unit tests)
}

// NewDeliveryReads wires the delivery reads to the connection pool and (optionally) the metric sink.
func NewDeliveryReads(q db.DBTX, metric ServiceabilityMetric) *DeliveryReads {
	return &DeliveryReads{q: q, metric: metric}
}

// serviceabilityDTO is the FROZEN two-field shape (@effy/shared-types ServiceabilityDTO). ⚠ Nothing may
// be added here — no zone id, name, fee, or window (the up-front answer must not grow a fulfilment fact).
type serviceabilityDTO struct {
	Postcode string `json:"postcode"`
	Serviced bool   `json:"serviced"`
}

// getServiceability answers the single serviceability decision (FR-001) BEFORE a cart exists.
// ⚠ Malformed input is 400 (bare `{"error":"invalid_postcode"}`), NEVER serviced:false — a bad postcode
// is not "we don't deliver there". Cacheable for a day; the answer changes at the pace of zone editing.
func (h *DeliveryReads) getServiceability(c *gin.Context) {
	postcode, ok := delivery.NormalizePostcode(c.Query("postcode"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_postcode"})
		return
	}
	serviced, err := delivery.ServiceableForPostcode(c.Request.Context(), h.q, postcode)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: serviceability failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	if h.metric != nil {
		h.metric.ServiceabilityChecked(serviced)
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.JSON(http.StatusOK, serviceabilityDTO{Postcode: postcode, Serviced: serviced})
}
