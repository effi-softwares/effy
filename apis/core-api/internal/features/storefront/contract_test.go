package storefront

import (
	"encoding/json"
	"sort"
	"testing"
)

// The Go wire DTOs are hand-authored to the SAME documented contract the TS `@effy/shared-types` DTOs
// define (Principle II — Go cannot import TS; contracts/shared-dtos.md is the single source, and the KMP
// Kotlin is generated from it). This test is the Go half of the drift guard: it marshals each DTO and
// asserts its JSON key set matches the TS interface field-for-field, so a renamed/added/dropped tag
// fails the build here rather than silently breaking a client.

func keysOf(t *testing.T, v any) []string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func assertKeys(t *testing.T, name string, v any, want []string) {
	t.Helper()
	got := keysOf(t, v)
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("%s: key count %v != %v", name, got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s: keys drifted\n got:  %v\n want: %v", name, got, want)
		}
	}
}

func TestProductCardDTOMatchesContract(t *testing.T) {
	// storefront.ts StorefrontProductCardDTO
	assertKeys(t, "StorefrontProductCardDTO", productCardDTO{}, []string{
		"id", "name", "brand", "imageUrl", "priceAmount", "currency", "compareAtAmount", "badges", "available",
	})
}

func TestProductDetailDTOMatchesContract(t *testing.T) {
	// storefront.ts StorefrontProductDetailDTO (extends the card + these)
	assertKeys(t, "StorefrontProductDetailDTO", productDetailDTO{}, []string{
		"id", "name", "brand", "imageUrl", "priceAmount", "currency", "compareAtAmount", "badges", "available",
		"longDescription", "gallery", "attributes", "categoryPath",
	})
}

func TestCategoryDTOMatchesContract(t *testing.T) {
	// storefront.ts StorefrontCategoryDTO
	assertKeys(t, "StorefrontCategoryDTO", categoryDTO{}, []string{"key", "name", "parentKey"})
}
