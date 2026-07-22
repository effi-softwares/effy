// Package httpx owns the HTTP edge conventions: the RFC 9457 problem+json error
// contract, request correlation, and per-request logging. The problem vocabulary here
// mirrors docs/api/error-envelope.md — the cross-backend single source of truth.
package httpx

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const problemContentType = "application/problem+json"

// Problem type URIs — the platform vocabulary (docs/api/error-envelope.md). Adding a
// slug is additive; changing an existing slug's meaning or status is a breaking change.
const (
	TypeValidationFailed = "https://effyshopping.com/problems/validation-failed"
	TypeUnauthenticated  = "https://effyshopping.com/problems/unauthenticated"
	TypeForbidden        = "https://effyshopping.com/problems/forbidden"
	TypeNoRoute          = "https://effyshopping.com/problems/no-route"
	TypeMethodNotAllowed = "https://effyshopping.com/problems/method-not-allowed"
	TypeVersionRetired   = "https://effyshopping.com/problems/version-retired"
	TypeRateLimited      = "https://effyshopping.com/problems/rate-limited"
	TypeConflict         = "https://effyshopping.com/problems/conflict"
	TypeInternal         = "https://effyshopping.com/problems/internal"
	TypeUnavailable      = "https://effyshopping.com/problems/unavailable"
)

// Problem is the RFC 9457 body. `detail` never carries internals — stack traces, SQL,
// or dependency errors live only in the correlated log record.
type Problem struct {
	Type      string       `json:"type"`
	Title     string       `json:"title"`
	Status    int          `json:"status"`
	Detail    string       `json:"detail,omitempty"`
	Instance  string       `json:"instance"`
	RequestID string       `json:"request_id"`
	Errors    []FieldError `json:"errors,omitempty"`
}

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// WriteProblem writes the problem document and aborts the chain.
func WriteProblem(c *gin.Context, status int, typeURI, title, detail string, fieldErrors ...FieldError) {
	p := Problem{
		Type:      typeURI,
		Title:     title,
		Status:    status,
		Detail:    detail,
		Instance:  c.Request.URL.Path,
		RequestID: RequestID(c),
		Errors:    fieldErrors,
	}
	c.Header("Content-Type", problemContentType)
	c.AbortWithStatusJSON(status, p)
}

// Unauthenticated is deliberately identical for every authentication failure —
// missing, malformed, expired, tampered, or wrong-pool credentials — so responses
// leak nothing about which check failed (contract: no oracle).
func Unauthenticated(c *gin.Context) {
	WriteProblem(c, http.StatusUnauthorized, TypeUnauthenticated,
		"Authentication required", "a valid access token for this audience is required")
}

func Forbidden(c *gin.Context) {
	WriteProblem(c, http.StatusForbidden, TypeForbidden,
		"Insufficient permissions", "the authenticated identity may not perform this action")
}

func NotFound(c *gin.Context) {
	WriteProblem(c, http.StatusNotFound, TypeNoRoute,
		"No such route", "the requested path (or API version) does not exist")
}

func MethodNotAllowed(c *gin.Context) {
	WriteProblem(c, http.StatusMethodNotAllowed, TypeMethodNotAllowed,
		"Method not allowed", "the requested method is not supported on this route")
}

func ValidationFailed(c *gin.Context, detail string, fieldErrors ...FieldError) {
	WriteProblem(c, http.StatusBadRequest, TypeValidationFailed,
		"Request validation failed", detail, fieldErrors...)
}

// Internal never explains itself to the caller; the cause is in the log record that
// shares this response's request_id.
func Internal(c *gin.Context) {
	WriteProblem(c, http.StatusInternalServerError, TypeInternal,
		"Internal error", "an unexpected error occurred; reference request_id when reporting")
}

func Unavailable(c *gin.Context) {
	WriteProblem(c, http.StatusServiceUnavailable, TypeUnavailable,
		"Service unavailable", "a required dependency is currently unreachable")
}

// Conflict signals a state clash the client should resolve by re-reading (e.g. a stale delivery quote).
func Conflict(c *gin.Context, detail string) {
	WriteProblem(c, http.StatusConflict, TypeConflict, "Conflict", detail)
}
