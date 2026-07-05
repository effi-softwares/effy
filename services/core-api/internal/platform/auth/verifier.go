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
type PoolVerifier struct {
	audience string
	clientID string
	keyfunc  jwt.Keyfunc
	parser   *jwt.Parser
}

// NewPoolVerifier builds a verifier for one pool. It fetches the pool's JWKS at
// construction — startup fails closed if the pool is unreachable or misconfigured,
// so a scoped route group can never mount unauthenticated (ARCHITECTURE.md rule).
// keyfunc's defaults (hourly refresh; unknown-kid refresh rate-limited) handle
// Cognito key rotation (research D2).
func NewPoolVerifier(ctx context.Context, audience, region, poolID, clientID string) (*PoolVerifier, error) {
	issuer := fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s", region, poolID)
	return newPoolVerifierWithJWKS(ctx, audience, issuer, issuer+"/.well-known/jwks.json", clientID)
}

// newPoolVerifierWithJWKS is the seam tests use to point at a local JWKS server.
func newPoolVerifierWithJWKS(ctx context.Context, audience, issuer, jwksURL, clientID string) (*PoolVerifier, error) {
	kf, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("auth: %s pool JWKS unavailable: %w", audience, err)
	}

	return &PoolVerifier{
		audience: audience,
		clientID: clientID,
		keyfunc:  kf.Keyfunc,
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
// client_id ∈ this pool's app client. Any failure returns an error; callers respond
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
	if claims.ClientID != v.clientID {
		return nil, errors.New("auth: client_id not allowed for this pool")
	}
	return claims, nil
}
