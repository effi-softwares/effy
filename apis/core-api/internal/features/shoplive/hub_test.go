package shoplive

import (
	"testing"
	"time"
)

// A clock the tests drive by hand: throttling is a time-based rule, and a test that sleeps through
// real durations is a test that is slow AND flaky.
type fakeClock struct {
	now    time.Time
	timers []func()
}

func (c *fakeClock) After(d time.Duration, f func()) *time.Timer {
	c.timers = append(c.timers, f)
	return time.NewTimer(time.Hour) // never fires on its own; the test fires it
}

func (c *fakeClock) fire() {
	for _, f := range c.timers {
		f()
	}
	c.timers = nil
}

func newTestHub(c *fakeClock) *Hub {
	h := NewHub()
	h.now = func() time.Time { return c.now }
	h.after = c.After
	return h
}

func drain(ch <-chan Event) []Event {
	var out []Event
	for {
		select {
		case e, ok := <-ch:
			if !ok {
				return out
			}
			out = append(out, e)
		default:
			return out
		}
	}
}

func TestPokeReachesOnlyTheShopItNames(t *testing.T) {
	c := &fakeClock{now: time.Now()}
	h := newTestHub(c)

	mine, release := h.Subscribe("shop-1", "sub-a")
	defer release()
	theirs, release2 := h.Subscribe("shop-2", "sub-b")
	defer release2()

	h.Poke("shop-1")

	if got := drain(mine); len(got) != 1 || got[0] != EventPoke {
		t.Fatalf("the shop that changed got %v, want one poke", got)
	}
	// ⚠ The whole isolation property in one assertion: a shop must never learn that another shop is
	// busy, and the stream is the only place on this service where two shops share a process.
	if got := drain(theirs); len(got) != 0 {
		t.Fatalf("another shop's console got %v, want nothing", got)
	}
}

func TestBurstCollapsesToOneWakeUpPlusATrailingOne(t *testing.T) {
	c := &fakeClock{now: time.Now()}
	h := newTestHub(c)
	ch, release := h.Subscribe("shop-1", "sub-a")
	defer release()

	// A driver checking in a van-load: twenty separate transactions in well under a second.
	for i := 0; i < 20; i++ {
		h.Poke("shop-1")
	}

	if got := drain(ch); len(got) != 1 {
		t.Fatalf("got %d immediate pokes, want 1 — a burst must not become 20 refetches", len(got))
	}

	// ⚠ TRAILING EDGE: the last change must still be fetched, or the console settles on a state one
	// event behind reality — which is worse than being slow, because it looks settled.
	c.now = c.now.Add(pokeThrottle)
	c.fire()
	if got := drain(ch); len(got) != 1 || got[0] != EventPoke {
		t.Fatalf("got %v after the throttle window, want the trailing poke", got)
	}
}

func TestResyncReachesEveryStream(t *testing.T) {
	c := &fakeClock{now: time.Now()}
	h := newTestHub(c)
	a, ra := h.Subscribe("shop-1", "sub-a")
	defer ra()
	b, rb := h.Subscribe("shop-2", "sub-b")
	defer rb()

	// The listener came back after being away: nobody can know what they missed.
	h.Resync()

	for name, ch := range map[string]<-chan Event{"shop-1": a, "shop-2": b} {
		if got := drain(ch); len(got) != 1 || got[0] != EventResync {
			t.Fatalf("%s got %v, want one resync", name, got)
		}
	}
}

func TestASlowSubscriberNeverBlocksTheOthers(t *testing.T) {
	c := &fakeClock{now: time.Now()}
	h := newTestHub(c)

	stalled, r1 := h.Subscribe("shop-1", "sub-stalled") // never read from
	defer r1()
	healthy, r2 := h.Subscribe("shop-1", "sub-healthy")
	defer r2()

	// Far more than the buffer holds. A laptop asleep mid-frame must not stall the notification
	// loop for every other console in the region.
	for i := 0; i < 200; i++ {
		c.now = c.now.Add(pokeThrottle)
		h.Poke("shop-1")
	}

	if got := drain(healthy); len(got) == 0 {
		t.Fatal("the healthy subscriber received nothing — a stalled peer blocked delivery")
	}
	_ = stalled
}

func TestOneSubjectCannotHoldUnboundedStreams(t *testing.T) {
	c := &fakeClock{now: time.Now()}
	h := newTestHub(c)

	var channels []<-chan Event
	for i := 0; i < maxStreamsPerSubject; i++ {
		ch, _ := h.Subscribe("shop-1", "sub-a")
		channels = append(channels, ch)
	}
	if h.Streams() != maxStreamsPerSubject {
		t.Fatalf("Streams() = %d, want %d", h.Streams(), maxStreamsPerSubject)
	}

	// The sixth closes the oldest — the newest is the tab the person is actually looking at.
	_, release := h.Subscribe("shop-1", "sub-a")
	defer release()

	if _, open := <-channels[0]; open {
		t.Fatal("the oldest stream was not closed when the cap was exceeded")
	}
	if h.Streams() != maxStreamsPerSubject {
		t.Fatalf("Streams() = %d after eviction, want %d", h.Streams(), maxStreamsPerSubject)
	}
}

func TestReleaseRemovesTheSubscriber(t *testing.T) {
	c := &fakeClock{now: time.Now()}
	h := newTestHub(c)
	_, release := h.Subscribe("shop-1", "sub-a")

	release()
	if h.Streams() != 0 {
		t.Fatalf("Streams() = %d after release, want 0", h.Streams())
	}
	// Idempotent: the handler's `defer release()` can run after an eviction already closed it.
	release()
}
