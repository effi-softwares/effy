package shoplive

import (
	"context"
	"errors"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Channel is the PostgreSQL NOTIFY channel the triggers write to (see the 058 migration).
const Channel = "shop_ops"

// Listener holds ONE dedicated connection running `LISTEN shop_ops` and fans each notification into
// the hub (058).
//
// ⚠ ONE CONNECTION PER PROCESS, NOT PER BROWSER. This is what makes the design cost nothing: a
// thousand open consoles are a thousand cheap HTTP streams on this service and exactly one extra
// database connection — which matters on a t4g.micro, where connections are the scarce resource.
//
// ⚠ NOTIFY IS NOT DURABLE. PostgreSQL delivers to sessions that are listening AT THE TIME; anything
// sent while this connection is down is gone, and no amount of retrying will recover it. That is
// why a reconnect broadcasts `resync` to every open stream instead of quietly resuming: the correct
// response to "I was blind for four seconds" is "everyone refetch", not "carry on and hope".
type Listener struct {
	pool    *pgxpool.Pool
	hub     *Hub
	log     *zap.Logger
	metrics Metrics

	// Injected for the tests; nil means the real ones.
	onReconnect func()
}

// Metrics is the narrow slice of the platform registry this package reports to.
type Metrics interface {
	ShopLiveStreams(n int)
	ShopLivePoke()
	ShopLiveListenerReconnect()
}

func NewListener(pool *pgxpool.Pool, hub *Hub, log *zap.Logger, m Metrics) *Listener {
	return &Listener{pool: pool, hub: hub, log: log, metrics: m}
}

// Run listens until the context is cancelled, reconnecting with capped backoff.
//
// ⚠ IT NEVER RETURNS AN ERROR THAT STOPS THE SERVICE. The stream is an enhancement over polling: if
// this loop cannot connect, every console falls back to its 30-second refetch and the shop console
// keeps working (research R2). Taking down `core-api` — which also takes checkout with it — because
// a notification channel is unavailable would be the tail wagging the dog.
func (l *Listener) Run(ctx context.Context) {
	backoff := time.Second
	const maxBackoff = 30 * time.Second

	for ctx.Err() == nil {
		err := l.listen(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil && !errors.Is(err, context.Canceled) {
			l.log.Error("shop live listener dropped", zap.Error(err))
		}
		l.metrics.ShopLiveListenerReconnect()

		// ⚠ Tell every open console to refetch. We do not know what changed while we were away, and
		// a stale Needs attention card is exactly the failure this feature exists to prevent.
		l.hub.Resync()
		if l.onReconnect != nil {
			l.onReconnect()
		}

		jitter := time.Duration(rand.Int64N(int64(backoff / 2)))
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff + jitter):
		}
		if backoff < maxBackoff {
			backoff *= 2
		}
	}
}

// listen holds one connection for as long as it stays healthy.
func (l *Listener) listen(ctx context.Context) error {
	conn, err := l.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "LISTEN "+Channel); err != nil {
		return err
	}
	l.log.Info("shop live listener connected", zap.String("channel", Channel))

	// A fresh LISTEN means we may have missed notifications while reconnecting.
	l.hub.Resync()

	for {
		n, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}
		if n.Payload == "" {
			continue
		}
		l.metrics.ShopLivePoke()
		l.hub.Poke(n.Payload)
	}
}
