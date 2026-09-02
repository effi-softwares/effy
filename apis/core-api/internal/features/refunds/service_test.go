package refunds

import (
	"testing"
)

// US1's rules, unit-tested. The money rules that are DATABASE properties — the ceiling under a lock,
// idempotency under a unique constraint — live in repository_container_test.go, because a fake would
// accept two refunds for the last dollar and prove nothing.

func input(mut func(*IssueInput)) IssueInput {
	in := IssueInput{
		OrderID: "o1", Kind: "item", Reason: ReasonItemNotSupplied,
		Lines: []LineInput{{OrderItemID: "oi1", Quantity: 1}}, ActorSub: "staff-1",
		ActorKind: "back_office",
	}
	if mut != nil {
		mut(&in)
	}
	return in
}

// ⚠ FR-003 / A7a — THE DEFECT THIS PREVENTS. If a client could send an amount beside a line selection,
// the two could disagree, and the refund record would claim it covered items it did not. The amount is
// REJECTED rather than ignored: ignoring it lets an operator believe they set the figure.
func TestItemRefund_RejectsAClientSuppliedAmount(t *testing.T) {
	err := validate(input(func(in *IssueInput) { in.Amount = "5.00" }))
	if err != ErrAmountRejected {
		t.Fatalf("an item-derived refund must REFUSE a supplied amount, got %v", err)
	}
}

func TestItemRefund_RequiresAtLeastOneLine(t *testing.T) {
	if err := validate(input(func(in *IssueInput) { in.Lines = nil })); err != ErrNoLines {
		t.Fatalf("want ErrNoLines, got %v", err)
	}
}

// ⚠ FR-003c. An amount with no line and no explanation is unaccountable — nobody reading the record
// later can say what it was for, and "we gave someone $20" is exactly the entry that needs to.
func TestGoodwillRefund_RequiresANote(t *testing.T) {
	in := input(func(in *IssueInput) {
		in.Kind, in.Reason, in.Lines, in.Amount = "goodwill", ReasonGoodwill, nil, "5.00"
	})
	if err := validate(in); err != ErrNoteRequired {
		t.Fatalf("want ErrNoteRequired, got %v", err)
	}
	in.Note = "delivered two hours late"
	if err := validate(in); err != nil {
		t.Fatalf("a goodwill refund WITH a note is valid: %v", err)
	}
}

// The two kinds must not blur: only goodwill may carry the goodwill reason, and an item refund may not.
func TestKindAndReasonMustAgree(t *testing.T) {
	if err := validate(input(func(in *IssueInput) { in.Reason = ReasonGoodwill })); err != ErrInvalidReason {
		t.Errorf("an item refund must not use the goodwill reason, got %v", err)
	}
	bad := input(func(in *IssueInput) {
		in.Kind, in.Reason, in.Lines, in.Amount, in.Note = "goodwill", ReasonItemUnusable, nil, "5.00", "x"
	})
	if err := validate(bad); err != ErrInvalidReason {
		t.Errorf("a goodwill refund must use the goodwill reason, got %v", err)
	}
}

func TestUnknownReasonIsRefused(t *testing.T) {
	if err := validate(input(func(in *IssueInput) { in.Reason = "because" })); err != ErrInvalidReason {
		t.Fatalf("want ErrInvalidReason, got %v", err)
	}
}

// ⚠ THE PROVIDER'S `fraudulent` IS NEVER SENT. Its own documentation states it adds the payer's card
// and email to a block list — a consequence for a person beyond this order, decided in a console with
// no review step. Whatever Effy's reason, the provider only ever hears one thing.
func TestProviderReason_NeverSendsFraudulentOrDuplicate(t *testing.T) {
	for _, r := range []string{ReasonItemNotSupplied, ReasonItemUnusable, ReasonOrderCancelled, ReasonGoodwill} {
		got := providerReason(r)
		if got == "fraudulent" || got == "duplicate" {
			t.Fatalf("reason %q mapped to %q — fraudulent blocklists the payer beyond this order", r, got)
		}
		if got != "requested_by_customer" {
			t.Errorf("reason %q mapped to %q, want requested_by_customer", r, got)
		}
	}
}

