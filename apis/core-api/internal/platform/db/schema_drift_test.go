package db_test

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// TestNoDroppedColumnIsStillReferenced fails when Go source names a column a migration has DROPPED.
//
// ── The defect this exists to make impossible ────────────────────────────────────────────────────
//
// 051's `PaymentProfile` selected `public.customer.display_name`. That column was dropped by
// `20260715090000_customer_name_parts.sql` and replaced with `given_name` + `family_name`. The query
// compiled, `go vet` was clean, every unit test passed — the fakes return strings and never touch
// Postgres — and the container-backed tests build their OWN tables, so they agreed with the code
// rather than with the schema. It failed only against the real database, in dev, AFTER deploy, as
// `column "display_name" does not exist`, and it 500'd EVERY checkout intent: not just saving a card,
// but paying at all.
//
// That is 027 R13's lesson again (a fixture agreeing with the code instead of with the world), and it
// is worth exactly one cheap static check.
//
// ── Scope, and why it is drawn exactly here ──────────────────────────────────────────────────────
//
// Two narrowings, and both were found by the check firing wrongly rather than by reasoning:
//
//  1. Only DROPs in a migration's **Up** section count. A `-- +goose Down` undoes an ADD, so the
//     columns it drops are live ones (`has_password`, `phone`, `stripe_customer_id` are each dropped
//     in a Down) and honouring those would ban most of the schema.
//
//  2. ⚠ A column can be dropped and LATER RE-ADDED, so only the LAST action on a name counts. The
//     delivery withdrawal dropped `product.weight_grams` and `delivery_ring_price.price_amount`;
//     047 brought both back. A first cut flagged them and was wrong.
//
// This proves a column is not referenced AFTER being dropped. It does NOT prove every referenced
// column exists — that needs the real schema, and the honest way to get it is a container-backed test
// that runs `db/migrations` for real.
//
// ⚠ It is also name-scoped, not table-scoped: a name dropped from one table and live on another reads
// as live. That is the deliberate trade for a check with no schema engine in it.
func TestNoDroppedColumnIsStillReferenced(t *testing.T) {
	root := repoRoot(t)

	dropped := columnsLeftDropped(t, filepath.Join(root, "db", "migrations"))
	if len(dropped) == 0 {
		t.Skip("no column has been dropped by a migration yet — nothing to guard")
	}

	// A dropped name is only interesting inside a SQL string. Matching bare identifiers would flag a
	// Go field or a comment, so this looks for the name with a word boundary inside raw/quoted strings.
	for _, column := range dropped {
		pattern := regexp.MustCompile(`\b` + regexp.QuoteMeta(column) + `\b`)
		for _, file := range goSources(t, filepath.Join(root, "apis", "core-api")) {
			body, err := os.ReadFile(file)
			if err != nil {
				t.Fatalf("read %s: %v", file, err)
			}
			for _, line := range codeLines(string(body)) {
				if pattern.MatchString(line) {
					rel, _ := filepath.Rel(root, file)
					t.Errorf(
						"%s references %q, which a migration DROPPED.\n  line: %s\n"+
							"  A query naming a column that does not exist compiles, passes every fake-backed "+
							"test, and 500s against the real database.",
						rel, column, strings.TrimSpace(line),
					)
				}
			}
		}
	}
}

var (
	reDropColumn  = regexp.MustCompile(`(?i)DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)`)
	reAddColumn   = regexp.MustCompile(`(?i)ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)`)
	reGooseDown   = regexp.MustCompile(`(?m)^\s*--\s*\+goose\s+Down\s*$`)
	reCreateTable = regexp.MustCompile(`(?is)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z_."]+\s*\((.*?)\n\);`)
	reColumnDef   = regexp.MustCompile(`(?m)^\s{2,}([a-z_][a-z0-9_]*)\s+[a-z]`)
)

// columnsLeftDropped replays every migration's Up half in filename order (which is goose's own order,
// the files being timestamped) and returns the names whose LAST action was a DROP.
func columnsLeftDropped(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := filepath.Glob(filepath.Join(dir, "*.sql"))
	if err != nil || len(entries) == 0 {
		t.Fatalf("no migrations found under %s (err=%v)", dir, err)
	}
	sort.Strings(entries)

	live := map[string]bool{}
	for _, path := range entries {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		up := string(body)
		if loc := reGooseDown.FindStringIndex(up); loc != nil {
			up = up[:loc[0]]
		}
		// A column arrives either in a CREATE TABLE body or as an ADD COLUMN; both count as "live".
		for _, table := range reCreateTable.FindAllStringSubmatch(up, -1) {
			for _, def := range reColumnDef.FindAllStringSubmatch(table[1], -1) {
				live[def[1]] = true
			}
		}
		for _, m := range reAddColumn.FindAllStringSubmatch(up, -1) {
			live[m[1]] = true
		}
		for _, m := range reDropColumn.FindAllStringSubmatch(up, -1) {
			live[m[1]] = false
		}
	}

	out := []string{}
	for column, alive := range live {
		if !alive {
			out = append(out, column)
		}
	}
	sort.Strings(out)
	return out
}

// codeLines returns the lines with comments removed.
//
// ⚠ IT DELIBERATELY DOES NOT TRY TO FIND "the SQL lines". A first cut kept only lines containing a
// quote character, on the theory that SQL lives in string literals — and it MISSED the very defect
// this test was written for, because this codebase writes SQL as multi-line raw strings and the
// offending line (`       COALESCE(display_name, ”)`) carried neither a backtick nor a double quote.
// A guard that cannot catch its own founding bug is decoration; proven by re-introducing the bug and
// watching this fail.
//
// Comments are stripped because the explanations around a fix name the dropped column on purpose —
// including the one directly above the corrected query in `checkout/store.go`.
func codeLines(body string) []string {
	var out []string
	inBlock := false
	for _, line := range strings.Split(body, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case inBlock:
			if strings.Contains(line, "*/") {
				inBlock = false
			}
			continue
		case strings.HasPrefix(trimmed, "/*"):
			if !strings.Contains(line, "*/") {
				inBlock = true
			}
			continue
		case strings.HasPrefix(trimmed, "//"):
			continue
		}
		if i := strings.Index(line, "//"); i >= 0 {
			line = line[:i]
		}
		out = append(out, line)
	}
	return out
}

func goSources(t *testing.T, dir string) []string {
	t.Helper()
	var out []string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		out = append(out, path)
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", dir, err)
	}
	return out
}

// repoRoot walks up until it finds the migrations directory, so the test does not care where it runs.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "db", "migrations")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatalf("could not find db/migrations above the working directory")
	return ""
}
