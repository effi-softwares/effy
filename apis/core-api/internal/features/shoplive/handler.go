package shoplive

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// Gate answers "which shop may this subject watch?" from the platform's own record.
//
// ⚠ AN INTERFACE, not the concrete `auth.ShopGate`, so the handler is testable without a database
// and so this package depends on the one question it asks rather than the shape of a platform type.
type Gate interface {
	ActiveShopFor(ctx context.Context, sub string) (string, error)
}

const (
	// heartbeat keeps intermediaries from treating a quiet stream as dead. The ALB's idle timeout is
	// 120s in `infra/modules/ecs-fargate-web-service`; 20s leaves room for a proxy configured tighter,
	// and costs a handful of bytes an hour.
	heartbeat = 20 * time.Second

	// maxStreamAge closes a stream so the client reconnects and re-presents its token.
	//
	// ⚠ THIS IS THE AUTHORIZATION REFRESH. Without it, an operator stood down at 09:01 keeps a stream
	// opened at 09:00 for as long as their laptop stays awake. Their DATA stops sooner — every
	// refetch goes through edge-shop's gate and fails closed — but the stream itself should not
	// outlive the record by hours. Fifteen minutes bounds it; the reconnect is invisible to the user.
	maxStreamAge = 15 * time.Minute
)

// Handler serves the shop console's live stream.
type Handler struct {
	hub     *Hub
	gate    Gate
	metrics Metrics
	// Injected so tests need not wait out real durations.
	heartbeat    time.Duration
	maxStreamAge time.Duration

	// ⚠ INJECTED RATHER THAN CALLING auth.IdentityFromContext DIRECTLY, so that testing this handler
	// does not require the auth package to export a way to FORGE an identity into a context. A
	// helper like that would be available to production code too, and the one thing an auth package
	// must never make easy is manufacturing a caller. Wired by hand at the composition root
	// (Principle VI: no DI framework, explicit and greppable).
	identityOf func(ctx context.Context) (auth.Identity, bool)
}

func NewHandler(hub *Hub, gate Gate, m Metrics) *Handler {
	return &Handler{
		hub:          hub,
		gate:         gate,
		metrics:      m,
		heartbeat:    heartbeat,
		maxStreamAge: maxStreamAge,
		identityOf:   auth.IdentityFromContext,
	}
}

// RegisterShop mounts the SECOND shop-authorized route on this service.
//
// ⚠ THE FIRST IS 057's REFUND, AND THE COUNT MATTERS. `refunds.RegisterShop` carries a comment
// calling itself "the whole of the shop's reach into core-api"; that is no longer true, and the
// comment there now says so. Every other route on this service is scoped to the customer or
// back-office pool and rejects a shop token structurally.
//
// ⚠ WHY A SHOP ROUTE IS ON THE HOT PATH AT ALL (Principle III, recorded exception — research R1):
// this is a long-lived HTTP response, and the cold path cannot hold one. API Gateway's HTTP API caps
// an integration at 30 seconds, so a Lambda behind the shared gateway cannot serve a stream at all.
// `core-api` on Fargate is the platform's only long-running process. It carries NO shop data, so no
// shop READ moves here: the console still fetches everything from `edge-shop`.
func RegisterShop(v1 *gin.RouterGroup, v *auth.PoolVerifier, h *Handler) {
	shop := v1.Group("/shop", auth.Middleware(v))
	shop.GET("/live", h.stream)
}

func (h *Handler) stream(c *gin.Context) {
	id, ok := h.identityOf(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}

	shopID, err := h.gate.ActiveShopFor(c.Request.Context(), id.Subject)
	if err != nil {
		// ⚠ 503, not 403 — "we could not check" and "you may not" are different facts. One should
		// make the console retry; the other should make it stop.
		logger.FromContext(c.Request.Context()).Error("shoplive: gate failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	if shopID == "" {
		httpx.Forbidden(c)
		return
	}

	events, release := h.hub.Subscribe(shopID, id.Subject)
	defer release()
	h.metrics.ShopLiveStreams(h.hub.Streams())
	defer func() { h.metrics.ShopLiveStreams(h.hub.Streams() - 1) }()

	// ⚠ CLEAR THE SERVER'S WRITE DEADLINE, OR EVERY STREAM DIES AT 30 SECONDS.
	//
	// `http.Server.WriteTimeout` is 30s for this service (platform/config) and it applies to the
	// WHOLE response — which for a stream is its entire lifetime. Nothing in a unit test would ever
	// show this: `httptest` sets no timeouts, so the handler passes every test and then drops each
	// console once a minute in dev and in production. This is 024's VectorDrawable class of defect —
	// valid, compiling, tested, and wrong only where it runs.
	if err := http.NewResponseController(c.Writer).SetWriteDeadline(time.Time{}); err != nil {
		// Not fatal: the stream still works, it just ends at the server's write timeout and the
		// client reconnects. Worth an error line, because it turns a live feature into a polling one.
		logger.FromContext(c.Request.Context()).Error("shoplive: could not clear write deadline", zap.Error(err))
	}

	w := c.Writer
	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	// ⚠ no-store, not no-cache: nothing about a stream is ever revalidated, and a proxy holding a
	// copy of one would be holding an open socket's worth of someone else's console.
	header.Set("Cache-Control", "no-store")
	header.Set("Connection", "keep-alive")
	// nginx and friends buffer proxied responses by default, which turns a live stream into a
	// surprise batch delivered at close.
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	// Tell the client how long to wait before reconnecting, then hand it a resync: a fresh stream
	// knows nothing about what happened before it opened, so the first instruction is always
	// "refetch" (research R2 — backfill on connect, never assume continuity).
	fmt.Fprintf(w, "retry: 3000\n\n")
	writeEvent(w, EventResync, 0)
	w.Flush()

	ticker := time.NewTicker(h.heartbeat)
	defer ticker.Stop()
	deadline := time.NewTimer(h.maxStreamAge)
	defer deadline.Stop()

	var seq uint64
	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			// The browser went away (tab closed, network dropped, or the page hid for a minute).
			return
		case <-deadline.C:
			return
		case <-ticker.C:
			// A comment line: ignored by every SSE client, and enough to keep the socket alive.
			fmt.Fprint(w, ": hb\n\n")
			w.Flush()
		case e, open := <-events:
			if !open {
				// Evicted (this subject opened too many streams) — closing is the whole message.
				return
			}
			seq++
			writeEvent(w, e, seq)
			w.Flush()
		}
	}
}

// writeEvent emits one SSE frame.
//
// ⚠ `data` IS ALWAYS `{}`. Nothing about an order, a product or a person is ever put on this
// channel — the client answers every event by refetching from the cold path, which is what makes a
// duplicated or reordered event harmless (contracts/shop-live-stream.contract.md).
//
// The id is a per-process sequence for logs only; the client never resumes from it, because resuming
// would mean trusting a stream that is explicitly not durable.
func writeEvent(w gin.ResponseWriter, e Event, seq uint64) {
	fmt.Fprintf(w, "event: %s\nid: %d\ndata: {}\n\n", e, seq)
}