// ⚠ FR-005. The key is DERIVED FROM THE ACTION, never random — it is both our uniqueness constraint
// and the key sent to the provider, so an ambiguous retry is recognised as the same request rather
// than creating a second refund.
func TestIdempotencyKey_IsDerivedAndStable(t *testing.T) {
	a := idempotencyKey(input(nil), 1000)
	b := idempotencyKey(input(nil), 1000)
	if a != b {
		t.Fatal("the same action must derive the same key, or a retry refunds twice")
	}
	if a == "" {
		t.Fatal("an empty key would collapse every refund into one row")
	}
}

func TestIdempotencyKey_DiffersWhenTheActionDiffers(t *testing.T) {
	base := idempotencyKey(input(nil), 1000)
	cases := map[string]string{
		"a different amount":   idempotencyKey(input(nil), 2000),
		"a different order":    idempotencyKey(input(func(in *IssueInput) { in.OrderID = "o2" }), 1000),
		"a different line":     idempotencyKey(input(func(in *IssueInput) { in.Lines[0].OrderItemID = "oi2" }), 1000),
		"a different quantity": idempotencyKey(input(func(in *IssueInput) { in.Lines[0].Quantity = 2 }), 1000),
		"a different reason":   idempotencyKey(input(func(in *IssueInput) { in.Reason = ReasonItemUnusable }), 1000),
	}
	for name, key := range cases {
		if key == base {
			t.Errorf("%s must derive a DIFFERENT key, or the second refund is silently swallowed", name)
		}
	}
}

// ⚠ FR-011 — the one requirement here with a consumer-law claim behind it. The provider keeps its
// processing fee on a refunded payment; that is Effy's cost, and deducting it from the customer would
// breach the guarantees the published policy itself invokes.
func TestGoodwillAmount_IsReturnedInFullWithNothingDeducted(t *testing.T) {
	cents, err := goodwillCents("12.34")
	if err != nil {
		t.Fatalf("goodwillCents: %v", err)
	}
	if cents != 1234 {
		t.Fatalf("the customer must receive exactly what was entered: got %d cents, want 1234", cents)
	}
}

func TestGoodwillAmount_RefusesZeroAndNegativeAndNonsense(t *testing.T) {
	for _, bad := range []string{"0.00", "-5.00", "", "five dollars", "1.234"} {
		if _, err := goodwillCents(bad); err == nil {
			t.Errorf("goodwillCents(%q) must be refused", bad)
		}
	}
}

// ⚠ 057 — THE ACTOR KIND IS VALIDATED, AND THIS IS THE 053/056 LESSON APPLIED IN ADVANCE.
//
// Both of those features widened an enum whose readers negated it, and both shipped: 053's
// `<> 'delivered'` admitted two new terminal states, 056's `=== "disabled"` let a suspended driver
// keep a session. The shape is always the same — a value written after the check inherits "permitted".
//
// So this is parameterised over the whole vocabulary rather than testing the two happy values. A fifth
// actor kind added to the database CHECK forces a decision here instead of silently being accepted or
// silently being refused.
func TestActorKind_OnlyAnIssuerMayIssue(t *testing.T) {
	// Every value public.refund.actor_kind permits, after 057 widened it.
	for _, tc := range []struct {
		kind    string
		allowed bool
		why     string
	}{
		{"back_office", true, "Effy staff issue refunds — the original path"},
		{"shop", true, "057 US5: a shop manager may refund their own portion"},
		{"customer", false, "a customer REQUESTS a refund; they never issue one"},
		{"system", false, "nobody at Effy did it — the provider acted, and the DB forbids it a subject"},
		{"", false, "an unset kind must fail loudly, never default to spending someone's money"},
		{"driver", false, "not a refund issuer, and inventing one must not silently work"},
	} {
		err := validate(input(func(in *IssueInput) { in.ActorKind = tc.kind }))
		if tc.allowed && err != nil {
			t.Errorf("%q must be permitted (%s), got %v", tc.kind, tc.why, err)
		}
		if !tc.allowed && err != ErrInvalidActorKind {
			t.Errorf("%q must be refused (%s), got %v", tc.kind, tc.why, err)
		}
	}
}
