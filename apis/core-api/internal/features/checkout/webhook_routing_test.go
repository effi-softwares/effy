package checkout

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

// How a refund event reaches the refunds service (055 US4).
//
// ⚠ THIS TESTS A DEFECT I SHIPPED AND CAUGHT BY READING THE CODE BACK, NOT BY A FAILING TEST.
// `HandleWebhook` opened with `if evt.PaymentIntentID == "" { return nil }` — which is EVERY
// `refund.*` event, because a refund event names a refund, not an intent. So refund events were
// discarded before they were deduped and before anything was dispatched. Every test in this package
// passed, and every test in the refunds package passed, because both sides were correct in isolation:
// `HandleRefundEvent` worked perfectly and was never called.
//
// The consequence would have been silent and slow — a bank rejecting a refund thirty days later
// reaching a platform that had already stopped listening, so the order would go on saying the money
// was returned forever. Exactly the failure US4 exists to prevent, reintroduced in the wiring.

type recordingRefunds struct {
	events []WebhookEvent
	err    error
}

func (r *recordingRefunds) HandleRefundEvent(_ context.Context, evt WebhookEvent) error {
	r.events = append(r.events, evt)
	return r.err
}

func webhookService(t *testing.T, evt WebhookEvent) (*Service, *fakeStore, *recordingRefunds) {
	t.Helper()
	store := newFakeStore()
	gw := &fakeGateway{webhookEvent: evt}
	rf := &recordingRefunds{}
	return NewService(store, gw, "pk_test").WithRefundEvents(rf), store, rf
}

func TestWebhook_ARefundEventReachesTheRefundsService(t *testing.T) {
	svc, _, rf := webhookService(t, WebhookEvent{
		ID: "evt_1", Type: "refund.failed", RefundID: "re_1", RefundStatus: RefundFailed,
		FailureReason: "expired_or_canceled_card",
	})

	require.NoError(t, svc.HandleWebhook(context.Background(), nil, ""))
	require.Len(t, rf.events, 1, "⚠ a refund event carries no PaymentIntentID — it must not be discarded for that")
	require.Equal(t, "re_1", rf.events[0].RefundID)
	require.Equal(t, "expired_or_canceled_card", rf.events[0].FailureReason)
}

// ⚠ FR-010's idempotency comes from `stripe_event`, which is why the refund path rides THIS endpoint
// rather than getting its own. The dedup must happen BEFORE the dispatch, or a redelivered
// `refund.failed` is applied twice.
func TestWebhook_ARefundEventIsDedupedBeforeItIsDispatched(t *testing.T) {
	svc, store, rf := webhookService(t, WebhookEvent{
		ID: "evt_dup", Type: "refund.updated", RefundID: "re_1", RefundStatus: RefundSucceeded,
	})

	require.NoError(t, svc.HandleWebhook(context.Background(), nil, ""))
	require.Equal(t, []string{"evt_dup:refund.updated"}, store.seenEvents,
		"the event must be recorded as seen — that record is the whole of the redelivery defence")

	store.eventAlreadySeen = true
	require.NoError(t, svc.HandleWebhook(context.Background(), nil, ""))
	require.Len(t, rf.events, 1, "a redelivery must never reach the handler a second time")
}

// ⚠ Unwired, refund events are IGNORED rather than crashing. The nil-able collaborator matches every
// other optional dependency on this service, and the pre-055 behaviour is exactly "no refund events".
func TestWebhook_WithoutARefundsServiceARefundEventIsIgnored(t *testing.T) {
	store := newFakeStore()
	gw := &fakeGateway{webhookEvent: WebhookEvent{ID: "evt_2", Type: "refund.updated", RefundID: "re_2"}}
	svc := NewService(store, gw, "pk_test")

	require.NoError(t, svc.HandleWebhook(context.Background(), nil, ""))
}

// ⚠ A refund handler error must REACH THE CALLER, so the endpoint answers non-2xx and the provider
// retries. Swallowing it would turn a transient database failure into a permanently lost settlement —
// the provider would consider the event delivered and never send it again.
func TestWebhook_ARefundHandlerFailureIsReportedSoTheProviderRetries(t *testing.T) {
	svc, _, rf := webhookService(t, WebhookEvent{
		ID: "evt_3", Type: "refund.failed", RefundID: "re_3", RefundStatus: RefundFailed,
	})
	rf.err = errors.New("database unavailable")

	require.Error(t, svc.HandleWebhook(context.Background(), nil, ""))
}

// The payment path is untouched — a payment_intent event still never reaches the refunds service.
func TestWebhook_APaymentEventDoesNotReachTheRefundsService(t *testing.T) {
	svc, _, rf := webhookService(t, WebhookEvent{
		ID: "evt_4", Type: "payment_intent.succeeded",
		PaymentIntentID: "pi_1", IntentStatus: IntentSucceeded,
	})

	require.NoError(t, svc.HandleWebhook(context.Background(), nil, ""))
	require.Empty(t, rf.events)
}

// An event that is neither is still ignored, and is NOT recorded as seen — `stripe_event` is for
// events this platform acts on, not a log of everything the provider sends.
func TestWebhook_AnUnrelatedEventIsIgnoredEntirely(t *testing.T) {
	svc, store, rf := webhookService(t, WebhookEvent{ID: "evt_5", Type: "customer.created"})

	require.NoError(t, svc.HandleWebhook(context.Background(), nil, ""))
	require.Empty(t, rf.events)
	require.Empty(t, store.seenEvents)
}
