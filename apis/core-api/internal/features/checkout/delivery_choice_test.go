package checkout

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// 069 — what the customer chose, and what happens when it cannot be honoured.
//
// ⚠ THE RULE THESE PIN IS A REVERSAL. Before 069, asking for same-day when it could not be done
// quietly priced the order as standard — "never refused". That fallback is now the defect: a customer
// who chose "today, 5–7 pm" must never discover they bought "Thursday" (FR-010). Each refusal below
// must reach the caller, and none may be turned into a different delivery.

var (
	both    = []delivery.Option{{Method: "standard", FeeCents: 600}, {Method: "same_day", FeeCents: 1100}}
	stdOpts = []delivery.Option{{Method: "standard", FeeCents: 700}}
)

func quoteWith(slots []delivery.OpenSlot, pkgs ...delivery.PackageQuote) delivery.QuoteResult {
	return delivery.QuoteResult{Serviced: true, Packages: pkgs, SameDaySlots: slots, StandardDays: testDays}
}

func choiceCode(t *testing.T, err error) string {
	t.Helper()
	var e *DeliveryChoiceError
	require.ErrorAs(t, err, &e)
	return e.Code
}

func TestChoice_SameDayRecordsTheSlotTheWindowAndTheDay(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, quoteWith([]delivery.OpenSlot{testSlot}, delivery.PackageQuote{ShopID: "s1", Options: both}))

	res, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID})
	require.NoError(t, err)

	p := store.capturedPkgs[0]
	require.Equal(t, "same_day", p.Method)
	require.Equal(t, testSlot.ID, p.SlotID)
	require.True(t, p.WindowStart.Equal(testSlot.Start) && p.WindowEnd.Equal(testSlot.End))
	require.Equal(t, "2026-10-07", p.PromisedDay, "a same-day package is promised the slot's day")
	require.Equal(t, int64(1100), p.FeeCents, "the fee is the method's — a slot has no price of its own (FR-021)")

	require.NotNil(t, store.capturedHold, "a place is held for the order")
	require.Equal(t, testSlot.ID, store.capturedHold.SlotID)
	require.NotNil(t, res.SlotHeldUntil)
}

func TestChoice_SameDayWithoutASlotIsRefused(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, quoteWith([]delivery.OpenSlot{testSlot}, delivery.PackageQuote{ShopID: "s1", Options: both}))

	_, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day"})

	require.Equal(t, ChoiceSlotRequired, choiceCode(t, err))
	require.False(t, store.captureCalled, "nothing is captured")
	require.Zero(t, gw.amount, "and no payment intent is created")
}

// ⚠ NP4. The slot the customer chose has closed. The order is REFUSED — it is not priced as standard.
func TestChoice_AClosedSlotIsRefusedAndNeverSubstituted(t *testing.T) {
	other := testSlot
	other.ID = "44444444-4444-4444-4444-444444444444"

	for name, q := range map[string]delivery.QuoteResult{
		"a different slot is open":                         quoteWith([]delivery.OpenSlot{other}, delivery.PackageQuote{ShopID: "s1", Options: both}),
		"no slot is open and so no same-day option exists": quoteWith(nil, delivery.PackageQuote{ShopID: "s1", Options: stdOpts}),
	} {
		t.Run(name, func(t *testing.T) {
			store, gw := storeWithMilk(), &fakeGateway{}
			svc := svcWithDelivery(store, gw, q)

			_, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID})

			require.Equal(t, ChoiceSlotUnavailable, choiceCode(t, err))
			require.False(t, store.captureCalled, "a refusal must not capture a standard delivery in its place")
			require.Zero(t, gw.amount, "the customer is not charged")
		})
	}
}

// The place went to someone else between the quote and the lock. Same refusal, found one step later.
func TestChoice_ASlotLostUnderTheLockIsRefusedBeforeAnyPaymentIntent(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.captureErr = &SlotUnavailableError{Verdict: delivery.SlotFull}
	svc := svcWithDelivery(store, gw, quoteWith([]delivery.OpenSlot{testSlot}, delivery.PackageQuote{ShopID: "s1", Options: both}))

	_, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID})

	require.Equal(t, ChoiceSlotUnavailable, choiceCode(t, err))
	require.Zero(t, gw.amount, "the hold is taken BEFORE the payment intent — a lost place costs nothing")
}

func TestChoice_AnyOtherCaptureFailureIsNotDressedUpAsARefusal(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.captureErr = errors.New("connection reset")
	svc := svcWithDelivery(store, gw, stdOnly("s1", 600))

	_, err := intent(svc, IntentInput{AddressID: addrID})

	var choice *DeliveryChoiceError
	require.False(t, errors.As(err, &choice))
	require.Error(t, err)
}

func TestChoice_StandardDefaultsToTheEarliestDay(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, stdOnly("s1", 600))

	res, err := intent(svc, IntentInput{AddressID: addrID})
	require.NoError(t, err)

	require.Equal(t, testDays[0], store.capturedPkgs[0].PromisedDay, "absent means the day the UI preselects (FR-015)")
	require.Empty(t, store.capturedPkgs[0].SlotID)
	require.Nil(t, store.capturedHold, "a standard order holds no place")
	require.Nil(t, res.SlotHeldUntil)
}

func TestChoice_StandardRecordsTheChosenDay(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, stdOnly("s1", 600))

	_, err := intent(svc, IntentInput{AddressID: addrID, StandardDate: testDays[2]})
	require.NoError(t, err)
	require.Equal(t, testDays[2], store.capturedPkgs[0].PromisedDay)
	require.Equal(t, int64(600), store.capturedPkgs[0].FeeCents, "the fee does not vary by day (FR-021)")
}

