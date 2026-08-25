package checkout

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

// ── 051 T027 — the provider customer is created ONCE, however many times an intent is retried ───────
//
// This is one of the three legs of FR-038. A retried intent that created a SECOND provider customer
// would strand the first — along with any card attached to it — with nothing in Effy able to reach it.

func TestCreateIntent_CreatesProviderCustomerOnceAcrossRetries(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	for i := 0; i < 3; i++ {
		if _, err := intent(svc, IntentInput{AddressID: addrID}); err != nil {
			t.Fatalf("intent %d: %v", i, err)
		}
	}

	if gw.customerCreates != 1 {
		t.Fatalf("provider customer created %d times, want exactly 1", gw.customerCreates)
	}
	if store.providerCustomerID != "cus_fake" {
		t.Fatalf("provider reference = %q, want it persisted", store.providerCustomerID)
	}
	// Written once, on the transition from none to one — not on every retry.
	if store.providerWrites != 1 {
		t.Fatalf("provider reference written %d times, want 1", store.providerWrites)
	}
}

func TestCreateIntent_ReusesAnExistingProviderCustomer(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.providerCustomerID = "cus_existing"
	svc := svcWith(store, gw)

	if _, err := intent(svc, IntentInput{AddressID: addrID}); err != nil {
		t.Fatal(err)
	}
	if gw.customerCreates != 0 {
		t.Fatalf("created %d provider customers for a shopper who already had one", gw.customerCreates)
	}
	if store.providerWrites != 0 {
		t.Fatalf("rewrote the provider reference %d times; an unchanged value must not be written", store.providerWrites)
	}
}

// ── 051 T028 — billing details are DERIVED, and cannot be supplied by the client ────────────────────

func TestCreateIntent_DerivesBillingDetailsFromTheOrderSnapshot(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID})
	if err != nil {
		t.Fatal(err)
	}
	if got, want := res.BillingDetails.Address.Line1, "1 Test St"; got != want {
		t.Fatalf("billing line1 = %q, want %q (from the address snapshot)", got, want)
	}
	if got, want := res.BillingDetails.Address.PostalCode, "3121"; got != want {
		t.Fatalf("billing postcode = %q, want %q", got, want)
	}
	// ⚠ The whole point of the feature: the shopper is never asked for a country, so the server must
	// supply one. Australia-only, and never a guess from an IP.
	if got := res.BillingDetails.Address.Country; got != "AU" {
		t.Fatalf("billing country = %q, want %q — an absent country is what let the provider guess", got, "AU")
	}
}

func TestCreateIntent_BillingDetailsFollowADivergentBillingAddress(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID, BillingAddressID: otherAddr})
	if err != nil {
		t.Fatal(err)
	}
	// When the shopper diverges, the details Effy sends must follow the BILLING address, not the
	// shipping one — otherwise the bank is given an address the shopper explicitly did not choose.
	if got, want := res.BillingDetails.Address.Line1, "9 Other Rd"; got != want {
		t.Fatalf("billing line1 = %q, want %q (the divergent billing address)", got, want)
	}
}

// ── 051 T022 — the customer session is minted only for a client that renders a provider-owned list ──

func TestCreateIntent_MintsNoCustomerSessionForWeb(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID})
	if err != nil {
		t.Fatal(err)
	}
	if gw.sessions != 0 {
		t.Fatalf("minted %d customer sessions for a client that did not ask; that is a provider round trip for nothing", gw.sessions)
	}
	if res.CustomerSessionSecret != "" {
		t.Fatalf("session secret = %q, want empty", res.CustomerSessionSecret)
	}
}

func TestCreateIntent_MintsACustomerSessionWhenAsked(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID, WantsProviderMethodList: true})
	if err != nil {
		t.Fatal(err)
	}
	if gw.sessions != 1 {
		t.Fatalf("minted %d sessions, want 1", gw.sessions)
	}
	if res.CustomerSessionSecret == "" {
		t.Fatal("session secret is empty for a client that renders a provider-owned method list")
	}
}

// ⚠ The PaymentIntent must carry the provider customer, or a card the shopper chooses to keep attaches
// to nothing and is silently never offered again.
func TestCreateIntent_AttachesTheProviderCustomerToTheIntent(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	if _, err := intent(svc, IntentInput{AddressID: addrID}); err != nil {
		t.Fatal(err)
	}
	if gw.intentCustomer != "cus_fake" {
		t.Fatalf("intent customer = %q, want the provider customer id", gw.intentCustomer)
	}
}

