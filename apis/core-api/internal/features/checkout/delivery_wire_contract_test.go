package checkout

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
)

// ⚠ THE WIRE CONTRACT for the customer-facing delivery shapes (047, research R14). This pins the exact
// JSON the hot path emits so a field rename or a money-type drift fails HERE, not in a shopper's
// checkout. The customer-mobile DeliveryWireContractTest.kt parses the SAME literals (byte-identical),
// the way BannerWireContractTest did (028) — the two halves are kept in sync by hand.
//
// ⚠ The single most important invariant this guards: `feeAmount` is a STRING ("6.00"), never a number.
// 027 R13 lost days to a Kotlin client serialising money as a float where Go wanted exactness; delivery
// money crosses as a 2-dp decimal string on purpose, and this test would fail the moment that regresses.

// One serviced quote with a standard + same-day option — the full shape the client parses.
const deliveryQuoteWire = `{"postcode":"3121","serviced":true,"sameDayAvailableUntil":"2026-08-24T13:00:00+10:00","packages":[{"shopRef":"pkg-1","options":[{"method":"standard","feeAmount":"6.00","promisedFrom":null,"promisedTo":null},{"method":"same_day","feeAmount":"11.00","promisedFrom":"2026-08-24","promisedTo":"2026-08-24"}]}],"expiresAt":"2026-08-24T12:20:00+10:00","sameDaySlots":[{"slotId":"33333333-3333-3333-3333-333333333333","date":"2026-08-24","startAt":"2026-08-24T17:00:00+10:00","endAt":"2026-08-24T19:00:00+10:00","cutoffAt":"2026-08-24T13:00:00+10:00"}],"sameDayUnavailableReason":null,"standardDays":[{"date":"2026-08-25"},{"date":"2026-08-26"}]}`

// 069 — a quote with no same-day on offer. ⚠ The two arrays are `[]`, never `null`: Kotlin's generated
// DTO declares them non-null lists, and `null` there is a decode failure on the checkout screen.
const deliveryQuoteNoSameDayWire = `{"postcode":"3121","serviced":true,"sameDayAvailableUntil":null,"packages":[],"expiresAt":"2026-08-24T12:20:00+10:00","sameDaySlots":[],"sameDayUnavailableReason":"slots_closed","standardDays":[{"date":"2026-08-25"}]}`

// 069 — the refusal a client receives when its slot has gone. An RFC 9457 problem plus `code`.
const deliveryChoiceRefusalWire = `{"type":"https://effyshopping.com/problems/conflict","title":"Conflict","status":409,"detail":"that delivery time is no longer available — choose another","instance":"/v1/checkout/intent","request_id":"req-1","code":"slot_unavailable"}`

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

func TestWireContract_DeliveryQuote(t *testing.T) {
	until := "2026-08-24T13:00:00+10:00"
	from := "2026-08-24"
	dto := deliveryQuoteDTO{
		Postcode:              "3121",
		Serviced:              true,
		SameDayAvailableUntil: &until,
		Packages: []quotePackageDTO{{
			ShopRef: "pkg-1",
			Options: []quoteOptionDTO{
				{Method: "standard", FeeAmount: "6.00"},
				{Method: "same_day", FeeAmount: "11.00", PromisedFrom: &from, PromisedTo: &from},
			},
		}},
		ExpiresAt: "2026-08-24T12:20:00+10:00",
		SameDaySlots: []slotOptionDTO{{
			SlotID: "33333333-3333-3333-3333-333333333333", Date: "2026-08-24",
			StartAt: "2026-08-24T17:00:00+10:00", EndAt: "2026-08-24T19:00:00+10:00",
			CutoffAt: "2026-08-24T13:00:00+10:00",
		}},
		StandardDays: []standardDayDTO{{Date: "2026-08-25"}, {Date: "2026-08-26"}},
	}
	got := mustJSON(t, dto)
	if got != deliveryQuoteWire {
		t.Errorf("delivery quote wire drift:\n got  %s\n want %s", got, deliveryQuoteWire)
	}
}

