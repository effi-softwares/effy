// Package shoplive fans PostgreSQL notifications out to the shop consoles watching a shop (058).
//
// ⚠ IT CARRIES NO DATA, AND THAT IS THE DESIGN (contracts/shop-live-stream.contract.md). Every event
// on the wire is a content-free "poke" — "something at your shop changed" — and the browser answers
// it by refetching `/shop/v1/today` from the cold path. Replicache calls this a poke; the property
// it buys is that ordering, duplication and gaps stop mattering. A poke delivered twice costs one
// redundant fetch. A poke lost costs nothing the next poke, the next reconnect or the safety
// refetch does not fix. If the stream carried rows instead, every one of those would be a defect
// class we would have to engineer against — and a shop's order data would be crossing a channel
// nobody can replay.
//
// ⚠ THIS IS NOT THE EVENT BACKBONE (Principle VI, research R19). Domain events belong on the shared
// SNS topic when it lands. `shop_ops` is a cache-invalidation hint with a shop id in it, and no
// business process may ever read it.
package shoplive

import (
	"sync"
	"time"
)

// Event is what a subscriber receives. Both kinds are content-free; only the reason differs.
type Event string

const (
	// EventPoke — something changed at this shop. Refetch.
	EventPoke Event = "poke"
	// EventResync — we may have missed something (a fresh connection, or the listener reconnected).
	// Same client action; a distinct name so the logs can tell "steady state" from "we were blind".
	EventResync Event = "resync"
)

// pokeThrottle collapses a burst into one wake-up.
//
// ⚠ Postgres already collapses identical payloads WITHIN one transaction, so a twenty-line pick in
// one transaction arrives once. This handles the other shape: twenty transactions in two seconds —
// a driver checking in a van-load, a bulk state advance — which would otherwise be twenty refetches
// per open tab. Trailing edge, so the LAST state is always fetched.
const pokeThrottle = 500 * time.Millisecond

// maxStreamsPerSubject bounds one operator's concurrent streams.
//
// ⚠ Not a security control — the gate is. This stops a tab-hoarding browser (or a reconnect loop
// that never closes its old reader) from holding file descriptors on a single-task service. The
// OLDEST is closed rather than the newest refused, because the newest is the one a person is
// actually looking at.
const maxStreamsPerSubject = 5

type subscriber struct {
	shopID  string
	subject string
	ch      chan Event
	seq     uint64
}

// Hub holds every open stream, keyed by shop.
type Hub struct {
	mu          sync.Mutex
	byShop      map[string]map[*subscriber]struct{}
	bySubject   map[string][]*subscriber
	lastPokeAt  map[string]time.Time
	pendingPoke map[string]*time.Timer
	nextSeq     uint64

	// Injected so tests can drive time instead of sleeping through it.
	now   func() time.Time
	after func(time.Duration, func()) *time.Timer
}

func NewHub() *Hub {
	return &Hub{
		byShop:      map[string]map[*subscriber]struct{}{},
		bySubject:   map[string][]*subscriber{},
		lastPokeAt:  map[string]time.Time{},
		pendingPoke: map[string]*time.Timer{},
		now:         time.Now,
		after:       time.AfterFunc,
	}
}

// Subscribe registers a stream and returns its channel plus a function to release it.
//
// ⚠ The channel is buffered and sends are NON-BLOCKING (see deliver). A subscriber that has stopped
// reading — a laptop asleep mid-frame — must never be able to stall the notification loop for every
// other console in the region.
func (h *Hub) Subscribe(shopID, subject string) (<-chan Event, func()) {
	s := &subscriber{shopID: shopID, subject: subject, ch: make(chan Event, 8)}

	h.mu.Lock()
	if h.byShop[shopID] == nil {
		h.byShop[shopID] = map[*subscriber]struct{}{}
	}
	h.byShop[shopID][s] = struct{}{}

	existing := h.bySubject[subject]
	var evicted []*subscriber
	for len(existing) >= maxStreamsPerSubject {
		oldest := existing[0]
		existing = existing[1:]
		evicted = append(evicted, oldest)
		delete(h.byShop[oldest.shopID], oldest)
	}
	h.bySubject[subject] = append(existing, s)
	h.mu.Unlock()

	for _, e := range evicted {
		close(e.ch)
	}

	return s.ch, func() { h.release(s) }
}

func (h *Hub) release(s *subscriber) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.byShop[s.shopID]; ok {
		if _, live := set[s]; live {
			delete(set, s)
			close(s.ch)
		}
		if len(set) == 0 {
			delete(h.byShop, s.shopID)
		}
	}
	remaining := h.bySubject[s.subject][:0]
	for _, other := range h.bySubject[s.subject] {
		if other != s {
			remaining = append(remaining, other)
		}
	}
	if len(remaining) == 0 {
		delete(h.bySubject, s.subject)
	} else {
		h.bySubject[s.subject] = remaining
	}
}

// Poke wakes every console watching this shop, at most once per throttle window.
func (h *Hub) Poke(shopID string) {
	h.mu.Lock()
	last, seen := h.lastPokeAt[shopID]
	now := h.now()
	if seen && now.Sub(last) < pokeThrottle {
		// Already poked recently: schedule ONE trailing wake-up so the final state is still fetched.
		if h.pendingPoke[shopID] == nil {
			h.pendingPoke[shopID] = h.after(pokeThrottle-now.Sub(last), func() {
				h.mu.Lock()
				delete(h.pendingPoke, shopID)
				h.lastPokeAt[shopID] = h.now()
				subs := h.snapshot(shopID)
				h.mu.Unlock()
				deliver(subs, EventPoke)
			})
		}
		h.mu.Unlock()
		return
	}
	h.lastPokeAt[shopID] = now
	subs := h.snapshot(shopID)
	h.mu.Unlock()
	deliver(subs, EventPoke)
}

// Resync tells EVERY open stream to refetch — used when the listener has been away and cannot know
// what it missed (research R2: on reconnect we rebuild, we never assume continuity).
func (h *Hub) Resync() {
	h.mu.Lock()
	var all []*subscriber
	for _, set := range h.byShop {
		for s := range set {
			all = append(all, s)
		}
	}
	h.mu.Unlock()
	deliver(all, EventResync)
}

// Streams reports how many streams are open — the gauge, and nothing finer. No shop label: a metric
// with one series per shop is a cardinality bomb as the platform grows (Principle VII).
func (h *Hub) Streams() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, set := range h.byShop {
		n += len(set)
	}
	return n
}

// snapshot copies the current subscribers for a shop. Caller holds the lock.
func (h *Hub) snapshot(shopID string) []*subscriber {
	subs := make([]*subscriber, 0, len(h.byShop[shopID]))
	for s := range h.byShop[shopID] {
		subs = append(subs, s)
	}
	return subs
}

// deliver sends without blocking. A full buffer means the client is behind, and a client that is
// behind will refetch everything on its next read anyway — so dropping is not lossy in any way the
// reader can observe.
func deliver(subs []*subscriber, e Event) {
	for _, s := range subs {
		select {
		case s.ch <- e:
		default:
		}
	}
}
