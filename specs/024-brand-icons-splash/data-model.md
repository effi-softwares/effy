# Phase 1 Data Model — 024 Brand Marks

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-07-26

There is **no database and no persistence** in this feature. "Data model" here means the entity model
the generator is built around — the four things whose separation is what makes one mark serve
eleven composition profiles across six surfaces without duplication.

The whole design is one function:

```
DerivedAsset  =  render( Mark × Colourway × Composition, Target.format, Target.size )
```

Everything below exists to keep those four factors **independent**, so that adding a surface, a
colourway or a size is a data edit rather than a code change.

---

## 1. Mark

The authored vector. **Exactly one exists**, and nothing in the system may draw a second.

| Field | Value | Notes |
|---|---|---|
| `source` | `packages/brand/src/logo.svg` | 1 075 bytes, hand-authored, flat named colours |
| `viewBox` | `0 0 500 500` | Authored canvas — **not** the content bounds |
| `contentBBox` | `x 136.0 … 379.8`, `y 71.8 … 414.8` | Measured by rendering at 2000 px and scanning alpha |
| `contentSize` | `244.0 × 343.3` | Aspect **0.711** (portrait) |
| `slots` | `body`, `fold`, `outline`, `tag` | The four recolourable regions |

**Validation rules**

- **V1** — The source MUST declare explicit `width`/`height` before rasterisation. The authored file
  carries `width="100%" height="100%"`, which some rasterisers resolve to a zero-size surface. The
  generator substitutes concrete dimensions; it MUST NOT rely on the authored values.
- **V2** — `contentBBox` MUST be **derived by measurement**, never hard-coded from a hand count. If
  the artwork is ever re-authored, a stale bbox silently mis-centres every asset.
- **V3** — The source MUST NOT contain any retired brand value. Enforced by the existing
  `scripts/check-no-jade.sh`, which already scans `*.svg`.

**Why the bbox is an entity field and not a magic number**: the mark fills only 48.8% × 68.7% of its
own canvas and sits above and right of centre. Every composition below is expressed *relative to the
bbox*, so composition maths stays correct if the artwork is ever redrawn.

---

## 2. Colourway

A named assignment over the mark's four slots. **Carries no geometry.**

| Colourway | `body` | `fold` | `outline` | `tag` | Used by |
|---|---|---|---|---|---|
| **Emerald** | `#10b981` | `#065f46` | `#0C1D36` | `#F4F5F7` | customer-web, customer-mobile |
| **Blue** | `#3b82f6` | `#1e40af` | `#0C1D36` | `#F4F5F7` | shop-web, shop-mobile |
| **Neutral** | `#525252` | `#262626` | `#0C1D36` | `#F4F5F7` | back-office |
| **Mono** | *single colour, full silhouette* | — | — | — | Android themed icon, iOS tinted |

**Validation rules**

- **C1** — Every colourway MUST assign all four slots (Mono excepted, which collapses to one).
- **C2** — `outline` and `tag` are **shared across all colourways**. They are what keeps the three
  marks recognisably one mark (FR-002, SC-003); a colourway that changes them is invalid.
- **C3** — No colourway value may be a retired brand value (V3 applies transitively).
- **C4** — Colourway values are **asset-local constants**. They MUST NOT be imported from, or exported
  into, `@effy/design-system`. This is FR-014a made structural: the blue physically cannot reach the
  token system because it is defined in a different package that `design-system` does not depend on.

**Derivation**: Emerald and Blue are applied by **exact string substitution** on the two authored
green values — verified working, and deliberately the dumbest possible mechanism, because anything
cleverer could silently mis-recolour a shade. Mono is a separate composition (see §3), not a
substitution, since flattening to one colour requires dropping the tag/outline distinction.

---

## 3. Composition

A rule for placing the mark inside a target frame. Independent of colour.

| Profile | Padding | Background | Occupancy | Purpose |
|---|---|---|---|---|
| `favicon` | 0.02 | transparent | ~96% | Tiny sizes need maximum ink |
| `web-icon` | 0.06 | transparent | ~89% | SVG favicon, PWA `any` |
| `maskable` | 0.20 | brand ground | ~62% | PWA `maskable` — safe under crop |
| `ios-app` | 0.18 | **opaque** ground | ~68% | Full-bleed, corner-radius safe |
| `ios-dark` | 0.18 | **opaque** dark ground | ~68% | Dark appearance |
| `ios-tinted` | 0.18 | **opaque** | ~68% | Single-channel source |
| `android-fg` | **0.34** | none (own layer) | **≤61.1%** | **Adaptive-icon safe zone** |
| `android-legacy` | 0.12 | brand ground | ~80% | API 24–25 raster mipmaps |
| `android-mono` | 0.34 | none | ≤61.1% | Themed icon, silhouette only |
| `splash` | 0.30 | theme ground | ~55% | Centred launch mark |
| `apple-touch` | 0.14 | **opaque** ground | ~75% | iOS home-screen web clip |

