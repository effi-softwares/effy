package checkout

import (
	"testing"
)

// ⚠ THE WIRE CONTRACT for the 051 payment shapes. This pins the exact JSON the hot path emits so a
// field rename or a type drift fails HERE, not in a shopper's payment. The customer-mobile
// PaymentWireContractTest.kt parses the SAME literals, BYTE-IDENTICAL — the two halves are kept in sync
// by hand, which is the 028 pattern and the reason a silent `json:"..."` rename cannot survive.
//
// ⚠ THE INVARIANT THIS EXISTS FOR: `expMonth` and `expYear` are JSON NUMBERS WITHOUT A DECIMAL POINT.
// 027 R13 lost days to Kotlin serialising an integer as `1.0` where Go's encoding/json refuses it into
// an int — three stacked defects, found only by querying the database directly. The TS side declares
// them `WireInt` (@asType integer) so the generated Kotlin is a Long rather than a Double; this is the
// Go end of the same guarantee.

const paymentMethodWire = `{"id":"pm_123","brand":"visa","last4":"4242","expMonth":4,"expYear":2028,"isDefault":true,"usable":true}`

const paymentMethodUnusableWire = `{"id":"pm_456","brand":"mastercard","last4":"8210","expMonth":7,"expYear":2026,"isDefault":false,"usable":false,"unusableReason":"This card has expired."}`

const billingDetailsWire = `{"name":"Jane Smith","email":"jane@example.com","address":{"line1":"1 Test St","line2":"","city":"Richmond","state":"VIC","postalCode":"3121","country":"AU"}}`

func TestWireContract_PaymentMethod(t *testing.T) {
	got := mustJSON(t, paymentMethodBody{
		ID: "pm_123", Brand: "visa", Last4: "4242",
		ExpMonth: 4, ExpYear: 2028, IsDefault: true, Usable: true,
	})
	if got != paymentMethodWire {
		t.Errorf("payment method wire drift:\n got  %s\n want %s", got, paymentMethodWire)
	}
}

// ⚠ A usable card omits `unusableReason` entirely (omitempty); an unusable one MUST carry it. A card
// shown as unusable with no reason is a refusal the shopper cannot act on, which FR-023 forbids.
func TestWireContract_PaymentMethodUnusableCarriesItsReason(t *testing.T) {
	got := mustJSON(t, paymentMethodBody{
		ID: "pm_456", Brand: "mastercard", Last4: "8210",
		ExpMonth: 7, ExpYear: 2026, IsDefault: false,
		Usable: false, UnusableReason: "This card has expired.",
	})
	if got != paymentMethodUnusableWire {
		t.Errorf("unusable payment method wire drift:\n got  %s\n want %s", got, paymentMethodUnusableWire)
	}
}

func TestWireContract_BillingDetails(t *testing.T) {
	got := mustJSON(t, billingDetailsBody{
		Name:  "Jane Smith",
		Email: "jane@example.com",
		Address: billingAddressBody{
			Line1: "1 Test St", City: "Richmond", State: "VIC",
			PostalCode: "3121", Country: "AU",
		},
	})
	if got != billingDetailsWire {
		t.Errorf("billing details wire drift:\n got  %s\n want %s", got, billingDetailsWire)
	}
}

// ⚠ THE 027 R13 GUARD, asserted directly rather than left implicit in the shape above.
//
// A card expiry is a count, not a measurement. If either field ever serialises with a decimal point,
// the Kotlin client and the Go server have disagreed about what an integer is — and that disagreement
// is invisible until a real device hits a real endpoint.
func TestWireContract_ExpiryIsAnIntegerNotAFloat(t *testing.T) {
	got := mustJSON(t, paymentMethodBody{
		ID: "pm_1", Brand: "visa", Last4: "0000", ExpMonth: 1, ExpYear: 2030, Usable: true,
	})
	want := `{"id":"pm_1","brand":"visa","last4":"0000","expMonth":1,"expYear":2030,"isDefault":false,"usable":true}`
	if got != want {
		t.Errorf("expiry wire drift (a decimal point here is the 027 R13 defect):\n got  %s\n want %s", got, want)
	}
}

// ⚠ THE FIELD THAT MUST NEVER APPEAR. The provider customer reference identifies a provider record and
// no surface has any use for it (data-model § 1). Asserting the WHOLE serialised object rather than
// checking for a substring is what makes this catch a future field added by someone who did not read
// the rule.
func TestWireContract_IntentResponseCarriesNoProviderCustomerID(t *testing.T) {
	got := mustJSON(t, createIntentResponse{
		OrderID: "o1", OrderNumber: "EFY-1", ClientSecret: "cs_1",
		PublishableKey: "pk_test", GrandTotalAmount: "14.60", Currency: "AUD",
	})
	want := `{"orderId":"o1","orderNumber":"EFY-1","clientSecret":"cs_1","publishableKey":"pk_test","grandTotalAmount":"14.60","currency":"AUD"}`
	if got != want {
		t.Errorf("intent response wire drift:\n got  %s\n want %s\n(a new field here needs a reason; stripe_customer_id never does)", got, want)
	}
}
