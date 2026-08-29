package checkout

import (
	"os"
	"testing"
)

// storeSource reads store.go so the SQL-shape tests above can assert on statements that only a live
// database could otherwise exercise. A weaker proof than executing them, and labelled as such.
func storeSource(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("store.go")
	if err != nil {
		t.Fatalf("reading store.go: %v", err)
	}
	return string(b)
}