// 069 — the shape the REAL mapper emits, not a hand-built struct: an order with no open slot.
func TestWireContract_DeliveryQuoteWithNoSameDay(t *testing.T) {
	expires, _ := time.Parse(time.RFC3339, "2026-08-24T12:20:00+10:00")
	dto := toQuoteDTO(DeliveryQuote{
		Postcode: "3121", Serviced: true, ExpiresAt: expires.In(delivery.MelbourneTZ),
		SameDayUnavailable: delivery.SameDaySlotsClosed,
		StandardDays:       []string{"2026-08-25"},
	})
	if got := mustJSON(t, dto); got != deliveryQuoteNoSameDayWire {
		t.Errorf("no-same-day quote wire drift:\n got  %s\n want %s", got, deliveryQuoteNoSameDayWire)
	}
}

// 069 — the mapper renders every slot instant with the Melbourne offset, even when handed UTC.
func TestWireContract_SlotInstantsCarryTheMelbourneOffset(t *testing.T) {
	utc := func(h int) time.Time { return time.Date(2026, 8, 24, h, 0, 0, 0, time.UTC) }
	dto := toQuoteDTO(DeliveryQuote{
		Postcode: "3121", Serviced: true, ExpiresAt: utc(2),
		SameDaySlots: []delivery.OpenSlot{{ID: "s", Date: "2026-08-24", Start: utc(7), End: utc(9), Cutoff: utc(3)}},
		StandardDays: []string{"2026-08-25"},
	})
	s := dto.SameDaySlots[0]
	if s.StartAt != "2026-08-24T17:00:00+10:00" || s.EndAt != "2026-08-24T19:00:00+10:00" || s.CutoffAt != "2026-08-24T13:00:00+10:00" {
		t.Errorf("slot instants = %s / %s / %s, want the +10:00 wall clock", s.StartAt, s.EndAt, s.CutoffAt)
	}
}

func TestWireContract_DeliveryChoiceRefusal(t *testing.T) {
	body := deliveryChoiceRefusal{
		Problem: httpx.Problem{
			Type: httpx.TypeConflict, Title: "Conflict", Status: 409,
			Detail:   "that delivery time is no longer available — choose another",
			Instance: "/v1/checkout/intent", RequestID: "req-1",
		},
		Code: ChoiceSlotUnavailable,
	}
	if got := mustJSON(t, body); got != deliveryChoiceRefusalWire {
		t.Errorf("refusal wire drift:\n got  %s\n want %s", got, deliveryChoiceRefusalWire)
	}
}

// ⚠ Guards the money-type invariant explicitly: feeAmount must serialise as a quoted string.
func TestWireContract_FeeIsAString(t *testing.T) {
	got := mustJSON(t, quoteOptionDTO{Method: "standard", FeeAmount: "6.00"})
	if want := `{"method":"standard","feeAmount":"6.00","promisedFrom":null,"promisedTo":null}`; got != want {
		t.Errorf("option wire drift:\n got  %s\n want %s", got, want)
	}
}

// 069 — an address we do not deliver to. ⚠ Even here the two arrays are present and empty: the mobile
// DTO declares them non-null, and a quote that omitted them would fail to decode rather than say
// "we don't deliver there yet". Byte-identical to the literal in the Kotlin DeliveryWireContractTest.
const deliveryQuoteUnservicedWire = `{"postcode":"3999","serviced":false,"sameDayAvailableUntil":null,"packages":[],"expiresAt":"","sameDaySlots":[],"sameDayUnavailableReason":null,"standardDays":[]}`

func TestWireContract_UnservicedDeliveryQuote(t *testing.T) {
	got := mustJSON(t, toQuoteDTO(DeliveryQuote{Postcode: "3999", Serviced: false}))
	if got != deliveryQuoteUnservicedWire {
		t.Errorf("unserviced quote wire drift:\n got  %s\n want %s", got, deliveryQuoteUnservicedWire)
	}
}
