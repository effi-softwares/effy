// Package auth implements per-pool Cognito access-token verification (constitution
// Principle IV). One verifier per pool — its own JWKS key set and its own
// pinned-issuer parser — selected structurally by route group. Key sets are NEVER
// merged across pools: a cross-pool token fails key lookup before any claim is read
// (research D1/D2).
package auth

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Audience names match the platform's SSM contract path segments.
const (
	AudienceCustomer   = "customer"
	AudienceDriver     = "driver"
	AudienceShop       = "shop"
	AudienceBackOffice = "back-office"
)

// CognitoAccessClaims is the typed shape of a Cognito ACCESS token. Note: access
// tokens carry client_id, not aud — "audience" validation is the ClientID check below
// (the confirmed Cognito gotcha, research D1).
type CognitoAccessClaims struct {
	jwt.RegisteredClaims
	TokenUse string   `json:"token_use"`
	ClientID string   `json:"client_id"`
	Username string   `json:"username"`
	Scope    string   `json:"scope"`
	Groups   []string `json:"cognito:groups"`
}

// PoolVerifier verifies access tokens for exactly one Cognito user pool.
//
// ⚠ ONE POOL, MANY APP CLIENTS. A pool legitimately has more than one app client — the customer pool has
// a web client and a mobile client (013), and the shop pool the same (014) — because their token lifetimes,
// auth flows and refresh windows genuinely differ. They are all the SAME audience, and a token from any of
// them is equally valid here.
//
// This was a single `clientID` string until 027, and the consequence was invisible and total: every
// customer-mobile call to core-api answered 401 the instant it arrived. Nothing caught it because the only
// authenticated mobile call 019 ever made was a best-effort cart snapshot whose failure was swallowed, and
// checkout was never run on a device. The edge authorizer had an audience LIST from the start and was
// correct; this verifier was the one place that assumed a pool has exactly one client.
type PoolVerifier struct {
	audience  string
	clientIDs []string
	keyfunc   jwt.Keyfunc
	parser    *jwt.Parser
}

// NewPoolVerifier builds a verifier for one pool. It fetches the pool's JWKS at
// construction — startup fails closed if the pool is unreachable or misconfigured,
// so a scoped route group can never mount unauthenticated (ARCHITECTURE.md rule).
// keyfunc's defaults (hourly refresh; unknown-kid refresh rate-limited) handle
// Cognito key rotation (research D2).
// clientIDs is every app client on this pool whose tokens this service accepts (see the type doc). At
// least one is required — an empty set would accept nothing, and failing at startup is better than
// answering 401 to every request forever.
func NewPoolVerifier(ctx context.Context, audience, region, poolID string, clientIDs ...string) (*PoolVerifier, error) {
	issuer := fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s", region, poolID)
	return newPoolVerifierWithJWKS(ctx, audience, issuer, issuer+"/.well-known/jwks.json", clientIDs...)
}

// newPoolVerifierWithJWKS is the seam tests use to point at a local JWKS server.
func newPoolVerifierWithJWKS(ctx context.Context, audience, issuer, jwksURL string, clientIDs ...string) (*PoolVerifier, error) {
	allowed := make([]string, 0, len(clientIDs))
	for _, id := range clientIDs {
		if trimmed := strings.TrimSpace(id); trimmed != "" {
			allowed = append(allowed, trimmed)
		}
	}
	if len(allowed) == 0 {
		return nil, fmt.Errorf("auth: %s pool has no app client ids configured", audience)
	}

	kf, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("auth: %s pool JWKS unavailable: %w", audience, err)
	}

	return &PoolVerifier{
		audience:  audience,
		clientIDs: allowed,
		keyfunc:   kf.Keyfunc,
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{"RS256"}),
			jwt.WithIssuer(issuer),
			jwt.WithExpirationRequired(),
		),
	}, nil
}

// Audience returns the pool audience this verifier is scoped to.
func (v *PoolVerifier) Audience() string { return v.audience }

// Verify runs the full Cognito access-token checklist (research D1): RS256 signature
// against this pool's keys, pinned issuer, expiry, token_use=="access", and
// client_id ∈ this pool's app clients. Any failure returns an error; callers respond
// uniformly (no oracle).
func (v *PoolVerifier) Verify(tokenString string) (*CognitoAccessClaims, error) {
	claims := &CognitoAccessClaims{}
	token, err := v.parser.ParseWithClaims(tokenString, claims, v.keyfunc)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("auth: invalid token")
	}
	if claims.TokenUse != "access" {
		return nil, errors.New("auth: token_use is not access")
	}
	if !slices.Contains(v.clientIDs, claims.ClientID) {
		return nil, errors.New("auth: client_id not allowed for this pool")
	}
	return claims, nil
}
