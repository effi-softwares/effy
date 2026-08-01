// Package localityload turns the committed Australian locality dataset (db/reference/au-localities.csv)
// into rows the loader can upsert. It is PURE — no database, no filesystem, no network — so the
// parsing rules that matter are exhaustively unit-testable (030 research R2).
//
// ⚠ IT REJECTS; IT DOES NOT REPAIR. A malformed row is a defect in the dataset, and a loader that
// quietly fixes rows produces a database nobody can reason about. Every rejection names its line so
// the operator can go and look at it. Same posture as 029's image conformance check, and for the same
// reason: refusing is information, silently correcting is not.
package localityload

import (
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
)

// Row is one locality as the dataset supplies it. The triple is the whole record — see
// specs/030-delivery-location-suburb/data-model.md for why no two of the three identify a place.
type Row struct {
	Name     string
	State    string
	Postcode string

	// Lat/Lon are the locality's point (032). ⚠ NIL WHEN UNKNOWN, and that is the entire reason they
	// are pointers rather than float64: a zero-value coordinate is 0°N 0°E, in the Gulf of Guinea,
	// roughly 14 000 km from Australia. Under 032's pricing rules an unknown location takes the
	// FURTHEST distance band — the safe direction — but a 0,0 would be a *stated* location and would
	// price as the furthest place on earth while reporting nothing wrong. Absence and zero must not be
	// the same value here.
	Lat *float64
	Lon *float64
}

// auBounds is the same box db/reference/derive-localities.mjs enforces, restated here because this
// package must not trust its input — the CSV is committed, but a hand-edit or a bad regeneration is
// exactly the sort of thing a loader is the last line of defence against.
//
// ⚠ LATITUDE is the discriminating axis. G-NAF lists LONGITUDE first, and every Australian longitude
// (96…168) is a plausible-looking number that is not a latitude, so a swapped pair looks entirely
// reasonable. No Australian latitude is above -8, which is what catches it.
const (
	minLat, maxLat = -55.0, -8.0
	minLon, maxLon = 95.0, 170.0
)

// states is the closed set the `locality.state` CHECK constraint also encodes. Declared here so a
// dataset carrying a ninth value is rejected at parse time with a line number, rather than at INSERT
// time with a constraint violation that names no row.
var states = map[string]bool{
	"ACT": true, "NSW": true, "NT": true, "QLD": true,
	"SA": true, "TAS": true, "VIC": true, "WA": true,
}

// Parse reads the dataset and returns its rows, or every reason it could not.
//
// The header is required and is matched by NAME, not by position: a dataset that reorders its columns
// between refreshes must not silently load states into the postcode column. Only the three columns
// this feature needs are read; any others are ignored, so a richer dataset (lat/long, SA3 codes) works
// without modification.
//
// Duplicate triples are collapsed rather than rejected — real datasets carry them, they carry no
// information, and the upsert would flatten them anyway.
func Parse(r io.Reader) ([]Row, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1 // tolerate ragged rows; we address columns by name

	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("localityload: reading header: %w", err)
	}
	idx, err := columnIndexes(header)
	if err != nil {
		return nil, err
	}

	var (
		rows     []Row
		problems []string
		// ⚠ Keyed on the TRIPLE, not on Row — Row now carries pointer fields, so two rows for the same
		// place with equal coordinates would be distinct map keys and the dedupe would silently stop
		// working. Coordinates are not part of a locality's identity.
		seen = map[[3]string]bool{}
		line = 1 // the header was line 1; data starts at 2
	)
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		line++
		if err != nil {
			problems = append(problems, fmt.Sprintf("line %d: %v", line, err))
			continue
		}

		row, err := rowFrom(rec, idx)
		if err != nil {
			problems = append(problems, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		key := [3]string{row.Name, row.State, row.Postcode}
		if seen[key] {
			continue
		}
		seen[key] = true
		rows = append(rows, row)
	}

	if len(problems) > 0 {
		return nil, &ParseError{Problems: problems}
	}
	if len(rows) == 0 {
		// An empty dataset is never a legitimate outcome — it means the wrong file, or a file whose
		// columns did not survive whatever produced it. Loading it would empty the table.
		return nil, fmt.Errorf("localityload: dataset contained no usable rows")
	}
	return rows, nil
}

// rowFrom validates one record. Each failure is distinguishable, because "which rule did this row
// break" is the only useful thing to tell an operator staring at 18 000 lines.
func rowFrom(rec []string, idx columns) (Row, error) {
	// ⚠ `i < 0` is not defensive padding — it is the ABSENT-COLUMN case. latitude/longitude are
	// optional, so their index is -1 on a pre-032 dataset, and without this guard rec[-1] panics on
	// the very first row. Caught by the existing 030 tests the moment the columns were added.
	get := func(i int) string {
		if i < 0 || i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}

	name := get(idx.name)
	state := strings.ToUpper(get(idx.state))
	postcode := get(idx.postcode)

	if name == "" {
		return Row{}, fmt.Errorf("blank locality name")
	}
	if !states[state] {
		return Row{}, fmt.Errorf("unknown state %q (want one of ACT NSW NT QLD SA TAS VIC WA)", state)
	}
	// ⚠ Length AND digits, both, and NO padding. NT postcodes begin 08xx — a pipeline that read this
	// column as a number turned 0800 into 800, and left-padding it back to "0800" here would hide that
	// the dataset had already been corrupted. Reject, and let the operator fix the source.
	if len(postcode) != 4 || !allDigits(postcode) {
		return Row{}, fmt.Errorf("postcode %q is not exactly four digits (⚠ if this looks like a truncated leading zero, the dataset was read as numbers somewhere upstream)", postcode)
	}

	lat, lon, err := parsePoint(get(idx.lat), get(idx.lon))
	if err != nil {
		return Row{}, err
	}
	return Row{Name: name, State: state, Postcode: postcode, Lat: lat, Lon: lon}, nil
}

