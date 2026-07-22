package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/pricing"
)

// scheduleHorizonDays bounds how far ahead a scheduled delivery date can be picked.
const scheduleHorizonDays = 7

var (
	// ErrQuoteExpired means the captured quote's validity window lapsed; the client must re-quote.
	ErrQuoteExpired = errors.New("checkout: delivery quote expired")
	// ErrSelectionInvalid means a selection references a package/method that is not in the captured quote.
	ErrSelectionInvalid = errors.New("checkout: delivery selection invalid")
	// ErrExclusionMismatch means excludedPackageKeys does not match the server's unserviceable set.
	ErrExclusionMismatch = errors.New("checkout: exclusion set does not match serviceability")
	// ErrNoServiceableItems means every package is undeliverable to the address (US2 block).
	ErrNoServiceableItems = errors.New("checkout: no items are deliverable to this address")
)

// DeliverySelection is the customer's chosen method for one package (no fee — the server prices it).
type DeliverySelection struct {
	PackageKey    string
	Method        string
	ScheduledDate string
}

// ── Domain: the quote as computed and as captured ──────────────────────────────────────────────

// QuoteOption is a selectable method for a package (customer-facing; no shop, no carrier).
type QuoteOption struct {
	Method        string   `json:"method"`
	ServiceLevel  string   `json:"serviceLevel"`
	FeeCents      int64    `json:"feeCents"`
	Window        string   `json:"window,omitempty"`
	ScheduleDates []string `json:"scheduleDates,omitempty"`
}

// QuotePackageItem is one line inside an anonymous package.
type QuotePackageItem struct {
	ProductID string `json:"productId"`
	Name      string `json:"name"`
	Quantity  int    `json:"quantity"`
	ImageURL  string `json:"imageUrl,omitempty"`
}

// QuotePackage is one shop's anonymous package. shopID is kept for server-side finalize but is NEVER
// serialized to the customer (json:"-").
type QuotePackage struct {
	PackageKey  string             `json:"packageKey"`
	ShopID      string             `json:"-"`
	Items       []QuotePackageItem `json:"items"`
	Serviceable bool               `json:"serviceable"`
	Options     []QuoteOption      `json:"options"`
}

// CapturedQuote is what we persist on the pending order (order.delivery_quote) so intent honors the
// SHOWN fees within the validity window without the client ever sending a fee (SC-004).
type CapturedQuote struct {
	Packages  []QuotePackage `json:"packages"`
	ExpiresAt time.Time      `json:"expiresAt"`
}

// QuoteResult is returned to the client.
type QuoteResult struct {
	Packages  []QuotePackage
	QuoteID   string
	ExpiresAt time.Time
}

// Leg is the zone context for one package, resolved by the store from postcodes.
type Leg struct {
	ShopID    string
	OriginOK  bool // the shop has a resolvable origin zone
	Offerings []delivery.Offering
}

// QuoteStore is the delivery-specific read/write surface (implemented by pgStore).
type QuoteStore interface {
	// DestinationZone resolves the delivery address's postcode to a zone id; ok=false = unserviceable dest.
	DestinationZone(ctx context.Context, customerID, addressID string) (postcode string, destZoneID string, ok bool, err error)
	// Legs resolves, per distinct shop in the lines, that shop's origin zone and the offerings for
	// (origin -> destZone). A shop with no origin zone yields OriginOK=false (undeliverable).
	Legs(ctx context.Context, shopIDs []string, destZoneID string) (map[string]Leg, error)
	// CaptureQuote upserts the pending order (address + item snapshot) and stores the captured quote +
	// expiry, returning the order id/number. Mirrors UpsertPendingOrder's pending-order reuse.
	CaptureQuote(ctx context.Context, customerID string, addressJSON []byte, lines []CheckoutLine, cq CapturedQuote) (orderID, orderNumber string, err error)
	// ReadCapturedQuote reads the captured quote for the customer's pending order.
	ReadCapturedQuote(ctx context.Context, customerID string) (cq CapturedQuote, orderID, orderNumber string, found bool, err error)
	// WritePackageDeliveries replaces order_package_delivery for the order and sets order totals +
	// quote expiry. The per-package rows are consumed into shop_fulfillment at finalize.
	WritePackageDeliveries(ctx context.Context, orderID string, rows []PackageDelivery, itemSubtotalCents, deliveryFeeCents int64, expiresAt time.Time) error
}

// PackageDelivery is one captured per-package selection, ready to persist.
type PackageDelivery struct {
	ShopID          string
	ServiceLevel    string
	Method          string
	FeeCents        int64
	PromisedReadyAt time.Time
	ScheduledDate   *time.Time
}

