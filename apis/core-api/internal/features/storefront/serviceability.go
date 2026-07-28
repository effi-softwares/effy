// Up-front delivery serviceability (025 US1 / FR-014). The storefront answers "do we deliver to you?"
// BEFORE a cart exists, so a shopper learns it in the header rather than at payment.
package storefront

import (
	"context"
	"errors"
	"reflect"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
)

// ErrInvalidPostcode means the caller sent something that is not a postcode at all.
//
// It is deliberately distinct from "not serviced". The handler turns it into a 400, never into
// serviced:false — telling someone who typoed that Effy refuses to deliver to them is a customer lost
// for no reason, and it is not even true.
var ErrInvalidPostcode = errors.New("storefront: invalid postcode")

// ServiceabilityResult is the whole customer-visible answer.
//
// ⚠ Do not add fields here. FR-014a forbids quoting a delivery fee or window before checkout (both
// depend on cart contents and origin zone, so anything shown now is an estimate checkout would
// revise), and FR-006 forbids exposing a zone id or name (zone names are geographic — echoing one
// tells a shopper where Effy fulfils from). A boolean leaks nothing and answers the question asked.
// A test asserts this shape.
type ServiceabilityResult struct {
	Postcode string
	Serviced bool
}

// Serviceability answers whether Effy delivers to a postcode.
//
// The lookup runs through the shared predicate that checkout also uses, so this answer and the one a
// shopper gets at payment cannot disagree (FR-014b).
func (s *Service) Serviceability(ctx context.Context, rawPostcode string) (ServiceabilityResult, error) {
	postcode, ok := delivery.NormalizePostcode(rawPostcode)
	if !ok {
		// Rejected before touching the database — a malformed postcode is not a question worth asking.
		return ServiceabilityResult{}, ErrInvalidPostcode
	}

	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	serviced, err := s.repo.Serviceable(ctx, postcode)
	if err != nil {
		// Propagate. The handler says "we couldn't check right now"; it must never degrade a broken
		// read into a refusal.
		return ServiceabilityResult{}, err
	}
	return ServiceabilityResult{Postcode: postcode, Serviced: serviced}, nil
}

// reflectFieldNames backs the shape assertion in serviceability_test.go — it keeps a future field
// addition from silently widening what this endpoint discloses.
func reflectFieldNames(v any) []string {
	t := reflect.TypeOf(v)
	names := make([]string, 0, t.NumField())
	for i := range t.NumField() {
		names = append(names, t.Field(i).Name)
	}
	return names
}
