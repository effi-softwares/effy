package storefront

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

const secret = "a-test-secret-that-is-long-enough-to-be-realistic"

func validToken(t *testing.T) string {
	t.Helper()
	return signPreviewToken(secret, time.Now().Add(previewTokenTTL))
}

func TestPreviewToken_RoundTrips(t *testing.T) {
	if err := verifyPreviewToken(secret, validToken(t), time.Now()); err != nil {
		t.Fatalf("a freshly minted token must verify: %v", err)
	}
}

func TestPreviewToken_RefusesATamperedExpiry(t *testing.T) {
	// ⚠ THE ATTACK THE SIGNATURE EXISTS FOR. The expiry travels in the clear, so extending it is the
	// obvious move — an unsigned payload would make every expired token permanently valid.
	tok := signPreviewToken(secret, time.Now().Add(-time.Hour))
	_, sig, _ := strings.Cut(tok, ".")
	forged := "99999999999." + sig

	if err := verifyPreviewToken(secret, forged, time.Now()); err == nil {
		t.Fatal("a rewritten expiry must not verify")
	}
}

func TestPreviewToken_RefusesTheWrongSecret(t *testing.T) {
	if err := verifyPreviewToken("a-different-secret-entirely", validToken(t), time.Now()); err == nil {
		t.Fatal("a token signed with another key must not verify")
	}
}

func TestPreviewToken_Expires(t *testing.T) {
	tok := signPreviewToken(secret, time.Now().Add(time.Minute))
	if err := verifyPreviewToken(secret, tok, time.Now().Add(2*time.Minute)); err == nil {
		t.Fatal("an expired token must not verify")
	}
}

func TestPreviewToken_RefusesEverythingWhenNoSecretIsConfigured(t *testing.T) {
	// ⚠ FAIL CLOSED. On an environment where the secret was never injected, the right behaviour is
	// that preview does not work — not that every caller is trusted. An empty key would otherwise
	// make `hmac.Equal` compare two signatures an attacker can compute for themselves.
	if err := verifyPreviewToken("", validToken(t), time.Now()); err == nil {
		t.Fatal("no configured secret must mean no valid tokens")
	}
	if err := verifyPreviewToken("", "", time.Now()); err == nil {
		t.Fatal("an empty token must never verify")
	}
}

func TestPreviewToken_RefusesMalformedInputWithoutPanicking(t *testing.T) {
	// These arrive from the open internet. None may panic; none may verify.
	for _, tok := range []string{".", "nodot", "..", "abc.def", strings.Repeat("x", 5000), "1786.=="} {
		if err := verifyPreviewToken(secret, tok, time.Now()); err == nil {
			t.Fatalf("%q must not verify", tok)
		}
	}
}

/**
 * ⚠ THE DOMAIN PREFIX IS WHAT STOPS ONE SECRET BECOMING TWO CAPABILITIES.
 *
 * The same key signs the storefront revalidation bearer. Without `preview:v1:` inside the MAC, a
 * signature over a bare payload would be interchangeable between the two — and a token intended to
 * let someone READ a draft would also let them FLUSH the storefront's cache.
 */
func TestPreviewToken_IsBoundToItsPurpose(t *testing.T) {
	payload := "1893456000"
	withDomain := previewSignature(secret, payload)

	// The same key and payload, signed WITHOUT the domain prefix, must not be accepted.
	undomained := hmacNoDomain(secret, payload)
	if withDomain == undomained {
		t.Fatal("the domain prefix is not part of the signed message — one secret would grant two capabilities")
	}
	if err := verifyPreviewToken(secret, payload+"."+undomained, time.Now()); err == nil {
		t.Fatal("a signature computed without the domain prefix must not verify")
	}
}

// ── the cross-language format ──────────────────────────────────────────────────────────────────

/**
 * ⚠ THE BACK OFFICE MINTS THESE IN TYPESCRIPT AND THIS SERVICE VERIFIES THEM IN GO. That is exactly
 * the shape 027 lost days to — two languages, one wire format, and unit tests on both sides that
 * never crossed the boundary. So the bytes are pinned here against a fixed key and payload, and the
 * SAME literal is duplicated, deliberately, in the admin service's `preview.test.ts`.
 *
 * If either implementation drifts — a different digest, a different encoding, base64 with padding
 * instead of without — exactly one of the two tests goes red and says so, rather than every preview
 * link silently falling back to published content with nothing to look at.
 */
const PREVIEW_WIRE_SECRET = "effy-preview-contract-test-key"
const PREVIEW_WIRE_PAYLOAD = "1893456000"

