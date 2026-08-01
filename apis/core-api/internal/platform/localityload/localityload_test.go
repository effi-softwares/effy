package localityload

import (
	"strings"
	"testing"
)

const header = "locality,state,postcode\n"

func parse(t *testing.T, body string) ([]Row, error) {
	t.Helper()
	return Parse(strings.NewReader(header + body))
}

func TestParse_AcceptsAWellFormedDataset(t *testing.T) {
	rows, err := parse(t, "Richmond,VIC,3121\nRichmond,NSW,2753\nDarwin,NT,0800\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("want 3 rows, got %d", len(rows))
	}
	// The same name in two states is TWO places, not a duplicate — this is the whole reason the
	// natural key is the triple (FR-008).
	if rows[0].State == rows[1].State {
		t.Errorf("Richmond VIC and Richmond NSW collapsed into one row")
	}
}

// ⚠ The single most important test in this package. NT postcodes begin 08xx, and every naive pipeline
// that touches this column as a number destroys them. If this ever passes with "800", the Northern
// Territory silently becomes unreachable by name.
func TestParse_PreservesLeadingZeroPostcodes(t *testing.T) {
	rows, err := parse(t, "Darwin,NT,0800\nAlice Springs,NT,0870\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, r := range rows {
		if len(r.Postcode) != 4 || r.Postcode[0] != '0' {
			t.Errorf("leading zero lost: got postcode %q for %s", r.Postcode, r.Name)
		}
	}
}

// ⚠ And the corresponding refusal: a postcode that ALREADY lost its zero upstream must be rejected,
// not silently left-padded back. Padding would repair the symptom and hide that the dataset was
// corrupted before it reached us.
func TestParse_RejectsTruncatedPostcodeRatherThanPaddingIt(t *testing.T) {
	_, err := parse(t, "Darwin,NT,800\n")
	if err == nil {
		t.Fatal("want rejection of a 3-digit postcode, got none — was it padded?")
	}
	if !strings.Contains(err.Error(), "line 2") {
		t.Errorf("rejection must name the offending line, got: %v", err)
	}
}

func TestParse_RejectsMalformedRows(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"three-digit postcode", "Somewhere,VIC,312\n", "four digits"},
		{"non-numeric postcode", "Somewhere,VIC,3A21\n", "four digits"},
		{"five-digit postcode", "Somewhere,VIC,31210\n", "four digits"},
		{"unknown state", "Somewhere,ZZ,3121\n", "unknown state"},
		{"blank state", "Somewhere,,3121\n", "unknown state"},
		{"blank name", ",VIC,3121\n", "blank locality name"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parse(t, tc.body)
			if err == nil {
				t.Fatalf("want rejection, got none")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("want error mentioning %q, got: %v", tc.want, err)
			}
			// Every rejection names its line — an operator needs to find it among 18k.
			if !strings.Contains(err.Error(), "line 2") {
				t.Errorf("want the line number in the error, got: %v", err)
			}
		})
	}
}

// The loader must report EVERY problem in one pass, not stop at the first.
func TestParse_ReportsAllProblemsAtOnce(t *testing.T) {
	_, err := parse(t, "Somewhere,VIC,312\nElsewhere,ZZ,3121\n,VIC,3000\n")
	if err == nil {
		t.Fatal("want rejection, got none")
	}
	var pe *ParseError
	if !asParseError(err, &pe) {
		t.Fatalf("want *ParseError, got %T", err)
	}
	if len(pe.Problems) != 3 {
		t.Errorf("want all 3 problems reported, got %d: %v", len(pe.Problems), pe.Problems)
	}
}

// ⚠ One malformed row must not be able to smuggle the rest of the dataset in. The loader's contract is
// all-or-nothing: a partially-loaded locality table is one where some suburbs are unreachable and
// nothing says which.
func TestParse_ReturnsNoRowsWhenAnyRowIsMalformed(t *testing.T) {
	rows, err := parse(t, "Richmond,VIC,3121\nBroken,VIC,12\n")
	if err == nil {
		t.Fatal("want rejection")
	}
	if rows != nil {
		t.Errorf("want no rows alongside an error, got %d", len(rows))
	}
}

func TestParse_CollapsesExactDuplicates(t *testing.T) {
	rows, err := parse(t, "Richmond,VIC,3121\nRichmond,VIC,3121\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 1 {
		t.Errorf("want duplicates collapsed to 1 row, got %d", len(rows))
	}
}

// Columns are addressed by NAME, so a dataset that reorders them between refreshes cannot silently
// load states into the postcode column.
func TestParse_LocatesColumnsByNameNotPosition(t *testing.T) {
	rows, err := Parse(strings.NewReader("postcode,locality,state\n3121,Richmond,VIC\n"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rows[0].Name != "Richmond" || rows[0].State != "VIC" || rows[0].Postcode != "3121" {
		t.Errorf("columns mapped by position rather than name: %+v", rows[0])
	}
}

func TestParse_AcceptsCommonHeaderSpellings(t *testing.T) {
	for _, h := range []string{"suburb,state,postcode", "name,state_code,postal_code", "locality,state,post_code"} {
		if _, err := Parse(strings.NewReader(h + "\nRichmond,VIC,3121\n")); err != nil {
			t.Errorf("header %q rejected: %v", h, err)
		}
	}
}

func TestParse_RejectsADatasetMissingARequiredColumn(t *testing.T) {
	_, err := Parse(strings.NewReader("locality,state\nRichmond,VIC\n"))
	if err == nil || !strings.Contains(err.Error(), "postcode") {
		t.Fatalf("want a missing-column error naming postcode, got: %v", err)
	}
}

// ⚠ An empty dataset is never legitimate — it means the wrong file, or one whose columns did not
// survive. Accepting it would empty the locality table on the next load.
func TestParse_RejectsAnEmptyDataset(t *testing.T) {
	if _, err := Parse(strings.NewReader(header)); err == nil {
		t.Fatal("want rejection of a dataset with no rows")
	}
}

func TestParse_NormalisesSurroundingWhitespaceAndStateCase(t *testing.T) {
	rows, err := parse(t, "  Richmond , vic , 3121 \n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rows[0].Name != "Richmond" || rows[0].State != "VIC" || rows[0].Postcode != "3121" {
		t.Errorf("whitespace/case not normalised: %+v", rows[0])
	}
}

func asParseError(err error, target **ParseError) bool {
	pe, ok := err.(*ParseError)
	if ok {
		*target = pe
	}
	return ok
}
