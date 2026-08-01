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
	"strings"
)

// Row is one locality as the dataset supplies it. The triple is the whole record — see
// specs/030-delivery-location-suburb/data-model.md for why no two of the three identify a place.
type Row struct {
	Name     string
	State    string
	Postcode string
}

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
		seen     = map[Row]bool{}
		line     = 1 // the header was line 1; data starts at 2
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
		if seen[row] {
			continue
		}
		seen[row] = true
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
	get := func(i int) string {
		if i >= len(rec) {
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
	return Row{Name: name, State: state, Postcode: postcode}, nil
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

type columns struct{ name, state, postcode int }

// columnIndexes locates the three columns this feature needs, accepting the common header spellings
// the public datasets use.
func columnIndexes(header []string) (columns, error) {
	idx := columns{name: -1, state: -1, postcode: -1}
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
		}
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