// ⚠ FR-020, guarded STRUCTURALLY rather than behaviourally, and deliberately so.
//
// The first version of this test asserted that a fake's `setupFutureUsage` field stayed empty. It passed —
// and it would have passed just as happily with the feature broken, because `CreateIntentInput` has no
// such field for anything to write to. A fixture agreeing with the code instead of with the requirement
// is this repo's most-repeated defect (027 R13, 029, 033, 035), so this asserts the property that
// actually holds the requirement: the input struct CANNOT express setup_future_usage. Add such a field
// and this fails, which is the moment someone needs to be stopped and made to read FR-020.
//
// Setting it server-side would keep a card the shopper declined, and combining it with the customer
// session's save feature is a documented integration error besides (research R5).
func TestCreateIntentInput_CannotExpressSetupFutureUsage(t *testing.T) {
	typ := reflect.TypeOf(CreateIntentInput{})
	for i := 0; i < typ.NumField(); i++ {
		name := strings.ToLower(typ.Field(i).Name)
		if strings.Contains(name, "setupfutureusage") || strings.Contains(name, "futureusage") {
			t.Fatalf("CreateIntentInput has field %q — whether a card is kept is the shopper's choice, made at confirmation, and the server must not be able to decide it (FR-020)", typ.Field(i).Name)
		}
	}
}

// ── 051 T030 — a provider outage is an ERROR, never an empty list ───────────────────────────────────

func TestListKeptCards_ProviderFailureIsNotAnEmptyList(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.providerCustomerID = "cus_existing"
	gw.listErr = errors.New("provider unreachable")
	svc := svcWith(store, gw)

	_, err := svc.ListKeptCards(context.Background(), custID, time.Now())
	if err == nil {
		t.Fatal("a provider outage returned success; \"you have no cards\" and \"we could not ask\" are different facts (FR-036)")
	}
}

func TestListKeptCards_NeverPaidIsEmptyAndNotAnError(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw) // no provider reference — this shopper has never paid

	cards, err := svc.ListKeptCards(context.Background(), custID, time.Now())
	if err != nil {
		t.Fatalf("having never paid is not a failure: %v", err)
	}
	if len(cards) != 0 {
		t.Fatalf("got %d cards for a shopper with no provider record", len(cards))
	}
}

// ── 051 T024 — expiry is decided by the server, and a card is good through its LAST day ─────────────

func TestListKeptCards_ComputesUsability(t *testing.T) {
	now := time.Date(2026, time.August, 25, 0, 0, 0, 0, time.UTC)
	store, gw := storeWithMilk(), &fakeGateway{}
	store.providerCustomerID = "cus_existing"
	gw.cards = []SavedCard{
		{ID: "pm_future", Brand: "visa", Last4: "4242", ExpMonth: 4, ExpYear: 2028},
		{ID: "pm_thismonth", Brand: "visa", Last4: "1111", ExpMonth: 8, ExpYear: 2026},
		{ID: "pm_lastmonth", Brand: "visa", Last4: "2222", ExpMonth: 7, ExpYear: 2026},
		{ID: "pm_lastyear", Brand: "visa", Last4: "3333", ExpMonth: 12, ExpYear: 2025},
	}
	svc := svcWith(store, gw)

	cards, err := svc.ListKeptCards(context.Background(), custID, now)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{
		"pm_future": true,
		// ⚠ A card is valid through the LAST day of its expiry month. Treating the 1st as expired would
		// refuse a perfectly good card for up to 30 days.
		"pm_thismonth": true,
		"pm_lastmonth": false,
		"pm_lastyear":  false,
	}
	for _, c := range cards {
		if c.Usable != want[c.ID] {
			t.Errorf("%s usable = %v, want %v", c.ID, c.Usable, want[c.ID])
		}
		if !c.Usable && c.UnusableReason == "" {
			t.Errorf("%s is unusable with no reason; a refusal a shopper cannot read is indistinguishable from a bug (FR-023)", c.ID)
		}
	}
}

// ── 051 T029 — ownership is verified before a detach ────────────────────────────────────────────────

func TestRemoveKeptCard_RefusesAnotherShoppersCard(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.providerCustomerID = "cus_existing"
	gw.cards = []SavedCard{{ID: "pm_mine", Brand: "visa", Last4: "4242", ExpMonth: 4, ExpYear: 2028}}
	svc := svcWith(store, gw)

	err := svc.RemoveKeptCard(context.Background(), custID, "pm_someone_elses")
	if !errors.Is(err, ErrPaymentMethodNotFound) {
		t.Fatalf("err = %v, want ErrPaymentMethodNotFound", err)
	}
	// ⚠ The real assertion: nothing was detached. An error return with a detach already sent would be a
	// cross-customer write that merely reported itself politely.
	if len(gw.detached) != 0 {
		t.Fatalf("detached %v — a client-supplied id must never reach the provider unverified (FR-026)", gw.detached)
	}
}

