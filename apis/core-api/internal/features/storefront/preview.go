// 042 US3 — the preview token, and why the storefront can be trusted to keep draft content private.
//
// ⚠ THE PROBLEM THIS SOLVES IS AN AUTHENTICATION MISMATCH, not a rendering one. FR-018 requires the
// preview to be THE REAL PAGE — same route, same components, no second renderer — because a preview
// built from a parallel renderer eventually disagrees with the thing it previews, and the operator
// trusts it right up until it is wrong. But the real page is the PUBLIC storefront, which has no
// concept of a back-office identity: different Cognito pool, no session, no cookie it would accept.
//
// So the back office mints a short-lived signed token, and this file is the other end of it. The
// token proves "an authorised operator asked for this" without the storefront ever learning who they
// are, and without the hot path gaining a second authentication scheme.
//
// ⚠ IT REUSES THE STOREFRONT-CONTROL SECRET WITH DOMAIN SEPARATION, rather than seeding a third one.
// Every signature is over `preview:v1:` + payload, so a token can never be replayed as a
// revalidation bearer or vice versa — the two live in disjoint namespaces of the same key. The cost
// is recorded rather than hidden: one compromised secret yields both cache invalidation and the
// ability to read UNPUBLISHED merchandising. Neither is customer data, and the alternative — a third
// operator-seeded secret, in Terraform, in three services — buys separation the threat model does
// not need.
package storefront

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"
)

// previewTokenTTL bounds a preview session.
//
// ⚠ SHORT ON PURPOSE. The token travels in a URL — it lands in browser history, in whatever the
// operator pastes it into, and in any proxy log along the way. Fifteen minutes is long enough to
// review a page and short enough that a leaked link is worthless by the time anyone finds it.
const previewTokenTTL = 15 * time.Minute

var errPreviewToken = errors.New("storefront: invalid preview token")

// signPreviewToken is the minting side, kept here so both ends of the format live in one file. The
// back office mints in TypeScript; this is what that implementation has to match, and the test in
// preview_test.go pins the exact bytes so it cannot drift silently.
func signPreviewToken(secret string, expiresAt time.Time) string {
	payload := strconv.FormatInt(expiresAt.Unix(), 10)
	return payload + "." + previewSignature(secret, payload)
}

func previewSignature(secret, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	// ⚠ THE DOMAIN PREFIX IS PART OF THE SIGNED MESSAGE, not decoration. Without it a signature over
	// "1786…" would be valid for any other feature that also signs a bare timestamp with this key.
	mac.Write([]byte("preview:v1:" + payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// verifyPreviewToken reports whether a token is a currently-valid preview grant.
//
// ⚠ An empty secret NEVER verifies. On an environment where the secret was not injected, the correct
// behaviour is that preview does not work — not that every caller is trusted. Fail-closed here means
// an unconfigured deployment serves published content to everyone, which is the safe half.
func verifyPreviewToken(secret, token string, now time.Time) error {
	if secret == "" || token == "" {
		return errPreviewToken
	}
	payload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return errPreviewToken
	}

	// ⚠ Constant-time, and the signature is checked BEFORE the expiry is parsed. Reading an
	// unauthenticated payload first would let a caller learn which malformed inputs are cheap to
	// process; more practically, it keeps the two failure modes from having different timings.
	if !hmac.Equal([]byte(previewSignature(secret, payload)), []byte(sig)) {
		return errPreviewToken
	}

	unix, err := strconv.ParseInt(payload, 10, 64)
	if err != nil {
		return errPreviewToken
	}
	if now.After(time.Unix(unix, 0)) {
		return errPreviewToken
	}
	return nil
}
