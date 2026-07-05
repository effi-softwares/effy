package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Conformance tests for docs/api/error-envelope.md (contract §Conformance).

func newProblemTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.NoRoute(NotFound)
	r.GET("/boom", func(c *gin.Context) { Internal(c) })
	r.GET("/invalid", func(c *gin.Context) {
		ValidationFailed(c, "body.name must be a non-empty string",
			FieldError{Field: "name", Message: "must be a non-empty string"})
	})
	return r
}

func doReq(t *testing.T, r *gin.Engine, method, path string) (*httptest.ResponseRecorder, Problem) {
	t.Helper()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, nil)
	r.ServeHTTP(w, req)

	var p Problem
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &p), "every failure body parses as a Problem")
	return w, p
}

func TestProblemShapeAndCorrelation(t *testing.T) {
	r := newProblemTestRouter()

	w, p := doReq(t, r, http.MethodGet, "/boom")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
	assert.Equal(t, TypeInternal, p.Type)
	assert.Equal(t, http.StatusInternalServerError, p.Status)
	assert.Equal(t, "/boom", p.Instance)
	assert.NotEmpty(t, p.RequestID)
	// Body request_id == response header == the correlation id (conformance test 2).
	assert.Equal(t, w.Header().Get("X-Request-ID"), p.RequestID)
	// Internals never leak (conformance test 3): generic detail only.
	assert.NotContains(t, p.Detail, "goroutine")
}

func TestNoRouteIsUniform404(t *testing.T) {
	r := newProblemTestRouter()

	_, p3 := doReq(t, r, http.MethodGet, "/v3/platform/status")
	_, pTypo := doReq(t, r, http.MethodGet, "/does-not-exist")

	// A never-existed API version is indistinguishable from any unknown path.
	assert.Equal(t, TypeNoRoute, p3.Type)
	assert.Equal(t, p3.Type, pTypo.Type)
	assert.Equal(t, p3.Title, pTypo.Title)
	assert.Equal(t, http.StatusNotFound, p3.Status)
}

func TestValidationFailedCarriesFieldErrors(t *testing.T) {
	r := newProblemTestRouter()

	w, p := doReq(t, r, http.MethodGet, "/invalid")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, TypeValidationFailed, p.Type)
	require.Len(t, p.Errors, 1)
	assert.Equal(t, "name", p.Errors[0].Field)
}

func TestInboundRequestIDHonoredAndSanitized(t *testing.T) {
	r := newProblemTestRouter()

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	req.Header.Set("X-Request-ID", "caller-supplied-123")
	r.ServeHTTP(w, req)
	assert.Equal(t, "caller-supplied-123", w.Header().Get("X-Request-ID"))

	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/boom", nil)
	req.Header.Set("X-Request-ID", "bad id\nwith newline")
	r.ServeHTTP(w, req)
	assert.NotEqual(t, "bad id\nwith newline", w.Header().Get("X-Request-ID"), "hostile ids are replaced")
	assert.NotEmpty(t, w.Header().Get("X-Request-ID"))
}
