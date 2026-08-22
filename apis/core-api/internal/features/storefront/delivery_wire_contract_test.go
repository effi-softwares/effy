package storefront

import (
	"encoding/json"
	"testing"
)

// ⚠ Wire contract for the public delivery reads (047, research R14). The customer-mobile
// DeliveryWireContractTest.kt parses the SAME literals. The frozen two-field serviceability shape and
// the three-string locality shape are exactly the kind that drift silently on a JSON-tag rename.

const serviceabilityWire = `{"postcode":"3121","serviced":true}`
const localityWire = `{"name":"Richmond","state":"VIC","postcode":"3121"}`

func TestWireContract_Serviceability(t *testing.T) {
	b, err := json.Marshal(serviceabilityDTO{Postcode: "3121", Serviced: true})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != serviceabilityWire {
		t.Errorf("serviceability wire drift:\n got  %s\n want %s", b, serviceabilityWire)
	}
}

func TestWireContract_Locality(t *testing.T) {
	b, err := json.Marshal(localityDTO{Name: "Richmond", State: "VIC", Postcode: "3121"})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != localityWire {
		t.Errorf("locality wire drift:\n got  %s\n want %s", b, localityWire)
	}
}
