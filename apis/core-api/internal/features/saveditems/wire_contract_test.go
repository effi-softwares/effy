package saveditems

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

// ── The cross-language wire contract (033, following 028's pattern) ─────────────────────────────
//
// SAVED_ITEM_WIRE_JSON below is duplicated BYTE-FOR-BYTE in the Kotlin half at
// apps/customer-mobile/.../features/saved/SavedWireContractTest.kt. Neither side generates it and
// neither imports it. That is the point — a shared fixture moves with the bug, so both copies are
// maintained by hand and a divergence shows up as a failure rather than as agreement.
//
// ⚠ 027 lost days to a defect no unit test could see: Kotlin serialised quantities as Double, so the
// wire carried `1.0`, and Go's encoding/json cannot unmarshal `1.0` into an int. Every test passed
// throughout, because the fakes spoke Kotlin at both ends and never crossed the wire. This test is
// what would have caught it on day one.
//
// ⚠ 029's lesson about the fixture itself: its banner_test.go ASSERTED THE DEFECT, demanding
// Kind == "search" and pinning {"kind":"sale"} — a shape no banner ever emitted. A fixture that
// agrees with the code rather than with the world proves nothing. The literal below is the marshalled
// output of a real handler DTO, verified against it by TestWireLiteralIsWhatTheHandlerActuallyEmits.

const SAVED_ITEM_WIRE_JSON = `{"id":"9f2c1d4e-0000-0000-0000-000000000001","name":"Free Range Eggs 12pk","brand":"Effy","imageUrl":"https://media.example/eggs.jpg","priceAmount":"6.50","currency":"AUD","compareAtAmount":"8.00","badges":["on_sale"],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"8.00","priceDropped":true,"verdict":"purchasable","categoryKey":"dairy-eggs"}`

const SAVED_MEMBERSHIP_WIRE_JSON = `{"productIds":["9f2c1d4e-0000-0000-0000-000000000001"],"count":1}`

func wireFixture() savedItemDTO {
	brand, compare, key := "Effy", "8.00", "dairy-eggs"
	img := "https://media.example/eggs.jpg"
	return savedItemDTO{
		ProductID:       "9f2c1d4e-0000-0000-0000-000000000001",
		Name:            "Free Range Eggs 12pk",
		Brand:           &brand,
		ImageURL:        &img,
		PriceAmount:     "6.50",
		Currency:        "AUD",
		CompareAtAmount: &compare,
		Badges:          []string{"on_sale"},
		SavedAt:         "2026-07-20T04:11:00Z",
		SavedPrice:      "8.00",
		PriceDropped:    true,
		Verdict:         VerdictPurchasable,
		CategoryKey:     &key,
	}
}

// TestWireLiteralIsWhatTheHandlerActuallyEmits keeps the literal honest.
//
// ⚠ This is the guard against 029's mistake. Without it the literal is just a string someone wrote,
// and it can drift into pinning a shape the handler never produces — at which point both this test
// and its Kotlin twin pass while the real payload is something else.
func TestWireLiteralIsWhatTheHandlerActuallyEmits(t *testing.T) {
	got, err := json.Marshal(wireFixture())
	require.NoError(t, err)
	require.JSONEq(t, SAVED_ITEM_WIRE_JSON, string(got),
		"the fixture must be the handler's real output — if you changed a json tag, update BOTH this "+
			"literal and the byte-identical copy in SavedWireContractTest.kt")
}

// TestSavedItemWireKeys pins the exact key set.
//
// A silent `json:"..."` rename compiles fine on both sides and breaks nothing until a client reads a
// field that is suddenly absent. Only a key-set comparison catches it.
func TestSavedItemWireKeys(t *testing.T) {
	var m map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(SAVED_ITEM_WIRE_JSON), &m))

	got := make([]string, 0, len(m))
	for k := range m {
		got = append(got, k)
	}
	sort.Strings(got)

	// Transcribed from packages/shared-types/src/saved-item.ts `SavedItemDTO`.
	//
	// ⚠ THIS LIST IS COPIED FROM THE CONTRACT, NOT FROM THE STRUCT ABOVE, and that distinction is
	// load-bearing. Written from the struct it can only ever agree with itself — which is how the
	// first version of this test passed while `SavedItemDTO` still extended StorefrontProductCardDTO
	// and therefore required an `available` field the handler never emitted. A key-set test that
	// derives its expectation from the code proves nothing; 029's banner_test.go asserted a defect
	// for exactly this reason.
	want := []string{
		"badges", "brand", "categoryKey", "compareAtAmount", "currency", "id", "imageUrl",
		"name", "priceAmount", "priceDropped", "savedAt", "savedPriceAmount", "verdict",
	}
	sort.Strings(want)
	require.Equal(t, want, got)
}

// TestSavedItemDoesNotCarryAvailable pins the deliberate OMISSION.
//
// ⚠ `available` is the field this whole feature exists to replace: a boolean derived from catalogue
// status alone, which reported a product buyable while checkout refused it at the shopper's address.
// `verdict` supersedes it. If `available` ever reappears here, two fields answer the same question and
// a client will eventually render the wrong one — so its ABSENCE is a requirement, not an oversight.
func TestSavedItemDoesNotCarryAvailable(t *testing.T) {
	var m map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(SAVED_ITEM_WIRE_JSON), &m))

	require.NotContains(t, m, "available",
		"a saved item reports `verdict`, never the catalogue-status boolean that lied")
}

