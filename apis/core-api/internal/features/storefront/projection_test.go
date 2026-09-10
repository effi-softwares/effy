package storefront

import (
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// This file exists because of a live 503.
//
// pgx.RowToStructByName requires a row struct to match its result set EXACTLY — a column with no
// field is a scan error, not a silently-ignored extra. 054 added `available` to cardColumns and to
// cardRow but missed searchRow, which restated the same fields by hand. Every search then failed in
// production with `struct doesn't have corresponding row field available`, while `go test` stayed
// green: SearchCards is only ever reached through a fake, so no test in this package had ever
// scanned the real projection into the real struct.
//
// These tests need no database. They compare the SQL text this package ships against the structs it
// scans into, which is the exact agreement the fakes cannot check.

// sqlComment strips `-- …` to end of line so prose in the projection is never mistaken for SQL.
var sqlComment = regexp.MustCompile(`--[^\n]*`)

// aliasRe finds the `AS <name>` alias of each projected column.
var aliasRe = regexp.MustCompile(`(?i)\bAS\s+([a-z_][a-z0-9_]*)`)

// projectedAliases returns the column names cardColumns actually emits, in sorted order.
func projectedAliases(t *testing.T) []string {
	t.Helper()
	stripped := sqlComment.ReplaceAllString(cardColumns, "")
	matches := aliasRe.FindAllStringSubmatch(stripped, -1)
	if len(matches) == 0 {
		t.Fatal("no aliases parsed from cardColumns — the projection or this parser has changed shape")
	}
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		out = append(out, strings.ToLower(m[1]))
	}
	sort.Strings(out)
	return out
}

// dbTags returns the `db:"…"` tags of a row struct, flattening anonymous embedded structs the way
// pgx does, in sorted order.
func dbTags(t *testing.T, v any) []string {
	t.Helper()
	var walk func(reflect.Type) []string
	walk = func(rt reflect.Type) []string {
		var out []string
		for i := 0; i < rt.NumField(); i++ {
			sf := rt.Field(i)
			if sf.Anonymous && sf.Type.Kind() == reflect.Struct {
				out = append(out, walk(sf.Type)...)
				continue
			}
			tag := sf.Tag.Get("db")
			if tag == "" || tag == "-" {
				t.Fatalf("%s.%s has no db tag — pgx would not be able to match it", rt.Name(), sf.Name)
			}
			out = append(out, tag)
		}
		return out
	}
	out := walk(reflect.TypeOf(v))
	sort.Strings(out)
	return out
}

// TestCardRowMatchesProjection is the direct proof: the non-search reads scan cardSelect into
// cardRow, so their columns and fields must be the same set.
func TestCardRowMatchesProjection(t *testing.T) {
	got := dbTags(t, cardRow{})
	want := projectedAliases(t)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("cardRow does not match cardColumns\n  struct: %v\n  columns: %v", got, want)
	}
}

// TestSearchRowMatchesProjectionPlusScore is the one that would have caught the outage. SearchCards
// selects cardColumns verbatim and appends exactly one score column.
func TestSearchRowMatchesProjectionPlusScore(t *testing.T) {
	want := append(projectedAliases(t), "score")
	sort.Strings(want)
	got := dbTags(t, searchRow{})
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("searchRow does not match cardColumns + score\n  struct: %v\n  columns: %v", got, want)
	}
}

// TestSearchRowCarriesEveryCardField guards the SECOND half of the same defect. Fixing only the scan
// would leave card() dropping `available`, so every search result would render unavailable — which
// looks like catalogue data, not a bug. Every cardRow field must survive the projection.
func TestSearchRowCarriesEveryCardField(t *testing.T) {
	full := cardRow{
		ID: "p1", Name: "One", PriceAmount: "1.00", Currency: "AUD", Available: true,
	}
	if got := (searchRow{cardRow: full, Score: 0.5}).card(); !reflect.DeepEqual(got, full) {
		t.Fatalf("card() lost fields in projection\n  got:  %+v\n  want: %+v", got, full)
	}
}
