package platformstatus

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/services/core-api/internal/platform/httpx"
)

// newTestRouter assembles the engine the way main does: version groups + NoRoute,
// so version-coexistence behavior is tested against real routing (spec SC-010).
func newTestRouter(repo StatusReader) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(httpx.RequestIDMiddleware())
	r.NoRoute(httpx.NotFound)

	h := NewHandler(NewService(repo, "dev"))
	Register(r.Group("/v1"), r.Group("/v2"), h)
	return r
}

func get(t *testing.T, r *gin.Engine, path string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return w, body
}

func healthyRepo() *fakeRepo {
	return &fakeRepo{status: PlatformStatus{
		DatabaseName:      "effy",
		DatabaseTime:      time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC),
		MigrationVersion:  20260705095817,
		MigrationsApplied: 1,
	}}
}

func TestV1AndV2ServeSideBySideWithDivergentShapes(t *testing.T) {
	r := newTestRouter(healthyRepo())

	w1, v1 := get(t, r, "/v1/platform/status")
	w2, v2 := get(t, r, "/v2/platform/status")

	require.Equal(t, http.StatusOK, w1.Code)
	require.Equal(t, http.StatusOK, w2.Code)

	// v1: flat shape (contracts/core-api.contract.md).
	assert.Equal(t, "dev", v1["environment"])
	assert.Equal(t, "effy", v1["database_name"])
	assert.EqualValues(t, 20260705095817, v1["migration_version"])
	assert.NotContains(t, v1, "contract_version")

	// v2: the deliberate breaking reshape — nested database, explicit contract version.
	assert.EqualValues(t, 2, v2["contract_version"])
	db, ok := v2["database"].(map[string]any)
	require.True(t, ok, "v2 nests database")
	assert.Equal(t, "effy", db["name"])
	migration, ok := db["migration"].(map[string]any)
	require.True(t, ok, "v2 nests migration under database")
	assert.EqualValues(t, 20260705095817, migration["version"])
	assert.NotContains(t, v2, "database_name", "v1's flat fields are absent from v2")
}

func TestNeverExistedVersionIs404NoRoute(t *testing.T) {
	r := newTestRouter(healthyRepo())

	w, body := get(t, r, "/v3/platform/status")

	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Equal(t, httpx.TypeNoRoute, body["type"])
}

func TestRepositoryFailureIsUniformInternalProblem(t *testing.T) {
	r := newTestRouter(&fakeRepo{err: errors.New("pq: relation \"goose_db_version\" does not exist")})

	w, body := get(t, r, "/v1/platform/status")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, httpx.TypeInternal, body["type"])
	// The SQL-level cause must never reach the caller (error-envelope conformance 3).
	assert.NotContains(t, w.Body.String(), "goose_db_version")
}

func TestDatabaseTimeoutIsUnavailableProblem(t *testing.T) {
	r := newTestRouter(&fakeRepo{err: context.DeadlineExceeded})

	w, body := get(t, r, "/v1/platform/status")

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Equal(t, httpx.TypeUnavailable, body["type"])
}
