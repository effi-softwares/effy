package deliveryinstructions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// ⚠ THE SAME FILE THE TYPESCRIPT SUITE READS. The rule lives in
// packages/shared-types/src/delivery-instructions.ts; this package is its mirror. A unit test written
// here from the Go code would agree with the Go code — which is how 027's `1.0`-on-the-wire defect
// survived every test on both sides. Reading the other side's fixture is what makes disagreement
// visible.
type fixtureCase struct {
	Name   string          `json:"name"`
	Input  json.RawMessage `json:"input"`
	Expect struct {
		OK    bool `json:"ok"`
		Value *struct {
			Handover *string `json:"handover"`
			Note     *string `json:"note"`
		} `json:"value"`
		Field  string `json:"field"`
		Reason string `json:"reason"`
	} `json:"expect"`
}

func loadFixture(t *testing.T) []fixtureCase {
	t.Helper()
	path := filepath.Join("..", "..", "..", "..", "..", "packages", "shared-types", "src",
		"delivery-instructions.fixtures.json")
	body, err := os.ReadFile(path)
	require.NoError(t, err, "the shared fixture must be readable from the Go suite")
	var cases []fixtureCase
	require.NoError(t, json.Unmarshal(body, &cases))
	require.Greater(t, len(cases), 15, "an empty fixture would pass vacuously")
	return cases
}

func TestSharedFixture_GoAgreesWithTypeScript(t *testing.T) {
	for _, c := range loadFixture(t) {
		t.Run(c.Name, func(t *testing.T) {
			got, err := ParseJSON(c.Input)
			if !c.Expect.OK {
				require.Error(t, err)
				field, reason := FieldAndReason(err)
				require.Equal(t, c.Expect.Field, field)
				require.Equal(t, c.Expect.Reason, reason)
				return
			}
			require.NoError(t, err)
			require.Equal(t, c.Expect.Value.Handover, got.Handover)
			require.Equal(t, c.Expect.Value.Note, got.Note)
		})
	}
}

func TestAbsentFieldIsNoInstructions(t *testing.T) {
	got, err := ParseJSON(nil)
	require.NoError(t, err)
	require.True(t, got.Empty())
}

func TestNonObjectIsRefused(t *testing.T) {
	_, err := ParseJSON(json.RawMessage(`"leave it"`))
	require.Error(t, err)
}

// FR-028 — an error is the kind of value that ends up in a log line.
func TestErrorsNeverCarryTheSubmittedText(t *testing.T) {
	secret := strings.Repeat("GATE-CODE-4411 ", 30)
	body, _ := json.Marshal(map[string]any{"handover": nil, "note": secret})
	_, err := ParseJSON(body)
	require.ErrorIs(t, err, ErrNoteTooLong)
	require.NotContains(t, err.Error(), "4411")

	_, err = ParseJSON(json.RawMessage(`{"handover":"GATE-CODE-4411","note":null}`))
	require.ErrorIs(t, err, ErrHandoverInvalid)
	require.NotContains(t, err.Error(), "4411")
}