func TestPreviewSignature_IsStableAcrossLanguages(t *testing.T) {
	got := previewSignature(PREVIEW_WIRE_SECRET, PREVIEW_WIRE_PAYLOAD)

	// Base64url WITHOUT padding, 43 chars for a SHA-256 MAC. The encoding is part of the contract:
	// standard base64 would carry `+` and `/`, which are not URL-safe and would be mangled in transit.
	if len(got) != 43 {
		t.Fatalf("signature length changed — the encoding is part of the wire format: %q", got)
	}
	if strings.ContainsAny(got, "+/=") {
		t.Fatalf("signature must be base64url without padding, got %q", got)
	}
	// ⚠ CAPTURED FROM THIS IMPLEMENTATION, then duplicated by hand into the admin service's
	// `preview.test.ts`. Neither side generates it. That is the point: if either drifts, exactly one
	// of the two tests goes red and names the problem — rather than every preview link silently
	// falling back to published content with nothing anywhere to look at.
	const want = "kuZPS42r2ap-5A3ZfPOieKCxV7sBlsU6jphidbpud1U"
	if got != want {
		t.Fatalf("preview signature drifted.\n got: %s\nwant: %s", got, want)
	}
}

// The same MAC without the domain prefix — what a naive implementation would produce.
func hmacNoDomain(secret, payload string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func TestHomeLayout_ServesTheDraftOnlyWithAValidToken(t *testing.T) {
	repo := &fakeReader{
		layout:      homeLayoutRow{Published: []byte(`[{"id":"p","type":"app_promo","props":{}}]`), Revision: 4},
		layoutFound: true,
		draft:       homeLayoutRow{Published: []byte(`[{"id":"d","type":"newsletter","props":{}}]`), Revision: 4},
		draftFound:  true,
	}
	svc := NewService(repo, fakePresign{}).WithPreviewSecret(secret)

	published, err := svc.HomeLayout(context.Background(), "")
	if err != nil {
		t.Fatalf("HomeLayout: %v", err)
	}
	if published.Blocks[0].ID != "p" || published.IsDraft {
		t.Fatalf("no token must serve published content, got %+v", published)
	}

	preview, err := svc.HomeLayout(context.Background(), validToken(t))
	if err != nil {
		t.Fatalf("HomeLayout: %v", err)
	}
	if preview.Blocks[0].ID != "d" || !preview.IsDraft {
		t.Fatalf("a valid token must serve the draft, got %+v", preview)
	}
}

/**
 * ⚠ AN INVALID TOKEN FALLS THROUGH TO PUBLISHED, IT DOES NOT REFUSE. A 401 would tell an anonymous
 * prober that a preview mechanism exists and that their guess was wrong. Serving the ordinary page
 * tells them nothing, and costs a real operator with an expired link only a confusing moment rather
 * than a storefront that appears broken.
 */
func TestHomeLayout_AnInvalidTokenQuietlySeesThePublishedPage(t *testing.T) {
	repo := &fakeReader{
		layout:      homeLayoutRow{Published: []byte(`[{"id":"p","type":"app_promo","props":{}}]`)},
		layoutFound: true,
		draft:       homeLayoutRow{Published: []byte(`[{"id":"d","type":"newsletter","props":{}}]`)},
		draftFound:  true,
	}
	svc := NewService(repo, fakePresign{}).WithPreviewSecret(secret)

	for _, tok := range []string{"garbage", signPreviewToken("wrong-key", time.Now().Add(time.Hour))} {
		got, err := svc.HomeLayout(context.Background(), tok)
		if err != nil {
			t.Fatalf("an invalid token must not error: %v", err)
		}
		if got.IsDraft || got.Blocks[0].ID != "p" {
			t.Fatalf("token %q leaked draft content", tok)
		}
	}
}

func TestHomeLayout_ServesPublishedWhenNoPreviewSecretIsConfigured(t *testing.T) {
	// The whole hot path must keep working on an environment that has no preview at all.
	repo := &fakeReader{
		layout:      homeLayoutRow{Published: []byte(`[{"id":"p","type":"app_promo","props":{}}]`)},
		layoutFound: true,
		draft:       homeLayoutRow{Published: []byte(`[{"id":"d","type":"newsletter","props":{}}]`)},
		draftFound:  true,
	}
	got, err := NewService(repo, fakePresign{}).HomeLayout(context.Background(), validToken(t))
	if err != nil {
		t.Fatalf("HomeLayout: %v", err)
	}
	if got.IsDraft {
		t.Fatal("no configured secret must mean no preview, ever")
	}
}
