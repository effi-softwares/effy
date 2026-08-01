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

// ── Coordinates (032) ─────────────────────────────────────────────────────────────────────────
//
// ⚠ The whole point of these is that ABSENT and ZERO must never become the same value. 0°N 0°E is in
// the Gulf of Guinea, ~14 000 km from Australia; under 032's pricing an unknown location takes the
// furthest band (the safe direction), but a stated 0,0 would price as the furthest place on earth
// while reporting nothing wrong at all.

const geoHeader = "locality,state,postcode,latitude,longitude\n"

func parseGeo(t *testing.T, body string) ([]Row, error) {
	t.Helper()
	return Parse(strings.NewReader(geoHeader + body))
}

func TestParse_ReadsCoordinates(t *testing.T) {
	rows, err := parseGeo(t, "Melbourne,VIC,3000,-37.814200,144.963200\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rows[0].Lat == nil || rows[0].Lon == nil {
		t.Fatalf("coordinates not parsed: %+v", rows[0])
	}
	if *rows[0].Lat != -37.8142 || *rows[0].Lon != 144.9632 {
		t.Errorf("got %v,%v want -37.8142,144.9632", *rows[0].Lat, *rows[0].Lon)
	}
}

// ⚠ An empty pair is a legitimate, common state — G-NAF does not carry a point for every locality.
// It must be NIL, never 0.
func TestParse_EmptyCoordinateIsNilNotZero(t *testing.T) {
	rows, err := parseGeo(t, "Nowhere,VIC,3999,,\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rows[0].Lat != nil || rows[0].Lon != nil {
		t.Errorf("absent coordinate must be nil, got %v,%v", rows[0].Lat, rows[0].Lon)
	}
}

// A dataset with no coordinate columns at all still loads — every row is simply location-unknown.
func TestParse_CoordinateColumnsAreOptional(t *testing.T) {
	rows, err := parse(t, "Richmond,VIC,3121\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rows[0].Lat != nil || rows[0].Lon != nil {
		t.Errorf("want nil coordinates on a pre-032 dataset, got %v,%v", rows[0].Lat, rows[0].Lon)
	}
}

// ⚠ Half a pair is a BROKEN ROW, not an absence. Treating it as "unknown" would hide a parsing fault
// behind a gap that looks legitimate.
func TestParse_RejectsHalfACoordinate(t *testing.T) {
	for _, body := range []string{
		"Half,VIC,3000,-37.8142,\n",
		"Half,VIC,3000,,144.9632\n",
	} {
		_, err := parseGeo(t, body)
		var pe *ParseError
		if !asParseError(err, &pe) || !strings.Contains(pe.Error(), "half a coordinate") {
			t.Errorf("want a half-a-coordinate rejection for %q, got: %v", body, err)
		}
	}
}

func TestParse_RejectsUnparseableCoordinate(t *testing.T) {
	_, err := parseGeo(t, "Bad,VIC,3000,north,east\n")
	var pe *ParseError
	if !asParseError(err, &pe) || !strings.Contains(pe.Error(), "not a number") {
		t.Errorf("want a not-a-number rejection, got: %v", err)
	}
}

// ⚠ THE SWAP. G-NAF lists LONGITUDE first, and every Australian longitude (96…168) is a plausible
// number that is not a latitude — so a positional misread produces a coordinate that looks entirely
// reasonable and puts the suburb thousands of kilometres away. Latitude is the discriminating axis:
// nothing in Australia sits above -8.
func TestParse_RejectsSwappedLatLon(t *testing.T) {
	_, err := parseGeo(t, "Swapped,VIC,3000,144.9632,-37.8142\n")
	var pe *ParseError
	if !asParseError(err, &pe) || !strings.Contains(pe.Error(), "outside Australia") {
		t.Errorf("want an outside-Australia rejection for a swapped pair, got: %v", err)
	}
}

func TestParse_RejectsCoordinateOutsideAustralia(t *testing.T) {
	for _, body := range []string{
		"London,VIC,3000,51.5074,-0.1278\n",
		"NullIsland,VIC,3000,0,0\n", // ⚠ the trap this whole design exists to avoid
	} {
		_, err := parseGeo(t, body)
		var pe *ParseError
		if !asParseError(err, &pe) || !strings.Contains(pe.Error(), "outside Australia") {
			t.Errorf("want an outside-Australia rejection for %q, got: %v", body, err)
		}
	}
}

// ⚠ A header carrying one coordinate column but not the other is refused BEFORE any row is read —
// otherwise every one of 15 000 rows trips "half a coordinate" and the real fault is buried.
func TestParse_RejectsHalfACoordinateHeader(t *testing.T) {
	_, err := Parse(strings.NewReader("locality,state,postcode,latitude\nRichmond,VIC,3121,-37.8\n"))
	if err == nil || !strings.Contains(err.Error(), "one coordinate column but not the other") {
		t.Fatalf("want a header rejection naming the missing column, got: %v", err)
	}
}

// Coordinates are not part of a locality's identity: the same triple twice collapses to one row even
// when the points differ. ⚠ Row gained pointer fields, which would silently break a map[Row] dedupe.
func TestParse_DedupesOnTheTripleNotTheCoordinate(t *testing.T) {
	rows, err := parseGeo(t, "Richmond,VIC,3121,-37.8182,144.9970\nRichmond,VIC,3121,-37.8183,144.9971\n")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 row after dedupe, got %d", len(rows))
	}
}
