package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
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
	// OriginPoint is the shop postcode's centroid (032). ⚠ NIL means "we do not know where this shop
	// is", which is NOT the same as the origin at 0,0 — the pricing core prices an unknown distance at
	// the furthest band, never the nearest.
	OriginPoint *delivery.Point
}

// QuoteStore is the delivery-specific read/write surface (implemented by pgStore).
type QuoteStore interface {
	// DestinationZone resolves the delivery address's postcode to a zone id; ok=false = unserviceable dest.
	DestinationZone(ctx context.Context, customerID, addressID string) (postcode string, destZoneID string, ok bool, err error)
	// Legs resolves, per distinct shop in the lines, that shop's origin zone and the offerings for
	// (origin -> destZone). A shop with no origin zone yields OriginOK=false (undeliverable).
	Legs(ctx context.Context, shopIDs []string, destZoneID string) (map[string]Leg, error)
	// PostcodePoint reads a postcode's centroid (032). ⚠ (nil, nil) = unknown location, never 0,0.
	PostcodePoint(ctx context.Context, postcode string) (*delivery.Point, error)
	// PricingRules reads every pricing rule with its bands, keyed by method (032).
	PricingRules(ctx context.Context) (map[delivery.Method]delivery.PricingRule, error)
	// SamedayApprovals reads approved same-day coverage per shop (032). ⚠ A shop absent from the
	// result has no approval in force — no approval, no same-day.
	SamedayApprovals(ctx context.Context, shopIDs []string) (map[string]*delivery.SamedayApproval, error)
	// CaptureQuote upserts the pending order (address + item snapshot) and stores the captured quote +
	// expiry, returning the order id/number. Mirrors UpsertPendingOrder's pending-order reuse.
	CaptureQuote(ctx context.Context, customerID string, addressJSON []byte, lines []CheckoutLine, cq CapturedQuote) (orderID, orderNumber string, err error)
	// ReadCapturedQuote reads the captured quote for the customer's pending order.
	ReadCapturedQuote(ctx context.Context, customerID string) (cq CapturedQuote, orderID, orderNumber string, found bool, err error)
	// WritePackageDeliveries replaces order_package_delivery for the order and sets order totals +
	// quote expiry. The per-package rows are consumed into shop_fulfillment at finalize.
	WritePackageDeliveries(ctx context.Context, orderID string, rows []PackageDelivery, itemSubtotalCents, deliveryFeeCents int64, discount OrderDiscount, expiresAt time.Time) error
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

	destPostcode, destZoneID, destOK, err := s.qstore.DestinationZone(ctx, customerID, addressID)
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

	// ── The reads, in ONE WAVE (032) ────────────────────────────────────────────────────────────
	//
	// ⚠ CONCURRENT, NOT SERIAL. A Sydney RDS round trip measures ~135ms from core-api; 029 shipped a
	// storefront read that issued 8 strictly serial queries, spent 1.08s of pure latency, and 503'd
	// the whole storefront when the pool was cold. Adding three more serial reads to the MONEY path
	// would be the same defect somewhere worse. Errors are collected rather than returned from inside
	// the goroutines so a failure in one does not leave the others unread.
	shopIDs := append([]string(nil), order...)
	var (
		legs      = map[string]Leg{}
		destPoint *delivery.Point
		rules     = map[delivery.Method]delivery.PricingRule{}
		approvals = map[string]*delivery.SamedayApproval{}
		wg        sync.WaitGroup
		legErr    error
		pointErr  error
		rulesErr  error
		apprErr   error
	)
	wg.Add(4)
	go func() {
		defer wg.Done()
		if !destOK {
			return
		}
		legs, legErr = s.qstore.Legs(ctx, shopIDs, destZoneID)
	}()
	go func() {
		defer wg.Done()
		destPoint, pointErr = s.qstore.PostcodePoint(ctx, destPostcode)
	}()
	go func() {
		defer wg.Done()
		rules, rulesErr = s.qstore.PricingRules(ctx)
	}()
	go func() {
		defer wg.Done()
		approvals, apprErr = s.qstore.SamedayApprovals(ctx, shopIDs)
	}()
	wg.Wait()
	for _, e := range []error{legErr, pointErr, rulesErr, apprErr} {
		if e != nil {
			return QuoteResult{}, e
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
		// ⚠ Options no longer produces same-day (FR-029). It is decided per SHOP, from an approval an
		// admin granted — not from a rate-grid row that only ever said "these two postcodes share a
		// zone", which is how a shop in Bendigo came to serve Ballarat 98 km away.
		opts := delivery.Options(leg.Offerings, now, scheduleHorizonDays)
		if delivery.SamedayOffered(approvals[shopID], destPostcode, destOK, now) {
			// Fastest first — Options already orders the rest, and same-day precedes all of them.
			opts = append([]delivery.Option{delivery.SamedayOption()}, opts...)
		}
		if len(opts) == 0 {
			p.Serviceable = false
			packages = append(packages, *p)
			continue
		}
		p.Serviceable = true

		// ── Price this package on ITS OWN distance and ITS OWN weight (032, FR-009) ──────────
		//
		// ⚠ Per PACKAGE, not per order. A two-shop basket has two origins and two weights, and
		// pricing the order as a whole would charge the near, light package for the far, heavy one.
		//
		// ⚠ `known` is false when EITHER end has no centroid, and the pricing core then applies the
		// FURTHEST band. It is never treated as zero distance — see delivery.Price.
		km, known := delivery.Distance(leg.OriginPoint, destPoint)
		weightKg := packageWeightKg(lines, shopID)

		for _, o := range opts {
			// ⚠ THE RULES ARE NOW THE ONLY SOURCE OF A DELIVERY FEE (research R3a). The transitional
			// fallback to delivery_offering.price_amount is gone, because the column is gone — and
			// falling back to the struct's zero value would mean FREE DELIVERY, which is the exact
			// defect class this feature exists to remove.
			//
			// ⚠ A method with no configured rule is therefore NOT OFFERED, rather than offered at
			// nothing. An unpriced method cannot be sold, and refusing to show it is recoverable in a
			// way that charging nothing for it is not.
			rule, configured := rules[o.Method]
			if !configured {
				s.recordOption(string(o.Method), false)
				continue
			}
			fee, offered := delivery.Price(rule, km, known, weightKg)
			if !offered {
				s.recordOption(string(o.Method), false) // a disabled rule withdraws the method (FR-007)
				continue
			}
			s.recordOption(string(o.Method), true)
			// ⚠ The cap binding is the signal that the BANDS are wrong, not that one order was
			// unusual — and every capped order after that point is under-charged with nothing else
			// reporting it. Read as a rate.
			if s.metrics != nil && fee == rule.MaxCents {
				s.metrics.RecordFeeCapHit()
			}
			p.Options = append(p.Options, QuoteOption{
				Method: string(o.Method), ServiceLevel: o.ServiceLevel, FeeCents: fee,
				Window: o.Window, ScheduleDates: o.ScheduleDates,
			})
		}
		// A rule set that disabled every method leaves nothing selectable.
		if len(p.Options) == 0 {
			p.Serviceable = false
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

// packageWeightKg sums one shop's lines into kilograms.
//
// ⚠ Every line has a weight: public.product.weight_grams is NOT NULL with a CHECK > 0, and where
// nobody has measured a product the platform's stated assumption stands (FR-037). There is no
// "unknown weight" branch here because a weightless line would price delivery as though the goods
// were not in the van.
func packageWeightKg(lines []CheckoutLine, shopID string) float64 {
	var grams int
	for _, l := range lines {
		if l.ShopID == shopID {
			grams += l.WeightGrams * l.Quantity
		}
	}
	return float64(grams) / 1000
}

// recordOption is nil-safe: metrics must never be a reason a shopper cannot check out.
func (s *Service) recordOption(method string, offered bool) {
	if s.metrics != nil {
		s.metrics.RecordQuoteOption(method, offered)
	}
}
