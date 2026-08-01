package storefront

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
)

// recordingMetrics captures what the handler reported, so the privacy rule (FR-047) can be asserted
// rather than assumed.
type recordingMetrics struct {
	localityCalls []bool
	serviceCalls  []bool
}

func (m *recordingMetrics) RecordServiceability(serviced bool) {
	m.serviceCalls = append(m.serviceCalls, serviced)
}
func (m *recordingMetrics) RecordLocalityLookup(found bool) {
	m.localityCalls = append(m.localityCalls, found)
}

func localityRouter(repo Reader, rec ServiceabilityRecorder) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(httpx.RequestIDMiddleware())
	r.NoRoute(httpx.NotFound)
	Register(r.Group("/v1"), NewHandler(NewService(repo, nil), rec))
	return r
}

func getLocalities(t *testing.T, r *gin.Engine, query string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/v1/storefront/localities?q="+query, nil))
	return w
}

func TestGetLocalities_ReturnsTheTriple(t *testing.T) {
	repo := &fakeReader{localities: []Locality{{Name: "Richmond", State: "VIC", Postcode: "3121"}}}
	w := getLocalities(t, localityRouter(repo, nil), "richmo")

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	var out []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("body is not a JSON array: %v (%s)", err, w.Body.String())
	}
	if len(out) != 1 {
		t.Fatalf("want 1 place, got %d", len(out))
	}
	for _, k := range []string{"name", "state", "postcode"} {
		if _, ok := out[0][k]; !ok {
			t.Errorf("missing required field %q — a place needs all three to be identifiable (FR-008)", k)
		}
	}
	if len(out[0]) != 3 {
		t.Errorf("want exactly 3 fields, got %d: %v", len(out[0]), out[0])
	}
}

// ⚠ THE MOST IMPORTANT ASSERTION IN THIS ENDPOINT.
//
// "We have never heard of that place" must be structurally distinguishable from "we do not deliver
// there". A 404 here would invite a client to render the two the same way, and telling a prospective
// customer that Effy refuses to serve them because they mistyped a suburb is the exact outcome the
// delivery-location capability exists to prevent (FR-012).
func TestGetLocalities_NoMatchIs200WithAnEmptyArrayNotA404(t *testing.T) {
	w := getLocalities(t, localityRouter(&fakeReader{localities: nil}, nil), "zzzzqqq")

	if w.Code != http.StatusOK {
		t.Fatalf("want 200 for an unmatched query, got %d — an unrecognised place is not an error", w.Code)
	}
	// ⚠ `[]`, not `null`. A client forced to distinguish null-from-empty will eventually get it wrong.
	if got := w.Body.String(); got != "[]" {
		t.Errorf("want an empty JSON array, got %q", got)
	}
}

func TestGetLocalities_ShortQueryIs400NotAnEmptyList(t *testing.T) {
	w := getLocalities(t, localityRouter(&fakeReader{}, nil), "r")

	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["error"] != "invalid_query" {
		t.Errorf("want error invalid_query, got %v", body["error"])
	}
	// ⚠ And it must NOT be an empty array — "keep typing" and "no such place" are different messages.
	if w.Body.String() == "[]" {
		t.Error("too-short input was reported as 'no places found'")
	}
}

// ⚠ A failed read must never degrade into an empty list. An outage would then read to the shopper as
// "that place does not exist" — a false statement about the world, caused by us (FR-013).
func TestGetLocalities_ReadFailureIs503NotAnEmptyList(t *testing.T) {
	repo := &fakeReader{localityErr: errors.New("db down")}
	w := getLocalities(t, localityRouter(repo, nil), "richmo")

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d: %s", w.Code, w.Body.String())
	}
	if w.Body.String() == "[]" {
		t.Error("a broken read was reported as 'no places found'")
	}
}

func TestGetLocalities_IsCacheable(t *testing.T) {
	repo := &fakeReader{localities: []Locality{{Name: "Richmond", State: "VIC", Postcode: "3121"}}}
	w := getLocalities(t, localityRouter(repo, nil), "richmo")

	if got := w.Header().Get("Cache-Control"); got != "public, max-age=86400" {
		t.Errorf("want a public day-long cache, got %q", got)
	}
}

// ⚠ FR-047 / Principle VII. The metric records the OUTCOME and nothing else. The query is a partial
// place name — location data about an individual, and unbounded as a label value.
func TestGetLocalities_RecordsOutcomeOnlyAndNotTheQuery(t *testing.T) {
	rec := &recordingMetrics{}
	repo := &fakeReader{localities: []Locality{{Name: "Richmond", State: "VIC", Postcode: "3121"}}}
	r := localityRouter(repo, rec)

	getLocalities(t, r, "richmo")
	if len(rec.localityCalls) != 1 || !rec.localityCalls[0] {
		t.Errorf("want one 'found' lookup recorded, got %v", rec.localityCalls)
	}

	repo.localities = nil
	getLocalities(t, r, "zzzzqqq")
	if len(rec.localityCalls) != 2 || rec.localityCalls[1] {
		t.Errorf("want a second, 'not_found' lookup recorded, got %v", rec.localityCalls)
	}
}

// Malformed input is NOT counted — it was never a question about a place, and counting it would
// inflate not_found with keystrokes still being typed, making the dataset look wrong when it is not.
func TestGetLocalities_DoesNotCountMalformedInput(t *testing.T) {
	rec := &recordingMetrics{}
	getLocalities(t, localityRouter(&fakeReader{}, rec), "r")

	if len(rec.localityCalls) != 0 {
		t.Errorf("want no lookup recorded for invalid input, got %v", rec.localityCalls)
	}
}

// A missing `q` is the same as a too-short one: a question we cannot answer, not a refusal.
func TestGetLocalities_MissingQueryIs400(t *testing.T) {
	w := httptest.NewRecorder()
	localityRouter(&fakeReader{}, nil).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/v1/storefront/localities", nil))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

// The handler must tolerate a nil recorder — main is the only caller that has one.
func TestGetLocalities_WorksWithoutMetrics(t *testing.T) {
	repo := &fakeReader{localities: []Locality{{Name: "Richmond", State: "VIC", Postcode: "3121"}}}
	if w := getLocalities(t, localityRouter(repo, nil), "richmo"); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
}