func TestRemoveKeptCard_DetachesTheShoppersOwnCard(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	store.providerCustomerID = "cus_existing"
	gw.cards = []SavedCard{{ID: "pm_mine", Brand: "visa", Last4: "4242", ExpMonth: 4, ExpYear: 2028}}
	svc := svcWith(store, gw)

	if err := svc.RemoveKeptCard(context.Background(), custID, "pm_mine"); err != nil {
		t.Fatal(err)
	}
	if len(gw.detached) != 1 || gw.detached[0] != "pm_mine" {
		t.Fatalf("detached = %v, want [pm_mine]", gw.detached)
	}
}

func TestRemoveKeptCard_NeverPaidIsNotFound(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	if err := svc.RemoveKeptCard(context.Background(), custID, "pm_anything"); !errors.Is(err, ErrPaymentMethodNotFound) {
		t.Fatalf("err = %v, want ErrPaymentMethodNotFound", err)
	}
}

// ── 051 US3 — the provider customer id travels ONLY where an SDK needs it ────────────────────────────
//
// ⚠ data-model § 1 originally said this id never reaches a client. Reading the mobile SDKs corrected
// that — both require it beside the session secret — so the rule became "only beside a session". These
// two tests are what stop that narrower rule eroding into "always".

func TestCreateIntent_WebResponseCarriesNoProviderCustomerID(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID}) // web: wants no provider method list
	if err != nil {
		t.Fatal(err)
	}
	if res.ProviderCustomerID != "" {
		t.Fatalf("web response carried provider customer id %q; it has no purpose without a session", res.ProviderCustomerID)
	}
}

func TestCreateIntent_MobileResponseCarriesTheIDBesideTheSession(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID, WantsProviderMethodList: true})
	if err != nil {
		t.Fatal(err)
	}
	// ⚠ Both or neither. A session without its id cannot be attached, so a response carrying one and
	// not the other would render an empty saved-card list with no error anywhere.
	if res.CustomerSessionSecret == "" || res.ProviderCustomerID == "" {
		t.Fatalf("session=%q id=%q — both are required to attach a customer session",
			res.CustomerSessionSecret, res.ProviderCustomerID)
	}
}

// ── 051 US4 — pay-over-time availability comes from the PROVIDER, never a guess ──────────────────────
//
// ⚠ FR-010/FR-011. A client cannot know whether an instalment option is offerable: it depends on the
// basket total and on account eligibility. Guessing produces exactly the two failures the spec forbids
// — an option offered and then refused after the shopper commits, or one that vanishes unexplained.

func TestHasPayOverTime_ReadsTheProvidersAnswer(t *testing.T) {
	cases := []struct {
		name      string
		available []string
		want      bool
	}{
		{"card only", []string{"card"}, false},
		{"klarna offered", []string{"card", "klarna"}, true},
		{"zip offered", []string{"card", "zip"}, true},
		// ⚠ Afterpay is AU-supported and merely awaits account activation, so it is in the map already:
		// the day it activates, the row appears with no code change (FR-013).
		{"afterpay offered", []string{"card", "afterpay_clearpay"}, true},
		// ⚠ A wallet is not an instalment plan. Treating one as pay-over-time would render a row that
		// then offers nothing.
		{"wallets are not instalments", []string{"card", "link", "apple_pay"}, false},
		{"nothing at all", nil, false},
	}
	for _, tc := range cases {
		if got := hasPayOverTime(tc.available); got != tc.want {
			t.Errorf("%s: hasPayOverTime(%v) = %v, want %v", tc.name, tc.available, got, tc.want)
		}
	}
}

func TestCreateIntent_ReportsPayOverTimeFromTheIntent(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{availableMethods: []string{"card", "klarna"}}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID})
	if err != nil {
		t.Fatal(err)
	}
	if !res.PayOverTimeAvailable {
		t.Fatal("provider offered klarna but the response says pay-over-time is unavailable")
	}
}

func TestCreateIntent_ReportsNoPayOverTimeWhenTheProviderOffersNone(t *testing.T) {
	store, gw := storeWithMilk(), &fakeGateway{availableMethods: []string{"card"}}
	svc := svcWith(store, gw)

	res, err := intent(svc, IntentInput{AddressID: addrID})
	if err != nil {
		t.Fatal(err)
	}
	// ⚠ The row must be ABSENT rather than present-and-empty. An empty "Pay over time" row is the
	// unexplained-disappearance failure wearing a different hat (FR-011).
	if res.PayOverTimeAvailable {
		t.Fatal("no instalment option was offered, but the response says one is available")
	}
}
