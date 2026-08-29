package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// ⚠ 055 — NEW ATTACK SURFACE, PROVEN IN BOTH DIRECTIONS.
//
// Until this slice, `core-api` verified exactly one pool: the customer's. It now verifies a second —
// the back office — because refunds are issued here, because the payment secret is here and nowhere
// else (019 SC-012, research R1).
//
// That is the shape Principle IV sanctions: per-pool validation against each pool's own issuer and
// client ids. It is NOT the auth proxy the principle forbids — the rejected alternative was the cold
// path forwarding an operator's token to this service, which is brokering by definition.
//
// ⚠ But "sanctioned" is an argument, and this is the service that moves money. The argument is worth
// nothing without the demonstration, so both directions are asserted here rather than assumed:
//   * a CUSTOMER token must not reach an admin route (the money routes), and
//   * a BACK-OFFICE token must not reach a customer route (someone else's cart and orders).
//
// A token that crossed either way would be a privilege escalation on the platform's most sensitive
// service.

// twoPoolRouter mounts a customer group and an admin group, each behind its OWN verifier — exactly
// the arrangement main.go builds.
func twoPoolRouter(t *testing.T, customerV, backOfficeV *PoolVerifier) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	v1 := r.Group("/v1")

	v1.Group("/customer", Middleware(customerV)).
		GET("/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	// The 055 admin group — where refunds and staff cancellation live.
	admin := v1.Group("/admin", Middleware(backOfficeV))
	admin.POST("/orders/x/refunds", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	admin.POST("/orders/x/cancel", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	// ⚠ T053a — THE CUSTOMER'S OWN CANCEL ROUTE. Until US2 there was no customer WRITE route on this
	// service at all, so the second direction of the isolation had nothing to be tested against: every
	// customer route was a read. This is the first one that moves money on a shopper's say-so, and it
	// is exactly the route a back-office token must not reach — a staff member's token landing here
	// would cancel and refund an order as though the customer had asked for it.
	v1.Group("/orders", Middleware(customerV)).
		POST("/:id/cancel", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	return r
}

func call(r *gin.Engine, method, path, authorization string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	r.ServeHTTP(w, req)
	return w
}

func TestPoolIsolation_TokensDoNotCrossBetweenAudiences(t *testing.T) {
	customer := newTestPool(t, "customer-kid", "customer-client")
	backOffice := newTestPool(t, "back-office-kid", "back-office-client")

	customerV := customer.verifier(t, AudienceCustomer)
	backOfficeV := backOffice.verifier(t, AudienceBackOffice)
	r := twoPoolRouter(t, customerV, backOfficeV)

	customerToken := "Bearer " + customer.token(t)
	staffToken := "Bearer " + backOffice.token(t)

	t.Run("a CUSTOMER token cannot reach the money routes", func(t *testing.T) {
		w := call(r, http.MethodPost, "/v1/admin/orders/x/refunds", customerToken)
		require.Equal(t, http.StatusUnauthorized, w.Code,
			"⚠ a customer token reaching an admin refund route would be a privilege escalation on the "+
				"service that holds the payment secret")
	})

	t.Run("a BACK-OFFICE token cannot reach a customer route", func(t *testing.T) {
		w := call(r, http.MethodGet, "/v1/customer/ping", staffToken)
		require.Equal(t, http.StatusUnauthorized, w.Code,
			"⚠ isolation runs BOTH ways — a staff token on a customer route would read a shopper's own data")
	})

	// ⚠ T053a. The half that could not be tested until US2 existed: every customer route on this
	// service used to be a READ. This one moves money, and a staff token reaching it would cancel and
	// refund an order as though the shopper had asked for it — with the refund recorded against
	// `actor_kind = 'customer'`, so the audit trail would name the wrong person.
	t.Run("a BACK-OFFICE token cannot cancel through the CUSTOMER route", func(t *testing.T) {
		w := call(r, http.MethodPost, "/v1/orders/o1/cancel", staffToken)
		require.Equal(t, http.StatusUnauthorized, w.Code)
		// Staff have their own cancel route, with its own gate — this is not a capability they lack.
		require.Equal(t, http.StatusOK, call(r, http.MethodPost, "/v1/admin/orders/x/cancel", staffToken).Code)
	})

	t.Run("each token still works on its own audience", func(t *testing.T) {
		// ⚠ Without this the test could pass by refusing everything, which is not isolation, it is
		// an outage. A guard that cannot distinguish "correctly refused" from "broken" proves nothing.
		require.Equal(t, http.StatusOK, call(r, http.MethodGet, "/v1/customer/ping", customerToken).Code)
		require.Equal(t, http.StatusOK, call(r, http.MethodPost, "/v1/admin/orders/x/refunds", staffToken).Code)
		require.Equal(t, http.StatusOK, call(r, http.MethodPost, "/v1/orders/o1/cancel", customerToken).Code)
	})

	t.Run("neither refusal says WHY — no oracle for which pool a route serves", func(t *testing.T) {
		crossA := call(r, http.MethodPost, "/v1/admin/orders/x/refunds", customerToken)
		crossB := call(r, http.MethodGet, "/v1/customer/ping", staffToken)

		// ⚠ Compared WITHOUT `instance`, which is the request path — the caller supplied it, so it
		// discloses nothing. An earlier version of this test compared whole bodies and failed on
		// exactly that, which would have been a false alarm dressed as a security finding.
		require.Equal(t, withoutInstance(t, crossA), withoutInstance(t, crossB),
			"a difference in the refusal itself would tell a caller which audience a route belongs to, "+
				"and 'wrong pool' must be indistinguishable from 'expired', 'tampered' and 'absent'")
	})
}

// withoutInstance strips the volatile request id AND the request path, leaving only what the refusal
// itself says. The path is the caller's own input; the rest is what could leak.
func withoutInstance(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var p map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &p))
	delete(p, "request_id")
	delete(p, "instance")
	b, err := json.Marshal(p)
	require.NoError(t, err)
	return string(b)
}
