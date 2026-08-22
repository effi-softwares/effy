package storefront

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

const localitiesLimit = 8 // one comfortable phone sheet-height (030 R5)

type localityDTO struct {
	Name     string `json:"name"`
	State    string `json:"state"`
	Postcode string `json:"postcode"`
}

type localitiesResultDTO struct {
	Items []localityDTO `json:"items"`
}

// getLocalities is the typeahead (030): `q` of ≥ 2 chars matches a postcode or a name prefix; ≤ 8 results,
// alphabetical, ⚠ never ordered by serviceability. A missing/short `q` returns an empty list (not an
// error), so the client can fire it on every keystroke without special-casing.
func (h *DeliveryReads) getLocalities(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	c.Header("Cache-Control", "public, max-age=86400")
	if len([]rune(q)) < 2 {
		c.JSON(http.StatusOK, localitiesResultDTO{Items: []localityDTO{}})
		return
	}
	rows, err := delivery.SearchLocalities(c.Request.Context(), h.q, q, localitiesLimit)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: locality search failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	items := make([]localityDTO, 0, len(rows))
	for _, r := range rows {
		items = append(items, localityDTO{Name: r.Name, State: r.State, Postcode: r.Postcode})
	}
	c.JSON(http.StatusOK, localitiesResultDTO{Items: items})
}
