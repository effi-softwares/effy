// 042-storefront-home-composer — the operator-authored home layout, on the read side.
//
// The home page's top-to-bottom order used to be a hardcoded sequence. It is now a published list of
// typed blocks, and this file is where that list becomes something the storefront can render.
//
// ⚠ THE CENTRAL RULE IS THAT A BAD BLOCK IS DROPPED, NEVER FATAL (FR-042). A block whose type this
// build does not know, whose props it cannot read, or whose reference has since disappeared is
// omitted and the rest of the page is served. A storefront that fails to render because one section
// went stale is a far worse outcome than a storefront missing one section.
//
// ⚠ AND THAT IS WHY EVERY OMISSION IS COUNTED. Dropping a block is a SILENT SUCCESS path: nothing
// throws, nothing logs an error, and the page looks plausible. Uncounted, a published layout that has
// quietly lost a section is invisible to everyone — including the operator who published it.
package storefront

import (
	"encoding/json"
	"fmt"
)

// BlockOmissionReason labels why a block did not make it onto the page. Low-cardinality by design:
// these are metric labels (Principle VII), not free-form diagnostics.
type BlockOmissionReason string

const (
	// The type is not in this build's catalogue — a layout published by a newer deploy, or a block
	// type that has since been retired.
	OmitUnknownType BlockOmissionReason = "unknown_type"
	// The props do not parse into the shape this build expects for that type.
	OmitInvalidProps BlockOmissionReason = "invalid_props"
	// A rail, category or promotion the block points at no longer exists or is no longer active.
	// ⚠ Publish-time validation cannot prevent this: the reference was valid when it was published.
	OmitMissingReference BlockOmissionReason = "missing_reference"
)

// Block is one renderable section of the home page, after resolution.
//
// ⚠ Props stay as raw JSON through the domain and are given shape by the handler. The alternative — a
// Go struct per block type — would be a SECOND definition of the catalogue that already exists in
// `packages/shared-types`, and Principle II exists because two definitions of one contract always
// eventually disagree. What this layer decides is which blocks survive, not what their fields mean.
type Block struct {
	ID    string
	Type  string
	Props json.RawMessage
	// Rail is populated for `product_rail` blocks whose reference resolved. Nil otherwise.
	Rail *Rail
}

// LayoutOmission records one dropped block so the caller can count it.
type LayoutOmission struct {
	Type   string
	Reason BlockOmissionReason
}

// rawBlock is the stored shape. Deliberately permissive: this is the boundary where a layout written
// by a different deploy arrives, so anything it cannot understand must survive as data.
type rawBlock struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	Hidden bool            `json:"hidden"`
	Props  json.RawMessage `json:"props"`
}

// knownBlockTypes mirrors the catalogue in `packages/shared-types/src/block-catalogue.ts`.
//
// ⚠ THIS IS THE ONE PLACE THE CATALOGUE IS RESTATED IN GO, and it is a known cost recorded rather
// than hidden. The plan's answer is a generated catalogue plus a byte-identical wire-contract test
// pinning the two together (T006, re-scoped). Until that generator exists, this list and the TS one
// are kept in step by `layout_test.go`, which fails if they diverge in the cases it covers.
//
// ⚠ `hero` is ABSENT ON PURPOSE. Two heroes exist on the storefront — a static one and a
// promotions-driven one — and their comparison was never concluded, so no `hero` schema is agreed.
// Until it is, the hero stays page-level markup outside the block list (T008c).
var knownBlockTypes = map[string]struct{}{
	"category_strip":  {},
	"product_rail":    {},
	"offers":          {},
	"value_strip":     {},
	"app_promo":       {},
	"newsletter":      {},
	"recently_viewed": {},
}

// railRef is the only prop shape this layer needs to understand, because it is the only one carrying
// a reference the server must resolve before the client can render anything.
type railRef struct {
	RailKey string `json:"railKey"`
}