// Quote computes the per-package delivery options for the cart + address, captures them on the pending
// order, and returns them. No shop identity or carrier ever reaches the result (FR-019/FR-020).
func (s *Service) Quote(ctx context.Context, customerID, addressID string, now time.Time) (QuoteResult, error) {
	if _, err := uuid.Parse(addressID); err != nil {
		return QuoteResult{}, ErrAddressNotFound
	}
	lines, err := s.store.CartLines(ctx, customerID)
	if err != nil {
		return QuoteResult{}, err
	}
	if len(lines) == 0 {
		return QuoteResult{}, ErrEmptyCart
	}
	addressJSON, found, err := s.store.AddressSnapshot(ctx, customerID, addressID)
	if err != nil {
		return QuoteResult{}, err
	}
	if !found {
		return QuoteResult{}, ErrAddressNotFound
	}

	_, destZoneID, destOK, err := s.qstore.DestinationZone(ctx, customerID, addressID)
	if err != nil {
		return QuoteResult{}, err
	}

	// Group lines by shop into packages (opaque key).
	byShop := map[string]*QuotePackage{}
	order := []string{}
	for _, l := range lines {
		p := byShop[l.ShopID]
		if p == nil {
			p = &QuotePackage{PackageKey: delivery.PackageKey(l.ShopID), ShopID: l.ShopID}
			byShop[l.ShopID] = p
			order = append(order, l.ShopID)
		}
		p.Items = append(p.Items, QuotePackageItem{ProductID: l.ProductID, Name: l.Name, Quantity: l.Quantity})
	}

	shopIDs := append([]string(nil), order...)
	legs := map[string]Leg{}
	if destOK {
		legs, err = s.qstore.Legs(ctx, shopIDs, destZoneID)
		if err != nil {
			return QuoteResult{}, err
		}
	}

	packages := make([]QuotePackage, 0, len(order))
	for _, shopID := range order {
		p := byShop[shopID]
		leg, ok := legs[shopID]
		if !destOK || !ok || !leg.OriginOK || len(leg.Offerings) == 0 {
			p.Serviceable = false // undeliverable to this address (FR-017)
			packages = append(packages, *p)
			continue
		}
		opts := delivery.Options(leg.Offerings, now, scheduleHorizonDays)
		if len(opts) == 0 {
			p.Serviceable = false
			packages = append(packages, *p)
			continue
		}
		p.Serviceable = true
		for _, o := range opts {
			p.Options = append(p.Options, QuoteOption{
				Method: string(o.Method), ServiceLevel: o.ServiceLevel, FeeCents: o.FeeCents,
				Window: o.Window, ScheduleDates: o.ScheduleDates,
			})
		}
		packages = append(packages, *p)
	}

	cq := CapturedQuote{Packages: packages, ExpiresAt: now.Add(pricing.QuoteValidity)}
	orderID, orderNumber, err := s.qstore.CaptureQuote(ctx, customerID, addressJSON, lines, cq)
	if err != nil {
		return QuoteResult{}, err
	}
	_ = orderNumber

	return QuoteResult{Packages: packages, QuoteID: orderID, ExpiresAt: cq.ExpiresAt}, nil
}

// resolveSelections turns the customer's chosen methods (+ the captured quote) into the per-package
// deliveries to persist, honoring the CAPTURED fees (SC-004) and validating serviceability/exclusions.
func resolveSelections(cq CapturedQuote, selections map[string]DeliverySelection, excluded map[string]bool, now time.Time) ([]PackageDelivery, int64, error) {
	// Exclusion set MUST exactly equal the unserviceable packages (R8, SC-011a).
	unserviceable := map[string]bool{}
	serviceableCount := 0
	for _, p := range cq.Packages {
		if p.Serviceable {
			serviceableCount++
		} else {
			unserviceable[p.PackageKey] = true
		}
	}
	if len(excluded) != len(unserviceable) {
		return nil, 0, ErrExclusionMismatch
	}
	for k := range excluded {
		if !unserviceable[k] {
			return nil, 0, ErrExclusionMismatch // excluding a deliverable package is refused
		}
	}
	if serviceableCount == 0 {
		return nil, 0, ErrNoServiceableItems
	}

	rows := make([]PackageDelivery, 0, serviceableCount)
	var feeSum int64
	for _, p := range cq.Packages {
		if !p.Serviceable {
			continue // auto-set-aside; never priced or placed
		}
		sel, ok := selections[p.PackageKey]
		if !ok {
			return nil, 0, ErrSelectionInvalid // every serviceable package needs a choice
		}
		opt, ok := findOption(p.Options, sel.Method)
		if !ok {
			return nil, 0, ErrSelectionInvalid
		}
		off := delivery.Offering{Method: delivery.Method(opt.Method), PriceCents: opt.FeeCents}
		var sched *time.Time
		if opt.Method == string(delivery.MethodScheduled) {
			if sel.ScheduledDate == "" || !dateInOptions(opt.ScheduleDates, sel.ScheduledDate) {
				return nil, 0, ErrSelectionInvalid
			}
			if t, err := time.Parse("2006-01-02", sel.ScheduledDate); err == nil {
				sched = &t
			}
		}
		rows = append(rows, PackageDelivery{
			ShopID:          p.ShopID,
			ServiceLevel:    opt.ServiceLevel,
			Method:          opt.Method,
			FeeCents:        opt.FeeCents, // the CAPTURED fee — never client-supplied
			PromisedReadyAt: delivery.PromisedReadyAt(off, now, sched),
			ScheduledDate:   sched,
		})
		feeSum += opt.FeeCents
	}
	return rows, feeSum, nil
}

func findOption(opts []QuoteOption, method string) (QuoteOption, bool) {
	for _, o := range opts {
		if o.Method == method {
			return o, true
		}
	}
	return QuoteOption{}, false
}

func dateInOptions(dates []string, d string) bool {
	for _, x := range dates {
		if x == d {
			return true
		}
	}
	return false
}

// marshalQuote / unmarshalQuote are the JSONB boundary for order.delivery_quote.
func marshalQuote(cq CapturedQuote) ([]byte, error) { return json.Marshal(cq) }
func unmarshalQuote(b []byte) (CapturedQuote, error) {
	var cq CapturedQuote
	if len(b) == 0 {
		return cq, nil
	}
	err := json.Unmarshal(b, &cq)
	return cq, err
}

// moneyStr renders cents at the wire edge.
func moneyStr(cents int64) string { return money.FormatCents(cents) }
