package storefront

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// ── SC-002a: the up-front answer and checkout's answer can never disagree ────────────────────────
//
// FR-014b requires that "do we deliver to you?", asked in the storefront header before a cart exists,
// gives the same answer the same postcode gets at checkout. A shopper told yes and then refused at
// payment is the failure this exists to prevent.
//
// That guarantee is STRUCTURAL, not incidental: after 025 there is exactly one implementation —
// delivery.ZoneForPostcode — and both callers use it. checkout/delivery_store.go DestinationZone
// calls it; storefront's Repository.Serviceable calls it. Neither holds a copy of the SQL, so there is
// nothing that can drift.
//
// These tests pin the two things that could still break that guarantee in code:
//   1. the shared predicate's semantics (a row means serviced, no row means not, an error means
//      NEITHER), and
//   2. the storefront's interpretation of it — in particular that a failed read is never reported to
//      a shopper as "we don't deliver there".
//
// The live end-to-end confirmation against real zone data is quickstart.md §3.

// fakeRow / fakeQuerier stand in for a pgx pool so the shared predicate is testable without a DB.
type fakeRow struct {
	zone string
	err  error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 {
		if p, ok := dest[0].(*string); ok {
			*p = r.zone
		}
	}
	return nil
}

type fakeQuerier struct {
	zones    map[string]string // postcode -> zone id
	failWith error
	lastSQL  string
	lastArg  string
}

func (q *fakeQuerier) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	q.lastSQL = sql
	if len(args) > 0 {
		if s, ok := args[0].(string); ok {
			q.lastArg = s
		}
	}
	if q.failWith != nil {
		return fakeRow{err: q.failWith}
	}
	if zone, ok := q.zones[q.lastArg]; ok {
		return fakeRow{zone: zone}
	}
	return fakeRow{err: pgx.ErrNoRows}
}

func TestZoneForPostcode_ServicedPostcodeResolvesToItsZone(t *testing.T) {
	q := &fakeQuerier{zones: map[string]string{"3000": "zone-mel-metro"}}

	zone, ok, err := delivery.ZoneForPostcode(context.Background(), q, "3000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("3000 is in a zone; want serviced")
	}
	if zone != "zone-mel-metro" {
		t.Fatalf("zone = %q, want zone-mel-metro", zone)
	}
}

func TestZoneForPostcode_UnservicedIsANormalAnswerNotAnError(t *testing.T) {
	q := &fakeQuerier{zones: map[string]string{"3000": "zone-mel-metro"}}

	_, ok, err := delivery.ZoneForPostcode(context.Background(), q, "0800")
	if err != nil {
		t.Fatalf("a postcode in no zone is a normal answer, not an error: %v", err)
	}
	if ok {
		t.Fatal("0800 is in no zone; want not serviced")
	}
}

// The distinction that protects a prospective customer: a broken read must NOT look like a refusal.
func TestZoneForPostcode_ReadFailureIsAnErrorNotARefusal(t *testing.T) {
	boom := errors.New("connection reset")
	q := &fakeQuerier{failWith: boom}

	_, ok, err := delivery.ZoneForPostcode(context.Background(), q, "3000")
	if err == nil {
		t.Fatal("a failed read must surface as an error")
	}
	if !errors.Is(err, boom) {
		t.Fatalf("error must wrap the cause, got %v", err)
	}
	if ok {
		t.Fatal("a failed read must not report serviced")
	}
}

// ── The storefront's interpretation ─────────────────────────────────────────────────────────────

// serviceabilityReader is a Reader whose only interesting method is Serviceable.
type serviceabilityReader struct {
	fakeReader
	serviced bool
	err      error
	asked    string
}

func (r *serviceabilityReader) Serviceable(_ context.Context, postcode string) (bool, error) {
	r.asked = postcode
	return r.serviced, r.err
}

func TestServiceability_ServicedPostcode(t *testing.T) {
	repo := &serviceabilityReader{serviced: true}
	svc := NewService(repo, fakePresign{})

	res, err := svc.Serviceability(context.Background(), "3000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Serviced || res.Postcode != "3000" {
		t.Fatalf("got %+v, want serviced 3000", res)
	}
}

func TestServiceability_UnservicedPostcode(t *testing.T) {
	repo := &serviceabilityReader{serviced: false}
	svc := NewService(repo, fakePresign{})

	res, err := svc.Serviceability(context.Background(), "0800")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Serviced {
		t.Fatal("want not serviced")
	}
}

// Malformed input is NOT a refusal. "That isn't a postcode" and "we don't deliver there" are
// different answers, and the second one told to someone who typoed is a customer lost for no reason.
func TestServiceability_MalformedInputIsRejectedNotRefused(t *testing.T) {
	for _, raw := range []string{"", "abc", "30", "300000", "3o00", "  ", "-1000", "1000-", "3000."} {
		repo := &serviceabilityReader{serviced: true} // would say YES if it were ever asked
		svc := NewService(repo, fakePresign{})

		_, err := svc.Serviceability(context.Background(), raw)
		if !errors.Is(err, ErrInvalidPostcode) {
			t.Fatalf("%q: want ErrInvalidPostcode, got %v", raw, err)
		}
		if repo.asked != "" {
			t.Fatalf("%q: must not reach the database at all, but asked %q", raw, repo.asked)
		}
	}
}

// A failed read must propagate as an error so the handler can say "we couldn't check" — never
// silently degrade to serviced:false.
func TestServiceability_ReadFailurePropagates(t *testing.T) {
	boom := errors.New("db down")
	svc := NewService(&serviceabilityReader{err: boom}, fakePresign{})

	res, err := svc.Serviceability(context.Background(), "3000")
	if err == nil {
		t.Fatal("want the read failure to propagate")
	}
	if res.Serviced {
		t.Fatal("a failed read must never report serviced")
	}
}

// Human-typed separators are normalised rather than rejected — the stored form is four digits.
func TestServiceability_NormalisesHumanInput(t *testing.T) {
	repo := &serviceabilityReader{serviced: true}
	svc := NewService(repo, fakePresign{})

	res, err := svc.Serviceability(context.Background(), "  3000 ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Postcode != "3000" || repo.asked != "3000" {
		t.Fatalf("normalisation failed: result %q, asked %q", res.Postcode, repo.asked)
	}
}

// FR-014a / FR-006: the result type carries a boolean and the postcode — and nothing else. A zone id
// or name would leak fulfilment geography; a fee or window would commit Effy to a figure checkout
// then revises. This asserts the shape rather than trusting a reviewer to notice a field being added.
func TestServiceabilityResult_ExposesNothingBeyondTheAnswer(t *testing.T) {
	var res ServiceabilityResult
	if got := reflectFieldNames(res); len(got) != 2 || got[0] != "Postcode" || got[1] != "Serviced" {
		t.Fatalf("ServiceabilityResult must expose exactly {Postcode, Serviced}, got %v — "+
			"a zone, fee, or window here would breach FR-014a/FR-006", got)
	}
}