// decodeLayout turns a stored body into blocks, dropping what cannot be rendered.
//
// ⚠ A body that is not valid JSON yields an EMPTY layout and an error, not a panic. The column has a
// CHECK constraint requiring an array, so this is defence against a hand-edited row rather than an
// expected path — but "the storefront 500s because someone ran an UPDATE" is not an acceptable
// failure mode for the platform's only public surface.
func decodeLayout(body []byte) ([]rawBlock, error) {
	if len(body) == 0 {
		return nil, nil
	}
	var blocks []rawBlock
	if err := json.Unmarshal(body, &blocks); err != nil {
		return nil, fmt.Errorf("storefront: decode home layout: %w", err)
	}
	return blocks, nil
}

// resolveStructure applies only the rules that need nothing but the layout itself: hidden blocks and
// unknown types. It attaches no content.
//
// ⚠ IT IS SEPARATE FROM resolveBlocks BECAUSE THE TWO ANSWERS HAVE DIFFERENT CACHEABILITY, and that
// is the whole reason the storefront can still prerender.
//
// The structure — which blocks, in what order, with what operator copy — changes only when someone
// publishes. Product content changes constantly and is shopper- and stock-dependent. Serving them
// through one read would put the entire page body behind request time and the static shell FR-037
// depends on would be gone. So the web surface reads the structure through a CACHED path tagged
// `home-layout` and streams the products into Suspense holes, while a mobile client — which has no
// such thing as a streaming hole and wants one round trip — takes the combined answer below.
func resolveStructure(raw []rawBlock) ([]Block, []LayoutOmission) {
	out := make([]Block, 0, len(raw))
	var omitted []LayoutOmission

	for _, b := range raw {
		// ⚠ Hidden blocks are dropped HERE, server-side, so a hidden block never reaches the wire.
		// Filtering on the client would ship unpublished merchandising to every shopper and rely on
		// the client to not render it.
		if b.Hidden {
			continue
		}

		if _, ok := knownBlockTypes[b.Type]; !ok {
			omitted = append(omitted, LayoutOmission{Type: b.Type, Reason: OmitUnknownType})
			continue
		}

		out = append(out, Block{ID: b.ID, Type: b.Type, Props: b.Props})
	}

	return out, omitted
}

// resolveBlocks is resolveStructure plus attached rail content.
//
// `railsByKey` is what the caller already fetched for the page; a rail block whose key is absent from
// it is dropped as a missing reference rather than rendered as an empty section.
//
// ⚠ A RAIL BLOCK SURVIVES resolveStructure AND CAN STILL BE DROPPED HERE. That is not an
// inconsistency between the two answers — it is the difference between "the operator published this
// section" and "this store can fill it today". The web surface renders the structure and lets the
// rail component self-hide when its content arrives empty; the combined answer drops it up front
// because a mobile client receives one payload and cannot discover the emptiness later.
func resolveBlocks(raw []rawBlock, railsByKey map[string]Rail) ([]Block, []LayoutOmission) {
	structure, omitted := resolveStructure(raw)
	out := make([]Block, 0, len(structure))

	for _, block := range structure {
		b := block

		if b.Type == "product_rail" {
			var ref railRef
			if err := json.Unmarshal(b.Props, &ref); err != nil || ref.RailKey == "" {
				omitted = append(omitted, LayoutOmission{Type: b.Type, Reason: OmitInvalidProps})
				continue
			}
			rail, ok := railsByKey[ref.RailKey]
			if !ok {
				omitted = append(omitted, LayoutOmission{Type: b.Type, Reason: OmitMissingReference})
				continue
			}
			// ⚠ A rail with no products self-hides (FR-004/SC-013) — a heading above blank space is
			// the empty frame the whole degradation rule exists to prevent.
			if len(rail.Products) == 0 {
				omitted = append(omitted, LayoutOmission{Type: b.Type, Reason: OmitMissingReference})
				continue
			}
			r := rail
			b.Rail = &r
		}

		out = append(out, b)
	}

	return out, omitted
}
