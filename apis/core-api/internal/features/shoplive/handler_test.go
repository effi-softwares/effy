package shoplive

import (
	"bufio"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
)

type fakeGate struct {
	shopID string
	err    error
}

func (g fakeGate) ActiveShopFor(context.Context, string) (string, error) { return g.shopID, g.err }

type noMetrics struct{}

func (noMetrics) ShopLiveStreams(int)        {}
func (noMetrics) ShopLivePoke()              {}
func (noMetrics) ShopLiveListenerReconnect() {}

// serve runs the handler against a real HTTP server so the response is a real stream.
func serve(t *testing.T, h *Handler, sub string) (*http.Response, func()) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Stand in for the pool middleware: the identity a verified shop token would have produced.
	h.identityOf = func(context.Context) (auth.Identity, bool) {
		return auth.Identity{Audience: "shop", Subject: sub}, sub != ""
	}
	r.GET("/v1/shop/live", h.stream)

	srv := httptest.NewServer(r)
	req, err := http.NewRequest(http.MethodGet, srv.URL+"/v1/shop/live", nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	res, err := http.DefaultClient.Do(req.WithContext(ctx))
	if err != nil {
		t.Fatal(err)
	}
	return res, func() { cancel(); res.Body.Close(); srv.Close() }
}

func readFrame(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	var b strings.Builder
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatalf("reading frame: %v (got %q)", err, b.String())
		}
		if line == "\n" {
			return b.String()
		}
		b.WriteString(line)
	}
}

func TestStreamOpensWithAResyncAndSaysHowToReconnect(t *testing.T) {
	h := NewHandler(NewHub(), fakeGate{shopID: "shop-1"}, noMetrics{})
	res, done := serve(t, h, "sub-a")
	defer done()

	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("Content-Type = %q, want text/event-stream", ct)
	}
	// A proxy that buffers turns a live stream into a surprise batch delivered at close.
	if res.Header.Get("X-Accel-Buffering") != "no" {
		t.Fatal("X-Accel-Buffering must be no")
	}
	if cc := res.Header.Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", cc)
	}

	r := bufio.NewReader(res.Body)
	if first := readFrame(t, r); !strings.Contains(first, "retry: 3000") {
		t.Fatalf("first frame = %q, want the retry hint", first)
	}
	// ⚠ A fresh stream knows nothing about what happened before it opened, so the first instruction
	// is always "refetch" — backfill on connect, never assume continuity (research R2).
	if second := readFrame(t, r); !strings.Contains(second, "event: resync") {
		t.Fatalf("second frame = %q, want a resync", second)
	}
}

func TestEveryFrameCarriesAnEmptyPayload(t *testing.T) {
	hub := NewHub()
	h := NewHandler(hub, fakeGate{shopID: "shop-1"}, noMetrics{})
	res, done := serve(t, h, "sub-a")
	defer done()

	r := bufio.NewReader(res.Body)
	readFrame(t, r) // retry
	readFrame(t, r) // resync

	// Wait for the subscription, then poke.
	deadline := time.Now().Add(2 * time.Second)
	for hub.Streams() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	hub.Poke("shop-1")

	frame := readFrame(t, r)
	if !strings.Contains(frame, "event: poke") {
		t.Fatalf("frame = %q, want a poke", frame)
	}
	// ⚠ THE STREAM CARRIES NO DATA. Not an order number, not a customer name, not a count. That is
	// what makes a duplicated or reordered event harmless, and it is the property to defend.
	if !strings.Contains(frame, "data: {}") {
		t.Fatalf("frame = %q, want an empty data payload", frame)
	}
}

func TestHeartbeatKeepsTheConnectionAlive(t *testing.T) {
	h := NewHandler(NewHub(), fakeGate{shopID: "shop-1"}, noMetrics{})
	h.heartbeat = 10 * time.Millisecond
	res, done := serve(t, h, "sub-a")
	defer done()

	r := bufio.NewReader(res.Body)
	readFrame(t, r)
	readFrame(t, r)

	line, err := r.ReadString('\n')
	if err != nil {
		t.Fatalf("reading heartbeat: %v", err)
	}
	// A comment line: ignored by every SSE client, and enough to keep an idle socket open past the
	// load balancer's timeout.
	if !strings.HasPrefix(line, ":") {
		t.Fatalf("expected a comment heartbeat, got %q", line)
	}
}

func TestStreamEndsAtItsMaximumAgeSoAuthorizationIsRechecked(t *testing.T) {
	h := NewHandler(NewHub(), fakeGate{shopID: "shop-1"}, noMetrics{})
	h.maxStreamAge = 30 * time.Millisecond
	res, done := serve(t, h, "sub-a")
	defer done()

	r := bufio.NewReader(res.Body)
	readFrame(t, r)
	readFrame(t, r)

	// ⚠ The close IS the authorization refresh: the client reconnects and re-presents its token, so
	// an operator stood down mid-shift cannot hold a stream open all afternoon.
	for {
		if _, err := r.ReadString('\n'); err != nil {
			return // closed, as intended
		}
	}
}

func TestRefusals(t *testing.T) {
	t.Run("an operator with no active shop is refused", func(t *testing.T) {
		h := NewHandler(NewHub(), fakeGate{shopID: ""}, noMetrics{})
		res, done := serve(t, h, "sub-nobody")
		defer done()
		if res.StatusCode != http.StatusForbidden {
			t.Fatalf("status = %d, want 403", res.StatusCode)
		}
	})

	t.Run("a failed check refuses with 503, not 403", func(t *testing.T) {
		h := NewHandler(NewHub(), fakeGate{err: errors.New("db down")}, noMetrics{})
		res, done := serve(t, h, "sub-a")
		defer done()
		// "We could not check" and "you may not" are different facts: one should make the console
		// retry, the other should make it stop.
		if res.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want 503", res.StatusCode)
		}
	})
}
