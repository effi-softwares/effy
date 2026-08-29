package availability_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// ⚠ THE GUARD FOR FR-012 / SC-012.
//
// The availability rule is one definition in one package. Nothing in Go can enforce that — a
// developer adding a rail, a filter or a new read can perfectly reasonably write
// `WHERE p.status = 'active'`, ship it green, and leave one surface selling something the shop does
// not have. There is no error, no log line and no failing assertion when that happens; the product
// simply appears for sale.
//
// This platform has shipped that exact shape twice. customer-web's `summarizeFulfillment` was a
// second implementation of the order-progress rule and was deleted for it in 052; `TrackStage` still
// is one (gap register G4). Both survived review because two implementations of one rule do not
// conflict — they diverge, quietly, later.
//
// So the rule is enforced the way 039's storefront locks and the token drift checks are: by a test
// that reads the source and FAILS NAMING THE FILE.
//
// Prove it works by reverting one adoption site — quickstart §2a.

// Anything comparing a lifecycle status to 'active' directly, under any alias.
var handWritten = regexp.MustCompile(`\b([a-z_]+\.)?status\s*(=|==|!=|<>)\s*['"]active['"]`)

// ⚠ THE ONLY WAY PAST THIS GUARD is a comment carrying this token within the eight lines above the
// match, saying WHICH TABLE is meant and why the product rule does not apply.
//
// A per-file allow-list was the first draft and was thrown away: it puts the justification in a test
// nobody reads while editing, and it exempts a whole file forever on the strength of one line that
// was fine at the time. A marker at the point of use travels with the code, has to be written by
// whoever adds the line, and dies when the line does.
const exemptMarker = "availability-exempt:"

func exempt(lines []string, i int) bool {
	from := i - 8
	if from < 0 {
		from = 0
	}
	return strings.Contains(strings.Join(lines[from:i+1], "\n"), exemptMarker)
}

func TestNoHandWrittenProductAvailabilityOnTheHotPath(t *testing.T) {
	// The test runs from its own package directory; the hot path is rooted three levels up.
	const coreRoot = "../../.."
	roots := []string{coreRoot + "/internal/features", coreRoot + "/internal/platform"}
	var offences []string

	for _, root := range roots {
		err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") {
				return err
			}
			if strings.HasSuffix(path, "_test.go") || strings.Contains(path, "platform/availability") {
				return nil
			}
			body, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			lines := strings.Split(string(body), "\n")
			for i, line := range lines {
				if !handWritten.MatchString(line) {
					continue
				}
				// A comment describing the rule is not an implementation of it.
				if t := strings.TrimSpace(line); strings.HasPrefix(t, "//") || strings.HasPrefix(t, "--") {
					continue
				}
				// An exemption must justify itself where it lives, or it fails here.
				if exempt(lines, i) {
					continue
				}
				offences = append(offences, rel(path)+":"+itoa(i+1)+"  "+strings.TrimSpace(line))
			}
			return nil
		})
		if err != nil {
			t.Fatalf("walking %s: %v", root, err)
		}
	}

	if len(offences) > 0 {
		t.Fatalf(
			"availability is decided by hand in %d place(s). Use availability.Predicate(alias) in SQL or\n"+
				"availability.Purchasable(...) in Go — FR-012 requires ONE rule, and a second one will not\n"+
				"conflict with the first, it will quietly disagree with it. If the line is about some OTHER\n"+
				"table, say so with an `%s <table>` comment above it:\n\n  %s\n",
			len(offences), exemptMarker, strings.Join(offences, "\n  "),
		)
	}
}

// rel strips the walk prefix so a failure names the file the way a developer would type it.
func rel(path string) string {
	return strings.TrimPrefix(filepath.ToSlash(path), "../../../")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
