package httpx

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	headerRequestID = "X-Request-ID"
	ctxKeyRequestID = "httpx.request_id"
	maxInboundIDLen = 64
)

// RequestIDMiddleware honors a reasonable inbound X-Request-ID (so upstream callers
// can stitch traces) or mints a UUID, exposes it to handlers, and echoes it on the
// response. It MUST be first in the chain — everything downstream logs it.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(headerRequestID)
		if !validInboundID(id) {
			id = uuid.NewString()
		}
		c.Set(ctxKeyRequestID, id)
		c.Header(headerRequestID, id)
		c.Next()
	}
}

// RequestID returns the request's correlation id ("" outside the middleware).
func RequestID(c *gin.Context) string {
	return c.GetString(ctxKeyRequestID)
}

// validInboundID accepts short token-ish ids and rejects anything that could pollute
// logs (control chars, absurd length).
func validInboundID(id string) bool {
	if id == "" || len(id) > maxInboundIDLen {
		return false
	}
	for _, r := range id {
		ok := r == '-' || r == '_' || r == '.' ||
			(r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
		if !ok {
			return false
		}
	}
	return true
}
