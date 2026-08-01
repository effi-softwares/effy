package delivery

import "math"

// Point is a location on the earth. Populated from public.postcode_centroid.
//
// ⚠ Never exposed to a customer, at any granularity (FR-034). A distance is a strong signal of WHICH
// SHOP is fulfilling — "9 km away" narrows it considerably in a metro area — and hidden fulfilment is
// a founding rule of this platform. It is computed, used to pick a band, and discarded.
type Point struct {
	Lat float64
	Lon float64
}

// earthRadiusKm is the mean radius. The ellipsoid's equatorial and polar radii differ by ~0.3%, which
// is far inside the error already accepted by using straight-line rather than road distance.
const earthRadiusKm = 6371.0088

// Distance returns the great-circle distance in kilometres between two points.
//
// ⚠ IT RETURNS (0, false) WHEN EITHER POINT IS UNKNOWN, AND THAT SIGNATURE IS THE WHOLE DESIGN.
// A plain float64 would make "we do not know where this is" and "it is right here" the same value, so
// the most remote postcode in the country — the one whose location we happen not to have — would price
// as the cheapest to deliver to, with nothing reporting a fault. The bool forces every caller to decide
// what unknown means; the pricing core answers "the furthest band" (FR-038), which is the safe
// direction to be wrong in.
//
// ⚠ THIS IS STRAIGHT-LINE DISTANCE, AND THE PLATFORM DOES NOT PRETEND OTHERWISE. Melbourne to Ballarat
// is 107 km straight and roughly 115 km by road — about 7% under. Two things absorb that: fees are
// BANDED, so a 7% error usually falls inside a band, and they are rounded UP. Where the number is shown
// to a human at all — the same-day approval screen — it is labelled "straight-line", because 031's
// mistake was reporting a signal ("a shop is nearby") that a reader would take to mean something
// stronger than it did. A routing provider was rejected in 030 and again here: it is an external
// dependency on the customer-facing price path, where an outage would stop checkout quoting at all.
func Distance(a, b *Point) (float64, bool) {
	if a == nil || b == nil {
		return 0, false
	}
	// Haversine. Chosen over the spherical law of cosines because that formula loses precision for
	// small distances — and small distances are exactly where same-day decisions are made.
	lat1 := a.Lat * math.Pi / 180
	lat2 := b.Lat * math.Pi / 180
	dLat := lat2 - lat1
	dLon := (b.Lon - a.Lon) * math.Pi / 180

	sinLat := math.Sin(dLat / 2)
	sinLon := math.Sin(dLon / 2)
	h := sinLat*sinLat + math.Cos(lat1)*math.Cos(lat2)*sinLon*sinLon
	return 2 * earthRadiusKm * math.Asin(math.Sqrt(math.Min(1, h))), true
}
