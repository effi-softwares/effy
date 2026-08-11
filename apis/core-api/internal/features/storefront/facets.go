// Facet build (043): the available facets + per-option counts for a query + applied filters. Served by
// GET /v1/storefront/facets, called by the client on filter-change (NOT per page — the grid pages
// independently via Search). Every count reuses the shared filters() builder, so the options describe
// exactly the set the grid will show.
package storefront

import (
	"context"

	"golang.org/x/sync/errgroup"
)

// FacetOption is one selectable value with its count in the current set (count ≥ 1 — zero-count
// options never reach here, FR-009).
type FacetOption struct {
	Value string
	Label string
	Count int
}

// Facet is one refinable dimension. Type is a closed vocabulary the client maps exhaustively.
type Facet struct {
	Key     string
	Label   string
	Type    string // "single_select" | "multi_select" | "toggle"
	Options []FacetOption
}

// PriceBounds is the min/max price of the current set, driving the price control's range.
type PriceBounds struct {
	Min string
	Max string
}

// FacetSet is the whole facets response.
type FacetSet struct {
	PriceBounds *PriceBounds
	Facets      []Facet
}

// Facets computes the facets for a query + applied filters.
//
// ── Own-selection exclusion ───────────────────────────────────────────────────────────────────────
// Each multi_select facet's options are counted with THAT facet's own selection cleared, so ticking
// one brand still shows the other brands' counts (FR-008/FR-010). Category (single_select) is counted
// with its own selection cleared too, so a shopper can see sibling categories and switch.
//
// ── Concurrency ───────────────────────────────────────────────────────────────────────────────────
// The reads are mutually independent, so they are fanned out concurrently (029's pattern) — a bounded
// count: category + brand + price + one per active facetable attribute. Results land in fixed slots
// and the facet order is assembled sequentially afterwards, because the server owns facet order.
func (s *Service) Facets(ctx context.Context, q SearchQuery) (FacetSet, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	base := SearchParams{
		Q: q.Q, CategoryKey: q.CategoryKey, MinPrice: q.MinPrice, MaxPrice: q.MaxPrice,
		SaleOnly: q.SaleOnly, Brands: q.Brands, Attributes: q.Attributes,
	}

	defs, err := s.repo.FacetableAttributeDefs(ctx)
	if err != nil {
		return FacetSet{}, err
	}

	var (
		categoryOpts []optionCountRow
		brandOpts    []optionCountRow
		attrOpts     = make([][]optionCountRow, len(defs))
		lo, hi       *string
	)

	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { categoryOpts, err = s.repo.CategoryCounts(gctx, clearCategory(base)); return })
	g.Go(func() (err error) { brandOpts, err = s.repo.BrandCounts(gctx, clearBrands(base)); return })
	g.Go(func() (err error) { lo, hi, err = s.repo.FacetPriceBounds(gctx, clearPrice(base)); return })
	for i, def := range defs {
		g.Go(func() (err error) {
			attrOpts[i], err = s.repo.AttributeCounts(gctx, clearAttr(base, def.Key), def)
			return
		})
	}
	if err := g.Wait(); err != nil {
		return FacetSet{}, err
	}

	var fs FacetSet
	if lo != nil && hi != nil {
		fs.PriceBounds = &PriceBounds{Min: *lo, Max: *hi}
	}
	// Fixed order: category, brand, then the attributes in definition order (name).
	if opts := toFacetOptions(categoryOpts, nil); len(opts) > 0 {
		fs.Facets = append(fs.Facets, Facet{Key: "category", Label: "Category", Type: "single_select", Options: opts})
	}
	if opts := toFacetOptions(brandOpts, nil); len(opts) > 0 {
		fs.Facets = append(fs.Facets, Facet{Key: "brand", Label: "Brand", Type: "multi_select", Options: opts})
	}
	for i, def := range defs {
		if opts := toFacetOptions(attrOpts[i], boolLabeler(def.DataType)); len(opts) > 0 {
			fs.Facets = append(fs.Facets, Facet{Key: def.Key, Label: def.Name, Type: "multi_select", Options: opts})
		}
	}
	return fs, nil
}

// toFacetOptions maps count rows → options, optionally relabelling by value (booleans → Yes/No).
//
// ⚠ Zero-count options are DROPPED here (FR-009), making the "no offered option leads to an empty
// page" guarantee a property of the service rather than an accident of the GROUP BY. The SQL already
// only returns present values, but a shopper must never be handed a dead option, so the invariant is
// enforced where the response is shaped rather than trusted to the query.
func toFacetOptions(rows []optionCountRow, relabel func(string) string) []FacetOption {
	out := make([]FacetOption, 0, len(rows))
	for _, r := range rows {
		if r.Count <= 0 {
			continue
		}
		label := r.Label
		if relabel != nil {
			label = relabel(r.Value)
		}
		out = append(out, FacetOption{Value: r.Value, Label: label, Count: r.Count})
	}
	return out
}

// boolLabeler renders a boolean facet's 'true'/'false' values as Yes/No; nil for other types (which
// carry their authored allowed-value label).
func boolLabeler(dataType string) func(string) string {
	if dataType != "boolean" {
		return nil
	}
	return func(v string) string {
		switch v {
		case "true":
			return "Yes"
		case "false":
			return "No"
		default:
			return v
		}
	}
}

// ── Per-facet param copies (own-selection exclusion) ──────────────────────────────────────────────

func clearBrands(p SearchParams) SearchParams { p.Brands = nil; return p }

func clearCategory(p SearchParams) SearchParams { p.CategoryKey = ""; return p }

func clearPrice(p SearchParams) SearchParams {
	p.MinPrice = ""
	p.MaxPrice = ""
	return p
}

func clearAttr(p SearchParams, key string) SearchParams {
	if len(p.Attributes) == 0 {
		return p
	}
	cp := make(map[string][]string, len(p.Attributes))
	for k, v := range p.Attributes {
		if k != key {
			cp[k] = v
		}
	}
	p.Attributes = cp
	return p
}
