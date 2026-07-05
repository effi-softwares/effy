package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/services/core-api/internal/platform/httpx"
)

// The identity matrix (spec US3, quickstart §US3): every authentication failure —
// missing, malformed, expired, tampered, wrong pool, wrong client, ID token — must
// produce a BYTE-IDENTICAL 401 problem (no oracle); valid tokens pass with identity
// in context; group gating returns 403, never 401, for authenticated callers.

type testPool struct {
	key      *rsa.PrivateKey
	kid      string
	issuer   string
	clientID string
	jwks     *httptest.Server
}

func newTestPool(t *testing.T, kid, clientID string) *testPool {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		pub := key.Public().(*rsa.PublicKey)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kty": "RSA", "alg": "RS256", "use": "sig", "kid": kid,
				"n": base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
				"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
			}},
		})
	}))
	t.Cleanup(jwks.Close)

	return &testPool{
		key: key, kid: kid,
		issuer:   "https://cognito-idp.test.local/" + kid,
		clientID: clientID,
		jwks:     jwks,
	}
}

func (p *testPool) verifier(t *testing.T, audience string) *PoolVerifier {
	t.Helper()
	v, err := newPoolVerifierWithJWKS(context.Background(), audience, p.issuer, p.jwks.URL, p.clientID)
	require.NoError(t, err)
	return v
}

type claimsOverride func(*CognitoAccessClaims)

func (p *testPool) token(t *testing.T, overrides ...claimsOverride) string {
	t.Helper()
	claims := &CognitoAccessClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    p.issuer,
			Subject:   "test-subject-123",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		TokenUse: "access",
		ClientID: p.clientID,
		Username: "test-user",
	}
	for _, o := range overrides {
		o(claims)
	}

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = p.kid
	signed, err := tok.SignedString(p.key)
	require.NoError(t, err)
	return signed
}

func newAuthTestRouter(v *PoolVerifier, guards ...gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(httpx.RequestIDMiddleware())
	handlers := append([]gin.HandlerFunc{Middleware(v)}, guards...)
	g := r.Group("/v1/customer", handlers...)
	g.GET("/ping", func(c *gin.Context) {
		id, _ := IdentityFromContext(c.Request.Context())
		c.JSON(http.StatusOK, gin.H{"audience": id.Audience, "subject": id.Subject})
	})
	return r
}

func ping(r *gin.Engine, authorization string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/customer/ping", nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	r.ServeHTTP(w, req)
	return w
}

// problemBytes strips the volatile request_id so "byte-identical" is comparable.
func problemBytes(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var p map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &p))
	delete(p, "request_id")
	b, err := json.Marshal(p)
	require.NoError(t, err)
	return string(b)
}

func TestAuthMatrix(t *testing.T) {
	customer := newTestPool(t, "customer-kid", "customer-client")
	backOffice := newTestPool(t, "back-office-kid", "back-office-client")
	v := customer.verifier(t, AudienceCustomer)
	r := newAuthTestRouter(v)

	t.Run("valid customer token passes with identity in context", func(t *testing.T) {
		w := ping(r, "Bearer "+customer.token(t))
		require.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), `"audience":"customer"`)
		assert.Contains(t, w.Body.String(), `"subject":"test-subject-123"`)
	})

	rejections := map[string]string{
		"missing header":  "",
		"malformed sheme": "Token abc",
		"garbage token":   "Bearer not.a.jwt",
		"expired": "Bearer " + customer.token(t, func(c *CognitoAccessClaims) {
			c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
		}),
		"wrong client_id": "Bearer " + customer.token(t, func(c *CognitoAccessClaims) {
			c.ClientID = "some-other-app"
		}),
		"ID token (token_use)": "Bearer " + customer.token(t, func(c *CognitoAccessClaims) {
			c.TokenUse = "id"
		}),
		// The cross-pool case: perfectly valid for ITS pool, structurally dead here —
		// its kid is not in the customer pool's key set (research D2).
		"valid token from another pool": "Bearer " + backOffice.token(t),
	}

	var canonical string
	for name, header := range rejections {
		t.Run("rejects "+name, func(t *testing.T) {
			w := ping(r, header)
			require.Equal(t, http.StatusUnauthorized, w.Code)
			body := problemBytes(t, w)
			if canonical == "" {
				canonical = body
				return
			}
			// No oracle: every rejection is byte-identical (contract conformance 4).
			assert.Equal(t, canonical, body)
		})
	}
}

func TestRequireGroups(t *testing.T) {
	pool := newTestPool(t, "bo-kid", "bo-client")
	v := pool.verifier(t, AudienceBackOffice)
	r := newAuthTestRouter(v, RequireGroups("admin", "manager"))

	t.Run("group member passes", func(t *testing.T) {
		w := ping(r, "Bearer "+pool.token(t, func(c *CognitoAccessClaims) {
			c.Groups = []string{"admin"}
		}))
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("authenticated but group-less is 403 (absent claim = deny)", func(t *testing.T) {
		w := ping(r, "Bearer "+pool.token(t))
		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), httpx.TypeForbidden)
	})

	t.Run("group names are exact-case", func(t *testing.T) {
		w := ping(r, "Bearer "+pool.token(t, func(c *CognitoAccessClaims) {
			c.Groups = []string{"Admin"}
		}))
		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("unauthenticated is 401, not 403", func(t *testing.T) {
		w := ping(r, "")
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}