// parsePoint reads the optional coordinate pair (032).
//
// ⚠ Three outcomes, and conflating any two of them is a defect:
//
//	both blank  -> (nil, nil, nil)  "we do not know where this is"      — legitimate and common
//	one blank   -> error                                                 — a BROKEN row, not an absence
//	out of range-> error                                                 — a misread column
//
// Treating a half-present pair as "unknown" would hide a real parsing fault behind a gap that looks
// legitimate, which is precisely how 030's street-names-as-suburbs defect survived: every row was
// well-formed, so nothing complained.
func parsePoint(latS, lonS string) (*float64, *float64, error) {
	if latS == "" && lonS == "" {
		return nil, nil, nil
	}
	if latS == "" || lonS == "" {
		return nil, nil, fmt.Errorf("half a coordinate: latitude %q, longitude %q (a row has both or neither)", latS, lonS)
	}
	lat, err := strconv.ParseFloat(latS, 64)
	if err != nil {
		return nil, nil, fmt.Errorf("latitude %q is not a number", latS)
	}
	lon, err := strconv.ParseFloat(lonS, 64)
	if err != nil {
		return nil, nil, fmt.Errorf("longitude %q is not a number", lonS)
	}
	if math.IsNaN(lat) || math.IsInf(lat, 0) || math.IsNaN(lon) || math.IsInf(lon, 0) {
		return nil, nil, fmt.Errorf("coordinate is not finite: %v, %v", lat, lon)
	}
	if lat < minLat || lat > maxLat || lon < minLon || lon > maxLon {
		return nil, nil, fmt.Errorf(
			"coordinate %v,%v is outside Australia (⚠ latitude and longitude swapped? G-NAF lists longitude first)", lat, lon)
	}
	return &lat, &lon, nil
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

type columns struct{ name, state, postcode, lat, lon int }

// columnIndexes locates the columns this feature needs, accepting the common header spellings the
// public datasets use.
//
// ⚠ `latitude`/`longitude` are OPTIONAL (index stays -1 → every row parses as "location unknown"), so
// a pre-032 dataset still loads rather than failing wholesale. The loader's own canary is what catches
// a dataset that ought to have coordinates and does not — see cmd/load-localities.
func columnIndexes(header []string) (columns, error) {
	idx := columns{name: -1, state: -1, postcode: -1, lat: -1, lon: -1}
	for i, h := range header {
		// ⚠ Strip a UTF-8 BOM: these datasets are routinely exported from spreadsheets, which prepend
		// one, and it would otherwise make the first column name unmatchable.
		switch strings.ToLower(strings.TrimSpace(strings.TrimPrefix(h, "\ufeff"))) {
		case "locality", "name", "suburb", "place_name":
			if idx.name < 0 {
				idx.name = i
			}
		case "state", "state_code", "state_abbreviation":
			if idx.state < 0 {
				idx.state = i
			}
		case "postcode", "post_code", "postal_code":
			if idx.postcode < 0 {
				idx.postcode = i
			}
		case "latitude", "lat":
			if idx.lat < 0 {
				idx.lat = i
			}
		case "longitude", "lon", "lng", "long":
			if idx.lon < 0 {
				idx.lon = i
			}
		}
	}
	// ⚠ One coordinate column without the other is a malformed HEADER, refused before a single row is
	// read. Otherwise every row would trip the "half a coordinate" check and the operator would get
	// 15 000 identical errors instead of one that names the actual problem.
	if (idx.lat < 0) != (idx.lon < 0) {
		return columns{}, fmt.Errorf(
			"localityload: dataset has one coordinate column but not the other (latitude=%d, longitude=%d)", idx.lat, idx.lon)
	}
	var missing []string
	if idx.name < 0 {
		missing = append(missing, "locality/name/suburb")
	}
	if idx.state < 0 {
		missing = append(missing, "state")
	}
	if idx.postcode < 0 {
		missing = append(missing, "postcode")
	}
	if len(missing) > 0 {
		return columns{}, fmt.Errorf("localityload: dataset is missing required column(s): %s", strings.Join(missing, ", "))
	}
	return idx, nil
}

// ParseError carries every problem found, not just the first. An operator fixing a dataset wants the
// whole list in one pass.
type ParseError struct{ Problems []string }

func (e *ParseError) Error() string {
	const show = 20
	shown := e.Problems
	suffix := ""
	if len(shown) > show {
		shown, suffix = shown[:show], fmt.Sprintf("\n  … and %d more", len(e.Problems)-show)
	}
	return fmt.Sprintf("localityload: %d malformed row(s):\n  %s%s",
		len(e.Problems), strings.Join(shown, "\n  "), suffix)
}
