package storefront

import (
	"context"
	"errors"
	"testing"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

func localityService(repo *fakeReader) *Service { return NewService(repo, nil) }

// ── Classification: the SERVER decides what the shopper typed (FR-006) ──────────────────────────

func TestClassifyLocalityQuery(t *testing.T) {
	cases := []struct {
		name         string
		in           string
		wantQuery    string
		wantPostcode bool
		wantOK       bool
	}{
		{"four digits is a postcode", "3121", "3121", true, true},
		{"a name is a prefix", "richmo", "richmo", false, true},
		{"mixed case is preserved for the DB to lower", "Richmo", "Richmo", false, true},
		{"separators inside a postcode are stripped", "30 00", "3000", true, true},
		{"hyphenated postcode", "30-00", "3000", true, true},
		{"surrounding whitespace is trimmed", "  3000  ", "3000", true, true},
		{"a leading-zero postcode survives", "0800", "0800", true, true},
		{"two characters is enough to search", "st", "st", false, true},
		{"a name with a space", "port m", "port m", false, true},
		{"an apostrophe is an ordinary name character", "o'co", "o'co", false, true},
		{"a hyphenated place name is a prefix, not a postcode", "coffs-h", "coffs-h", false, true},

		{"one character is not a question", "r", "", false, false},
		{"empty is not a question", "", "", false, false},
		{"whitespace only", "   ", "", false, false},
		{"three digits is neither a postcode nor a name", "312", "", false, false},
		{"five digits is neither", "31210", "", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			q, byPostcode, ok := classifyLocalityQuery(tc.in)
			if ok != tc.wantOK {
				t.Fatalf("ok: want %v, got %v", tc.wantOK, ok)
			}
			if !ok {
				return
			}
			if q != tc.wantQuery || byPostcode != tc.wantPostcode {
				t.Errorf("want (%q, postcode=%v), got (%q, postcode=%v)", tc.wantQuery, tc.wantPostcode, q, byPostcode)
			}
		})
	}
}

// ⚠ The postcode branch must agree EXACTLY with delivery.NormalizePostcode, which the serviceability
// read uses. If they diverge, a shopper can type something this endpoint accepts as a postcode and the
// serviceability endpoint then 400s on — an inconsistency the shopper cannot act on or understand.
//
// The leading/trailing-separator case is the one that matters: "-1000" must NOT strip to "1000",
// because that answers the shopper about a place they never named.
func TestClassifyLocalityQuery_PostcodeBranchAgreesWithDeliveryNormalize(t *testing.T) {
	for _, in := range []string{"3000", "30 00", "30-00", " 3000 ", "0800", "-1000", "1000-", "12", "31210", "3 000"} {
		wantPostcode, wantOK := delivery.NormalizePostcode(in)
		gotQuery, gotByPostcode, gotOK := classifyLocalityQuery(in)

		if wantOK {
			if !gotOK || !gotByPostcode || gotQuery != wantPostcode {
				t.Errorf("%q: delivery says postcode %q, locality classifier says (q=%q, postcode=%v, ok=%v)",
					in, wantPostcode, gotQuery, gotByPostcode, gotOK)
			}
			continue
		}
		// delivery refused it as a postcode. The classifier may still accept it as a NAME prefix
		// (e.g. "-1000" is not a postcode), but it must never claim it IS a postcode.
		if gotOK && gotByPostcode {
			t.Errorf("%q: delivery refuses it as a postcode, but the classifier treats it as one (%q)", in, gotQuery)
		}
	}
}

// ── The service ────────────────────────────────────────────────────────────────────────────────

func TestLocalities_NameQuerySearchesByPrefix(t *testing.T) {
	repo := &fakeReader{localities: []Locality{{Name: "Richmond", State: "VIC", Postcode: "3121"}}}
	out, err := localityService(repo).Localities(context.Background(), "richmo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.localityByPostcode {
		t.Error("a name query must not be searched as a postcode")
	}
	if repo.localityQuery != "richmo" {
		t.Errorf("query: want %q, got %q", "richmo", repo.localityQuery)
	}
	if len(out) != 1 || out[0].Name != "Richmond" {
		t.Errorf("unexpected result: %+v", out)
	}
}

