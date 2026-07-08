package auth

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// Identity is the verified caller attached to a protected request — the only identity
// information that may reach business logic or logs (subject id only; Principle VII).
type Identity struct {
	Audience string
	Subject  string
	Username string
	Groups   []string
}

type identityCtxKey struct{}

// Middleware returns the auth gate for one pool's route group. Every failure mode —
// missing header, malformed scheme, expired, tampered, wrong pool, wrong client —
// produces the identical 401 problem (no oracle; contract conformance test 4).
func Middleware(v *PoolVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := bearerToken(c.GetHeader("Authorization"))
		if !ok {
			httpx.Unauthenticated(c)
			return
		}

		claims, err := v.Verify(raw)
		if err != nil {
			// The reason is diagnostic gold but must never reach the caller.
			logger.FromContext(c.Request.Context()).Warn("auth: token rejected",
				zap.String("audience", v.Audience()), zap.String("reason", err.Error()))
			httpx.Unauthenticated(c)
			return
		}

		id := Identity{
			Audience: v.Audience(),
			Subject:  claims.Subject,
			Username: claims.Username,
			Groups:   claims.Groups,
		}
		c.Request = c.Request.WithContext(withIdentity(c.Request.Context(), id))
		c.Next()
	}
}

func bearerToken(header string) (string, bool) {
	const prefix = "bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}
	token := strings.TrimSpace(header[len(prefix):])
	return token, token != ""
}

func withIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, identityCtxKey{}, id)
}

// IdentityFromContext returns the verified identity, if the request passed an auth
// middleware.
func IdentityFromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(identityCtxKey{}).(Identity)
	return id, ok
}
