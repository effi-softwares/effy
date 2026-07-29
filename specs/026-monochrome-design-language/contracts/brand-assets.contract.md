# Contract: Brand Assets

**Producer**: `packages/brand` (`@effy/brand`)
**Consumers**: customer-web, shop-web, back-office (favicons, PWA manifest icons),
customer-mobile, shop-mobile (launcher icons, splash screens).
**Untouched by design**: `apps/driver-mobile` — 024 FR-020 branded five surfaces, not six.

The package's architecture is unchanged: **authored master → committed derived artifacts → a drift
check that fails and names the stale surface**. Only what a *colourway* means changes.

---

## B1 — The colourway axis becomes polarity, not hue

Under a hueless identity, hue-separated colourways collapse into one asset. Variants are therefore
separated by **ground polarity** (research R2):

| Variant | Ground | Mark | Surfaces |
|---|---|---|---|
| `light` | `#F4F5F7` | `#1A1A1A` | customer-web, customer-mobile |
| `dark` | `#1A1A1A` | `#F4F5F7` | shop-web, shop-mobile |
| `mid` | `#808080` | `#1A1A1A` | back-office |

`light` and `dark` grounds sit at **15.95:1**, which is what makes the customer and shop apps
distinguishable on one home screen at launcher size, in grayscale, and to a colour-blind user.

## B2 — Rule C2 is restated, not dropped

024's invariant was *"`outline` and `tag` are shared by every colourway — that is what keeps the three
marks one mark."* Under polarity those values **must** differ, so the invariant becomes:

> **All colourways draw the same paths from the same slot set.** Geometry is the shared thing;
> values are the varying thing.

This MUST be recorded in the `colourways.mjs` header, because a reader arriving from 024 will
otherwise believe the file has regressed. **Enforced by**: the existing unit tests, with updated
expectations.

## B3 — Rule C4 still holds: assets are not tokens

Mark colours and `SPLASH_GROUND` remain **asset-local**. `packages/brand` MUST NOT depend on
`@effy/design-system`, MUST NOT export a colour into it, and no Compose theme is regenerated because
of this file.

**Enforced by**: `tokens:check` passing **unchanged** across a brand-only change — the same proof 024
used for the shop sky.

## B4 — Retired values are named only to forbid them

`RETIRED_JADE` stays. `RETIRED_EMERALD` is added:

```
["#065f46","#10b981","#d0735a","#bf5540","#dd8368","#69b08b","#0ea5e9","#075985","#4ade80","#3b82f6"]
```

covering the emerald pair, both terracotta appearances, the dark-mode emerald ring, the shop sky pair,
and both 024 splash grounds. The suite MUST prove each is absent from every derived asset.

## B5 — Determinism

Two regenerations from an unchanged source MUST be **byte-identical** (SC-006).

## B6 — Format rules survive the palette change

Unchanged and still enforced:

- **iOS icons are PNG colour-type 2** — the App Store rejects *any* alpha channel, even fully opaque.
  The generator must remain unable to emit a rejectable icon.
- **Android** gets VectorDrawables (fg / bg / monochrome themed layer + splash); legacy raster mipmaps
  remain for **API 24–25 only**.
- The mark must remain legible and unclipped inside every launcher mask shape at the smallest
  committed size.

## B7 — No geometry changes

This feature recolours; it does not redraw. 024's live-only defect — a converter that emitted
`M undefined,undefined`, valid XML that compiled through aapt2, packaged into the APK, and then failed
`PathParser` at runtime so the icon silently fell back to the system default — is guarded by
`assertRenderable()` and 17 regression tests. **That surface stays closed**, and the full brand suite
(101 tests) is a required gate regardless.

## B8 — Splash grounds

`SPLASH_GROUND` is restated from 024's brand colours (`#4ade80` customer, `#3b82f6` shop) to the
neutral ramp per polarity, **one value per app across light and dark**, as 024 established. The
iOS `LaunchBackground.colorset` is generated from it; the Android `values{,-night}/colors.xml` are
hand-maintained to match — and `check-no-emerald.sh` must cover `.xml` (see the tokens contract C1) or
this is exactly where a retired value survives.

---

## Required tests

1. `brand:check` passes after regeneration.
2. **Negative proof ×3** (SC-005): break it as **stale**, as **orphaned**, and as **missing** — each
   must exit non-zero and name the correct surface.
3. Determinism: regenerate twice, diff, expect empty (SC-006).
4. `RETIRED_EMERALD` absence asserted across all derived assets (B4).
5. `tokens:check` passes unchanged across a brand-only change, proving C4 (B3).
6. iOS icons assert colour-type 2 / no alpha channel (B6).
7. Polarity separation asserted: the `light` and `dark` ground values differ by ≥ 3:1 (they measure
   15.95:1) — the machine half of FR-022. The human half is the **side-by-side observer test in
   SC-005 / SC-007** of *this* feature. ⚠ An earlier draft cited "SC-002/SC-003", which are **024's**
   criterion numbers; in 026 those cover the design vocabulary and the typeface.
8. Full brand suite (101 tests) green (B7).