**Construction** — a composition produces a **wrapper SVG**, not a raster operation:

```
side = max(bboxW, bboxH) × (1 + padding × 2)
ox   = bboxX − (side − bboxW) / 2      # recentre horizontally
oy   = bboxY − (side − bboxH) / 2      # recentre vertically
→ <svg viewBox="ox oy side side">  [optional <rect> background]  [mark]  </svg>
```

**Validation rules**

- **P1** — `android-fg` and `android-mono` MUST NOT exceed **61.1%** canvas occupancy (66 dp of
  108 dp). This is the single most common adaptive-icon defect and the direct subject of SC-004.
- **P2** — Every `ios-*` profile MUST bake an **opaque** background. An iOS app icon with an alpha
  channel is rejected at submission (research R3).
- **P3** — `favicon`, `web-icon`, `android-fg` and `android-mono` MUST **preserve** alpha. Baking a
  background into these produces a visible box around the mark.
- **P4** — Composition is applied in **vector space, before rasterisation**. No raster padding,
  cropping or compositing — each is an extra resample and a source of non-determinism.

---

## 4. Target

One concrete output: a surface, a slot, and the (colourway × composition × format × size) that fills it.

| Field | Description |
|---|---|
| `surface` | `customer-web` · `shop-web` · `back-office` · `customer-mobile` · `shop-mobile` |
| `slot` | Platform-defined role (`favicon`, `app-icon`, `adaptive-foreground`, `splash-logo`, …) |
| `colourway` | Reference to §2 |
| `composition` | Reference to §3 |
| `format` | `svg` · `png` · `ico` · `xml` (Android VectorDrawable) |
| `sizes[]` | Pixel sizes to emit (empty for vector formats) |
| `outPath` | Repo-relative destination, in the surface's **conventional** location |
| `alpha` | `preserve` · `strip` — derives from the composition, asserted at write time |

**Validation rules**

- **T1** — `outPath` MUST be the platform's conventional path. Xcode, Gradle and Next each discover
  these by convention; a "tidier" location silently disables them.
- **T2** — Every target MUST be reachable from the manifest. An asset produced but not declared is
  invisible to the drift check and will rot (US4).
- **T3** — `alpha: strip` MUST be asserted on the **written bytes** (PNG colour-type 2), not merely
  requested. This is what makes SC-006 provable before submission rather than after rejection.
- **T4** — No two targets may write the same `outPath`. Collisions mean silent overwrite ordering.

---

## Relationships

```
Mark (1) ──────────────< Colourway (4)
  │                          │
  └──< Composition (11) ──┐  │
                          ▼  ▼
                       Target (~40) ───> DerivedAsset (~60 files)
                                              │
                                              └──> AssetManifest ──> brand:check
```

- One **Mark**, always.
- Four **Colourways** over it, sharing `outline` + `tag` (C2) — the invariant that satisfies SC-003.
- Eleven **Compositions**, colour-blind by construction.
- ~40 **Targets** = the surface matrix; ~60 **DerivedAssets** once multi-size targets expand.
- The **AssetManifest** ([contract](contracts/asset-manifest.contract.md)) is the generator's
  declared output, and the only input to the drift check.

---

## State & lifecycle

Assets have no runtime state. The only lifecycle is the **regeneration cycle**, and it has exactly
one legal path:

```
edit logo.svg / colourways / compositions
        │
        ▼
   make brand-gen        →  rewrites every DerivedAsset + AssetManifest
        │
        ▼
   make brand-check      →  sha256 per file vs committed
        │
   ┌────┴────┐
   ▼         ▼
 clean    STALE → names the offending paths, exits non-zero
```

**L1** — A DerivedAsset MUST NOT be hand-edited. The drift check is what makes this enforceable
rather than aspirational (SC-008).

**L2** — Regeneration MUST be idempotent: same inputs → byte-identical outputs (SC-009). Verified for
both image libraries, and neither writes a `tIME` chunk that would make output vary by date.

**L3** — A version bump of either image library is a **regeneration event**, not a transparent
upgrade. See research R8 — this is the known unsolved edge of the determinism guarantee.
