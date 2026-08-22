package checkout

import (
	"encoding/json"
	"testing"
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
const deliveryQuoteWire = `{"postcode":"3121","serviced":true,"sameDayAvailableUntil":"2026-08-24T13:00:00+10:00","packages":[{"shopRef":"pkg-1","options":[{"method":"standard","feeAmount":"6.00","promisedFrom":null,"promisedTo":null},{"method":"same_day","feeAmount":"11.00","promisedFrom":"2026-08-24","promisedTo":"2026-08-24"}]}],"expiresAt":"2026-08-24T12:20:00+10:00"}`

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
	}
	got := mustJSON(t, dto)
	if got != deliveryQuoteWire {
		t.Errorf("delivery quote wire drift:\n got  %s\n want %s", got, deliveryQuoteWire)
	}
}

// ⚠ Guards the money-type invariant explicitly: feeAmount must serialise as a quoted string.
func TestWireContract_FeeIsAString(t *testing.T) {
	got := mustJSON(t, quoteOptionDTO{Method: "standard", FeeAmount: "6.00"})
	if want := `{"method":"standard","feeAmount":"6.00","promisedFrom":null,"promisedTo":null}`; got != want {
		t.Errorf("option wire drift:\n got  %s\n want %s", got, want)
	}
}
