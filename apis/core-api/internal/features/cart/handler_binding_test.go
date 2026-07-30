package cart

import (
	"encoding/json"
	"testing"
)

// ── The wire shape of a cart write (027 research R13) ───────────────────────────────────────────
//
// ⚠ These tests exist because of a bug that no amount of service-level testing could reach. The Kotlin
// contract typed `quantity` as `Double` (TypeScript `number` → JSON Schema `"number"` → Kotlin `Double`),
// so `kotlinx.serialization` sent `{"quantity":1.0}` — and Go's `encoding/json` CANNOT unmarshal `1.0`
// into an `int`. Every customer-mobile cart write bound-failed and answered 422, while `customer-web`
// worked because JavaScript serialises an integer as `1`.
//
// The contract now declares these fields `@asType integer`, so a whole number goes on the wire. This is
// the test that fails if that ever regresses — at the DTO, where the break actually was.

func TestAddToCartRequestBindsAWholeNumberQuantity(t *testing.T) {
	const body = `{"productId":"11111111-1111-1111-1111-111111111111","quantity":2,"changeId":"c1"}`

	var req addToCartRequest
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		t.Fatalf("a whole-number quantity must bind: %v", err)
	}
	if req.Quantity != 2 {
		t.Errorf("quantity = %d, want 2", req.Quantity)
	}
	if req.ChangeID != "c1" {
		t.Errorf("changeId = %q, want c1 — the field name on the wire is camelCase", req.ChangeID)
	}
}

// The regression itself: a client sending a float must NOT silently bind as zero, and the platform must
// not pretend it succeeded. Documented here so the failure mode is unambiguous if a client regresses.
func TestAFractionalQuantityIsRefusedRatherThanTruncated(t *testing.T) {
	const body = `{"productId":"11111111-1111-1111-1111-111111111111","quantity":1.0,"changeId":"c1"}`

	var req addToCartRequest
	err := json.Unmarshal([]byte(body), &req)
	if err == nil {
		t.Fatal("a float quantity must be refused — silently taking it as 0 would empty a shopper's line")
	}
	if req.Quantity != 0 {
		t.Errorf("nothing may be bound from a refused body, got quantity %d", req.Quantity)
	}
}

func TestUpdateCartLineRequestBindsAWholeNumberQuantity(t *testing.T) {
	var req updateCartLineRequest
	if err := json.Unmarshal([]byte(`{"quantity":7,"changeId":"c2"}`), &req); err != nil {
		t.Fatalf("a whole-number quantity must bind: %v", err)
	}
	if req.Quantity != 7 {
		t.Errorf("quantity = %d, want 7", req.Quantity)
	}
}

// changeId is optional on the idempotent operations, and its absence must not fail the bind.
func TestUpdateCartLineRequestBindsWithoutAChangeID(t *testing.T) {
	var req updateCartLineRequest
	if err := json.Unmarshal([]byte(`{"quantity":3}`), &req); err != nil {
		t.Fatalf("changeId is optional here: %v", err)
	}
	if req.Quantity != 3 || req.ChangeID != "" {
		t.Errorf("got %+v, want quantity 3 and no changeId", req)
	}
}

func TestMergeAndPreviewBindLineArrays(t *testing.T) {
	const body = `{"lines":[{"productId":"11111111-1111-1111-1111-111111111111","quantity":2},
	                        {"productId":"22222222-2222-2222-2222-222222222222","quantity":5}],"changeId":"m1"}`

	var req mergeCartRequest
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		t.Fatalf("merge body must bind: %v", err)
	}
	if len(req.Lines) != 2 || req.Lines[1].Quantity != 5 {
		t.Fatalf("got %+v, want two lines with the second at quantity 5", req.Lines)
	}
	if req.ChangeID != "m1" {
		t.Errorf("changeId = %q, want m1", req.ChangeID)
	}
}
