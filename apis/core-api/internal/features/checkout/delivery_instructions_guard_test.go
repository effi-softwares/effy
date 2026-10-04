package checkout

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 066 — THE HOT PATH NEVER READS AN ADDRESS'S SAVED DEFAULT.
//
// An order stores exactly what its own checkout request carried. Prefilling from the address is the
// client's job. That is what makes spec US4 true by construction: editing or deleting an address
// cannot change a placed order, because nothing on the server ever copied from it.
//
// The moment someone "helpfully" falls back to the address's default when a request carries no
// instructions, a customer who deliberately cleared the note gets their saved one delivered anyway —
// and every test passes, because both values are valid. This reads the source and fails naming the
// file, the way the availability guard does.
func TestHotPathNeverReadsAnAddressDefault(t *testing.T) {
	for _, dir := range []string{".", filepath.Join("..", "orders")} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read %s: %v", dir, err)
		}
		seen := 0
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
				continue
			}
			seen++
			body, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil {
				t.Fatalf("read %s: %v", name, err)
			}
			for _, banned := range []string{"default_delivery_note", "default_delivery_handover"} {
				if strings.Contains(string(body), banned) {
					t.Errorf("%s references %s — the hot path must store only what the request carried (066 R4)",
						filepath.Join(dir, name), banned)
				}
			}
		}
		if seen == 0 {
			t.Fatalf("%s: no source files scanned — this guard would pass vacuously", dir)
		}
	}
}