func TestChoice_ADayThatIsNotOfferedIsRefused(t *testing.T) {
	for _, day := range []string{"2026-10-07", "2026-12-25", "yesterday", "2026-10-08T00:00:00Z"} {
		t.Run(day, func(t *testing.T) {
			store, gw := storeWithMilk(), &fakeGateway{}
			svc := svcWithDelivery(store, gw, stdOnly("s1", 600))

			_, err := intent(svc, IntentInput{AddressID: addrID, StandardDate: day})

			require.Equal(t, ChoiceDateUnavailable, choiceCode(t, err))
			require.False(t, store.captureCalled)
			require.Zero(t, gw.amount)
		})
	}
}

// SC-010 — one shop is excepted from same-day. The customer chooses ONE slot and ONE day; each package
// keeps its own method. This is the one fallback to standard that remains, and it is not a
// substitution: the quote never offered that package same-day, and the customer was shown so.
func TestChoice_AMixedBasketTakesOneSlotAndOneDay(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, quoteWith([]delivery.OpenSlot{testSlot},
		delivery.PackageQuote{ShopID: "s1", Options: both},
		delivery.PackageQuote{ShopID: "s2", Options: stdOpts}))

	_, err := intent(svc, IntentInput{
		AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID, StandardDate: testDays[1],
	})
	require.NoError(t, err)

	require.Len(t, store.capturedPkgs, 2)
	sameDay, standard := store.capturedPkgs[0], store.capturedPkgs[1]
	require.Equal(t, "same_day", sameDay.Method)
	require.Equal(t, testSlot.ID, sameDay.SlotID)
	require.Equal(t, "2026-10-07", sameDay.PromisedDay)
	require.Equal(t, "standard", standard.Method)
	require.Empty(t, standard.SlotID)
	require.Nil(t, standard.WindowStart)
	require.Equal(t, testDays[1], standard.PromisedDay)
	require.Equal(t, int64(1800), store.amounts.DeliveryFeeCents)
}

func TestChoice_AMixedBasketWithAStaleDayIsRefusedWhole(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, quoteWith([]delivery.OpenSlot{testSlot},
		delivery.PackageQuote{ShopID: "s1", Options: both},
		delivery.PackageQuote{ShopID: "s2", Options: stdOpts}))

	_, err := intent(svc, IntentInput{
		AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID, StandardDate: "2020-01-01",
	})

	require.Equal(t, ChoiceDateUnavailable, choiceCode(t, err))
	require.False(t, store.captureCalled, "half an order is not placed")
}

// A slot sent with a STANDARD order is ignored, not held: the customer chose standard.
func TestChoice_ASlotSentWithAStandardOrderHoldsNothing(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWithDelivery(store, gw, quoteWith([]delivery.OpenSlot{testSlot}, delivery.PackageQuote{ShopID: "s1", Options: both}))

	_, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "standard", SameDaySlotID: testSlot.ID})
	require.NoError(t, err)
	require.Equal(t, "standard", store.capturedPkgs[0].Method)
	require.Nil(t, store.capturedHold)
}

// The pure function, where `now` matters: it is the instant the hold is judged at.
func TestResolveDeliveryChoice_TheHoldCarriesTheRequestInstant(t *testing.T) {
	now := time.Date(2026, 10, 7, 9, 0, 0, 0, delivery.MelbourneTZ)
	q := quoteWith([]delivery.OpenSlot{testSlot}, delivery.PackageQuote{ShopID: "s1", Options: both})

	_, hold, cerr := resolveDeliveryChoice(q, delivery.MethodSameDay, testSlot.ID, "", now)

	require.Nil(t, cerr)
	require.True(t, hold.Now.Equal(now))
}

// The refusals are counted, and never as something they are not.
type countingDeliveryMetrics struct {
	slots       map[string]int
	dateRefused int
}

func (m *countingDeliveryMetrics) DeliveryQuoted(string) {}
func (m *countingDeliveryMetrics) DeliveryQuoteFailed()  {}
func (m *countingDeliveryMetrics) SlotBooking(o string)  { m.slots[o]++ }
func (m *countingDeliveryMetrics) StandardDateRefused()  { m.dateRefused++ }

func TestChoice_OutcomesAreMetered(t *testing.T) {
	q := quoteWith([]delivery.OpenSlot{testSlot}, delivery.PackageQuote{ShopID: "s1", Options: both})

	m := &countingDeliveryMetrics{slots: map[string]int{}}
	store := storeWithMilk()
	svc := svcWithDelivery(store, &fakeGateway{}, q).WithDeliveryMetrics(m)
	_, err := intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID})
	require.NoError(t, err)
	require.Equal(t, 1, m.slots["held"])

	store.captureErr = &SlotUnavailableError{Verdict: delivery.SlotFull}
	_, _ = intent(svc, IntentInput{AddressID: addrID, DeliveryMethod: "same_day", SameDaySlotID: testSlot.ID})
	require.Equal(t, 1, m.slots["refused_full"])

	store.captureErr = nil
	_, _ = intent(svc, IntentInput{AddressID: addrID, StandardDate: "2020-01-01"})
	require.Equal(t, 1, m.dateRefused)

	svc.meterStock(FinalizeOutcome{Applied: true, SlotConfirmed: true, SlotOverCapacity: true})
	require.Equal(t, 1, m.slots["confirmed"])
	require.Equal(t, 1, m.slots["over_capacity"], "the series the alert watches")
}
