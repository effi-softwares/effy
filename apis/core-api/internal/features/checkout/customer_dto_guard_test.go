package checkout

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// ⚠ WHAT A CUSTOMER IS NEVER TOLD ABOUT A DELIVERY SLOT (069 FR-050, contract §5).
//
// How full a slot is, is Effy's operational business: "2 left" is a pressure tactic nobody asked for,
// and a count would let anyone watch a competitor-grade picture of the evening's demand fill up. That
// a late payer took a slot over its capacity is a fact for dispatch, not for the person who paid.
// And — as on every customer contract since 047 — nothing may identify a shop.
//
// This walks the wire TYPES rather than one response, so a field added to any of them next year is
// checked without anyone remembering this file exists.

var forbiddenCustomerKeys = []string{
	"capacity", "booked", "remaining", "overcapacity", "over_capacity", "load", "shopid", "shop_id", "shopname",
}

func jsonKeysOf(t reflect.Type, seen map[reflect.Type]bool, out *[]string) {
	for t.Kind() == reflect.Pointer || t.Kind() == reflect.Slice || t.Kind() == reflect.Array {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct || seen[t] {
		return
	}
	seen[t] = true
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag := strings.Split(f.Tag.Get("json"), ",")[0]
		if tag != "" && tag != "-" {
			*out = append(*out, tag)
		}
		jsonKeysOf(f.Type, seen, out)
	}
}

func TestCustomerDeliveryDTOs_CarryNoCapacityAndNoShop(t *testing.T) {
	types := []any{deliveryQuoteDTO{}, slotOptionDTO{}, standardDayDTO{}, deliveryChoiceRefusal{}, createIntentResponse{}}

	var keys []string
	for _, v := range types {
		jsonKeysOf(reflect.TypeOf(v), map[reflect.Type]bool{}, &keys)
	}
	if len(keys) < 20 {
		t.Fatalf("only %d keys found — the walk is not reaching the wire types", len(keys))
	}
	for _, k := range keys {
		lower := strings.ToLower(k)
		for _, bad := range forbiddenCustomerKeys {
			if strings.Contains(lower, bad) {
				t.Errorf("customer wire key %q must not exist: it would disclose %q", k, bad)
			}
		}
	}
}

// And the bytes themselves, for a quote built from a domain value that DOES know the shop ids and the
// slot's identity: none of it may survive the mapping.
func TestCustomerQuoteBytes_NameNoShopAndNoCapacity(t *testing.T) {
	now := time.Date(2026, 8, 24, 9, 0, 0, 0, delivery.MelbourneTZ)
	dto := toQuoteDTO(DeliveryQuote{
		Postcode: "3121", Serviced: true, ExpiresAt: now,
		Packages: []DeliveryQuotePackage{{ShopRef: "pkg-1", Options: []DeliveryQuoteOption{{Method: "standard", FeeCents: 600}}}},
		SameDaySlots: []delivery.OpenSlot{{
			ID: "33333333-3333-3333-3333-333333333333", Date: "2026-08-24",
			Start: now.Add(8 * time.Hour), End: now.Add(10 * time.Hour), Cutoff: now.Add(5 * time.Hour),
		}},
		StandardDays: []string{"2026-08-25"},
	})
	b, err := json.Marshal(dto)
	if err != nil {
		t.Fatal(err)
	}
	body := strings.ToLower(string(b))
	for _, bad := range forbiddenCustomerKeys {
		if strings.Contains(body, `"`+bad) {
			t.Errorf("the quote JSON contains %q:\n%s", bad, b)
		}
	}
	// The only handle on a package is the opaque one (047 FR-033).
	if !strings.Contains(string(b), `"shopRef":"pkg-1"`) {
		t.Errorf("the opaque package handle is missing:\n%s", b)
	}
}