func TestLocalities_PostcodeQuerySearchesByPostcode(t *testing.T) {
	repo := &fakeReader{localities: []Locality{{Name: "Richmond", State: "VIC", Postcode: "3121"}}}
	if _, err := localityService(repo).Localities(context.Background(), "3121"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.localityByPostcode || repo.localityQuery != "3121" {
		t.Errorf("want an exact postcode search for 3121, got (q=%q, postcode=%v)", repo.localityQuery, repo.localityByPostcode)
	}
}

// FR-010: the list stays scannable.
func TestLocalities_BoundsTheResultSet(t *testing.T) {
	repo := &fakeReader{}
	if _, err := localityService(repo).Localities(context.Background(), "st"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.localityLimit != localityLimit {
		t.Errorf("want limit %d, got %d", localityLimit, repo.localityLimit)
	}
	if localityLimit > 10 {
		t.Errorf("a list of %d is not scannable on a phone", localityLimit)
	}
}

// ⚠ The most important assertion about this endpoint. "No place matches" is NOT "we don't deliver
// there", and the two must be structurally distinguishable: an empty result is a successful lookup.
func TestLocalities_NoMatchIsAnEmptyResultNotAnError(t *testing.T) {
	repo := &fakeReader{localities: nil}
	out, err := localityService(repo).Localities(context.Background(), "zzzzqqq")
	if err != nil {
		t.Fatalf("an unmatched query must not be an error, got: %v", err)
	}
	if out == nil {
		t.Fatal("want an empty slice (marshals to []), got nil (marshals to null)")
	}
	if len(out) != 0 {
		t.Errorf("want no results, got %d", len(out))
	}
}

// FR-009: too little input is rejected BEFORE the database is asked.
func TestLocalities_ShortQueryIsRejectedWithoutTouchingTheDatabase(t *testing.T) {
	repo := &fakeReader{}
	_, err := localityService(repo).Localities(context.Background(), "r")
	if !errors.Is(err, ErrInvalidQuery) {
		t.Fatalf("want ErrInvalidQuery, got %v", err)
	}
	if repo.localityQuery != "" {
		t.Errorf("the database was queried with %q despite invalid input", repo.localityQuery)
	}
}

// ⚠ FR-013: a failed lookup propagates. It must NOT be flattened into an empty list, which a shopper
// reads as "that place doesn't exist" — a false statement about the world caused by our outage.
func TestLocalities_ReadFailurePropagatesRatherThanBecomingAnEmptyList(t *testing.T) {
	sentinel := errors.New("boom")
	repo := &fakeReader{localityErr: sentinel}
	out, err := localityService(repo).Localities(context.Background(), "richmo")
	if !errors.Is(err, sentinel) {
		t.Fatalf("want the read error propagated, got %v", err)
	}
	if len(out) != 0 {
		t.Errorf("want no results alongside an error, got %d", len(out))
	}
}

// ⚠ FR-011: the list must not hint at the answer. The service passes serviceability nothing and asks
// for nothing about it — a suggestion list that ordered or filtered by coverage would both pre-empt
// the verdict and let anyone enumerate Effy's delivery footprint.
func TestLocalities_NeverConsultsServiceability(t *testing.T) {
	repo := &serviceabilityReader{serviced: true}
	repo.localities = []Locality{
		{Name: "Aaa", State: "VIC", Postcode: "3000"},
		{Name: "Bbb", State: "NSW", Postcode: "2000"},
	}
	out, err := NewService(repo, nil).Localities(context.Background(), "aa")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.asked != "" {
		t.Errorf("⚠ the locality lookup asked whether %q is serviced — FR-011 forbids the list reflecting coverage", repo.asked)
	}
	// And the order is exactly what the repository returned, unshuffled.
	if len(out) == 2 && out[0].Name != "Aaa" {
		t.Errorf("the service reordered results: %+v", out)
	}
}

// The three fields are the whole record — dropping any one leaves an ambiguous place (FR-008).
func TestLocality_CarriesTheWholeTriple(t *testing.T) {
	got := reflectFieldNames(Locality{})
	want := []string{"Name", "State", "Postcode"}
	if len(got) != len(want) {
		t.Fatalf("Locality fields: want %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("Locality fields: want %v, got %v", want, got)
			break
		}
	}
}