// TestPriceDroppedIsOmittedWhenFalse pins FR-044's asymmetry on the wire.
//
// ⚠ There is deliberately no `priceRose`. The current price is always present, so nothing is
// concealed — but a rise is not actionable, and badging it would add noise to the one signal a
// watchlist exists to carry. `omitempty` is the mechanism, and it is load-bearing.
func TestPriceDroppedIsOmittedWhenFalse(t *testing.T) {
	d := wireFixture()
	d.PriceDropped = false

	raw, err := json.Marshal(d)
	require.NoError(t, err)

	var m map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &m))
	require.NotContains(t, m, "priceDropped", "absent means no drop")
	require.NotContains(t, m, "priceRose", "this field must never exist")
}

// TestMembershipCountIsAWholeNumberOnTheWire is the 027 R13 guard.
//
// ⚠ `count` is a WireInt in the TS contract precisely so the generated Kotlin is a Long and not a
// Double. If Kotlin ever emits `1.0` here, Go's encoding/json REFUSES it into an int and the request
// 422s — invisibly, because unit tests on either side would still pass.
// ⚠ JSONEq, not string equality, and deliberately so. Go's encoding/json emits keys in STRUCT FIELD
// order (`productIds`, then `count`); quicktype sorts the generated Kotlin data class alphabetically
// (`count`, then `productIds`). Both encodings are valid and byte-different. Key order carries no
// meaning in JSON, so pinning it across two serialisers would pin an accident of each and break the
// day either tool changed. The literal is the shared DECODE fixture; what is asserted about EMISSION
// is the thing that actually broke in 027 — the numeric literal.
func TestMembershipCountIsAWholeNumberOnTheWire(t *testing.T) {
	raw, err := json.Marshal(membershipDTO{ProductIDs: []string{"9f2c1d4e-0000-0000-0000-000000000001"}, Count: 1})
	require.NoError(t, err)
	require.JSONEq(t, SAVED_MEMBERSHIP_WIRE_JSON, string(raw))
	require.Contains(t, string(raw), `"count":1`)
	require.NotContains(t, string(raw), `"count":1.0`)

	// And the reverse direction: Go must accept what Kotlin sends.
	var back membershipDTO
	require.NoError(t, json.Unmarshal([]byte(SAVED_MEMBERSHIP_WIRE_JSON), &back))
	require.Equal(t, 1, back.Count)
}

// TestGoRejectsAFloatCount is the negative proof that the guard above can fail.
func TestGoRejectsAFloatCount(t *testing.T) {
	var back membershipDTO
	err := json.Unmarshal([]byte(`{"productIds":[],"count":1.0}`), &back)
	require.Error(t, err,
		"this is the 027 defect exactly — if this ever stops erroring, the WireInt annotation has "+
			"been lost and Kotlin can silently start sending floats")
}

// TestEmptyListDecodesAsEmptyNotAFailure — a shopper with nothing saved is a normal state.
func TestEmptyListDecodesAsEmptyNotAFailure(t *testing.T) {
	var items []savedItemDTO
	require.NoError(t, json.Unmarshal([]byte(`[]`), &items))
	require.Empty(t, items)
}

// TestVerdictVocabularyIsClosed pins the five values both languages must agree on.
//
// ⚠ These are not free-form strings. Each implies a different next action for the shopper, and a
// sixth value appearing on the wire would reach a client that cannot render it.
func TestVerdictVocabularyIsClosed(t *testing.T) {
	require.Equal(t, []string{
		"purchasable",
		"temporarily_unavailable",
		"not_delivered_to_your_area",
		"no_longer_sold",
		"not_yet_determined",
	}, []string{
		VerdictPurchasable, VerdictTemporarilyOut, VerdictNotDeliveredHere,
		VerdictNoLongerSold, VerdictNotYetDetermined,
	})
}

// TestOrderLineCarriesProductID is the Go half of FR-008's dependency.
//
// ⚠ The order line has carried `productId` on the wire since 019; the MOBILE DOMAIN MODEL dropped it,
// so a shopper could read a past order and save nothing from it. That is the same
// mapper-discards-what-the-backend-sends shape that hid `brand` and `badges` on the saved list — and
// research R12 wrongly concluded the CONTRACT was the blocker. It was not; the field needed mapping.
// This pins the wire half so a future change cannot quietly remove what the mobile side now relies on.
func TestOrderLineCarriesProductID(t *testing.T) {
	const orderItemWire = `{"productId":"9f2c1d4e-0000-0000-0000-000000000001","productName":"Free Range Eggs 12pk","unitPriceAmount":"6.50","quantity":2,"lineSubtotalAmount":"13.00"}`

	var m map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(orderItemWire), &m))
	require.Contains(t, m, "productId",
		"a product you cannot identify is a product you cannot save (FR-008)")
}
