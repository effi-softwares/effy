# Implementation Plan: Brand Marks — App Icons, Splash Screens & Favicons

**Branch**: `024-brand-icons-splash` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/024-brand-icons-splash/spec.md`

## Summary

One authored SVG becomes every icon, splash screen and favicon on all six client surfaces, in three
colourways (Emerald · Blue · Neutral), through a **generator that is the only thing allowed to
produce them** and a **check that fails when its output drifts from what is committed**.

The technical approach, established empirically in [research.md](research.md):

- A new **`packages/brand`** holds the authored `logo.svg`, the colourway and composition
  definitions, the generator, and the drift check — mirroring the proven `tokens:gen` / `tokens:check`
  pattern in `design-system`, and kept separate from it so the shop blue cannot leak into the design
  tokens (FR-014a).
- **Composition happens in vector space.** Each target gets a generated wrapper SVG whose `viewBox` is
  recentred on the mark's measured bounding box (`x 136.0…379.8, y 71.8…414.8`), with per-target
  padding and an optional baked background. Rasterisation is then a single, exact step.
- **`@resvg/resvg-js`** renders; **`sharp`** performs the two raster-only operations (alpha strip for
  iOS); a **25-line stdlib ICO writer** handles favicons. All three verified deterministic.
- **Android** gets vector adaptive icons (foreground / background / monochrome) plus legacy raster
  mipmaps for API 24–25 only, and `androidx.core:core-splashscreen` for a splash that works across the
  whole `minSdk 24 … targetSdk 36` range. **iOS** gets a no-alpha 1024 icon with dark and tinted
  appearances, and a storyboard-free `UILaunchScreen` dictionary.
- Derived assets are **committed into each surface's conventional location**, because Xcode, Gradle
  and Next all read them from disk at their own build time.

## Technical Context

**Language/Version**: Node 22+ (generator, ESM `.mjs`) · Kotlin 2.4.0 (KMP) · Swift 5.9 (iOS host) ·
TypeScript 5.9 (web surfaces)

**Primary Dependencies**: `@resvg/resvg-js` + `sharp` (new, generator-only `devDependencies` of
`@effy/brand`) · `androidx.core:core-splashscreen` 1.0.1 (new, both KMP apps)

**Storage**: N/A — no database, no migration. Assets are files in the repository.

**Testing**: `node --test` for the generator's pure logic (composition maths, colourway substitution,
ICO container assembly) · `brand:check` as the drift gate · human sign-off on device for clipping,
legibility and distinctness

**Target Platform**: iOS 15+ · Android API 24–36 · evergreen browsers (three web surfaces)

**Project Type**: Cross-cutting assets + build tooling across a monorepo of six client surfaces. No
backend, no infrastructure, no data layer.

**Performance Goals**: Full regeneration of all surfaces in **under 30 s** on a developer machine —
fast enough that regenerating is never the reason someone skips it.

**Constraints**:
- **Byte-identical regeneration** (SC-009) — this drove the entire toolchain choice.
- **No net increase** in `customer-web`'s guest bundle, which sits at **167.3 KB against a 160 KB
  budget** — a *pre-existing* overage recorded under 020. This feature must not add to it; it ships no
  client JavaScript, so the expectation is byte-neutral.
- **No alpha channel** in iOS app icons — enforced at App Store submission, not at build.
- **≤61.1% canvas occupancy** for Android adaptive foregrounds (66 dp safe zone within 108 dp).
- **Zero backend / infra / DB diff** (FR-019, SC-011).

**Scale/Scope**: 6 surfaces · 3 colourways · ~11 composition profiles · ~60 committed derived files.
No runtime code paths added to any application.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Spec-Driven Development** | ✅ Spec → 5-question clarification session → this plan. All five answers are recorded in the spec's Clarifications section and are carried into requirements, not just prose. |
| **II. Monorepo with Shared Contracts** | ✅ The whole feature exists *because* of this principle: one authored mark in one shared package, never copy-pasted per surface. `@effy/brand` follows the established `design-system` generator pattern. |
| **III. Dual-Path Backend Discipline** | ✅ **N/A** — no backend code of any kind. |
| **IV. Auth Isolation** | ✅ **N/A** — no auth surface touched. |
| **V. Native-Feel, Consistent Design** | ✅ **The principle most at risk, and specifically protected.** The supplied artwork used the retired Jade values; it is recoloured into the live palette so **no amendment and no guard exemption** are needed (FR-004). The shop blue is fenced out of the token system entirely (FR-014a), so Principle V's single-accent rule is untouched. Dark mode is honoured on both splash screens (FR-013). Native feel is *strengthened*: iOS gets its dark/tinted appearances, Android its themed icon. **No card layouts involved** — this feature adds no UI. |
| **VI. Layered Architecture & Explicit Wiring** | ✅ No DI, no new layers. The generator is a leaf tool in no build graph; assets are committed artifacts. |
| **VII. Observability & Telemetry** | ✅ **N/A** — no runtime code, so nothing to instrument. Consistent with 013/014/015, where mobile telemetry is deferred to its own slice. |

**Gate result: PASS, with no violations to justify.** The Complexity Tracking table is therefore
omitted.

Two constitutional near-misses are worth naming, because both were resolved by *design* rather than
by exception:

1. Shipping the mark as supplied would have violated Principle V and failed `scripts/check-no-jade.sh`.
   Resolved by recolouring within the authored palette (clarification Q1) — no amendment.
2. Making the shop blue a design token would have broken Principle V's "one design-system package
   drives every surface" and dragged in the WCAG gate in `check-tokens.mjs`. Resolved by confining the
   blue to the mark (clarification Q2) — no amendment.

## Project Structure

### Documentation (this feature)

```text
specs/024-brand-icons-splash/
├── plan.md              # This file
├── spec.md              # Feature specification (5 clarifications integrated)
├── research.md          # Phase 0 — 10 decisions, all empirically verified
├── data-model.md        # Phase 1 — the mark / colourway / composition / target model
├── quickstart.md        # Phase 1 — regeneration + the on-device verification matrix
├── contracts/
│   └── asset-manifest.contract.md   # Phase 1 — the generator's output contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/brand/                          # NEW — @effy/brand, the asset SSOT
├── package.json                         #   scripts: brand:gen · brand:check · test
├── README.md
├── src/
│   ├── logo.svg                         #   THE authored mark (from the operator)
│   ├── colourways.mjs                   #   Emerald · Blue · Neutral (+ mono/tinted derivations)
│   ├── compositions.mjs                 #   bbox, padding + background per target profile
│   └── targets.mjs                      #   surface → (colourway × composition × output paths)
├── scripts/
│   ├── gen-brand-assets.mjs             #   the ONE generator (FR-003)
│   ├── check-brand-assets.mjs           #   sha256 drift gate (FR-003, SC-008)
│   └── lib/{compose,raster,ico}.mjs     #   wrapper-SVG builder · resvg+sharp · stdlib ICO writer
└── test/                                #   node --test: composition maths, substitution, ICO bytes

apps/customer-web/                       # Emerald
├── app/{icon.svg,apple-icon.png,favicon.ico,manifest.ts}   # replaces the stale generator output
├── app/layout.tsx                       #   R9-1: drop next/head → metadata.appleWebApp
└── public/{web-app-manifest-192x192.png,web-app-manifest-512x512.png}

apps/shop-web/                           # Blue
├── index.html                           #   add <link rel="icon"> tags
└── public/                              #   NEW directory — favicon.ico, icon.svg, apple-touch-icon

apps/back-office/                        # Neutral
├── index.html
└── public/                              #   NEW directory

apps/customer-mobile/                    # Emerald
├── androidApp/src/main/res/
│   ├── mipmap-anydpi-v26/ic_launcher{,_round}.xml     # + monochrome layer
│   ├── drawable/{ic_launcher_foreground,ic_launcher_background,ic_launcher_monochrome,
│   │             ic_splash_logo}.xml                  # VectorDrawables (replace template)
│   ├── mipmap-{m,h,x,xx,xxx}dpi/ic_launcher{,_round}.png   # legacy, API 24–25 only
│   ├── values/{colors,themes}.xml  ·  values-night/{colors,themes}.xml
│   └── (deleted) drawable-v24/ic_launcher_foreground.xml   # the Android robot
├── androidApp/src/main/AndroidManifest.xml            #   android:theme → Theme.Effy.Splash
├── androidApp/src/main/kotlin/.../MainActivity.kt     #   installSplashScreen() before setContent
├── androidApp/build.gradle.kts  ·  gradle/libs.versions.toml   # core-splashscreen 1.0.1
└── iosApp/iosApp/
    ├── Assets.xcassets/AppIcon.appiconset/            #   1024 light + dark + tinted (no alpha)
    ├── Assets.xcassets/{LaunchLogo.imageset,LaunchBackground.colorset}/
    ├── Info.plist                                     #   UILaunchScreen dict
    └── iosApp.xcodeproj/project.pbxproj               #   UILaunchScreen_Generation → NO

apps/shop-mobile/                        # Blue — identical structure to customer-mobile
apps/driver-mobile/                      # UNTOUCHED (FR-020)

Makefile                                 # brand-gen / brand-check targets (cm-tokens-check pattern)
# NOTE: `make lint` is TERRAFORM-only in this repo. The drift gate rides `pnpm test`
# (turbo run test) via @effy/brand's own `test` script — exactly how design-system
# wires check-tokens.mjs — plus an explicit `make brand-check` for operators.
```

**Structure Decision**: A **new shared package plus per-surface committed artifacts.** The generator
is centralised (Principle II) while its output lands in each platform's conventional location, because
Xcode asset catalogs, Gradle resource merging and Next's file-convention metadata each read from disk
during their own build and cannot reach into the pnpm workspace. This is the same shape
`design-system` already uses to deliver `compose/EffyTokens.kt` into three KMP apps.

## Phase Sequencing

Ordered so that each phase is independently verifiable, and the risky, hard-to-undo steps come last.

| Phase | Content | Gate |
|---|---|---|
| **0** | `packages/brand` scaffold · authored SVG committed · colourways · composition maths · unit tests | `node --test` green; three colourways render and are visually confirmed |
| **1** | Generator + drift check + `make brand-gen` / `brand-check` | Regenerate twice → byte-identical (SC-009); break the source → check fails (SC-008) |
| **2** | **US3** — the three web surfaces (smallest, fully verifiable locally) | Favicons visible; three tabs distinguishable; `customer-web` bundle unchanged |
| **3** | **US1** — customer mobile icons + splash, both platforms | Builds green; on-device sign-off |
| **4** | **US2** — shop mobile, the same pattern in Blue | Builds green; two apps side by side on one device |
| **5** | Guard wired into `pnpm test` + `make brand-check`; parity registers updated; full-suite verification | All existing gates green; SC table walked |

US4 (anti-drift) is delivered in Phase 1 rather than last, because every later phase depends on the
generator being the only producer — building it first is what makes the rest verifiable.

## Risks

| Risk | Mitigation |
|---|---|
| **Cross-platform render differences** break `brand:check` in CI (research R8) | Pin exact library versions; run the check on the authoring platform; verify macOS↔Linux equality once and treat a version bump as a regeneration event. **Known, unsolved — recorded rather than assumed away.** |
| **`UILaunchScreen_Generation` conflict** produces inconsistent iOS launch behaviour (research R5) | Flag flipped to `NO` in the *same* change that adds the dict; called out in `quickstart.md`. |
| **Android safe zone** clipping on unusual launcher masks | Composition pinned at ≤61.1% occupancy; verified on-device across mask shapes (SC-004), not just in Android Studio's preview. |
| **iOS alpha rejection** surfaces only at submission | Colour-type asserted **in the generator's own test suite**, so an alpha-bearing iOS icon cannot be produced at all. |
| **`customer-web` bundle budget** already over at 167.3/160 KB | Feature ships zero client JS; `pnpm size` compared before/after and required to be byte-identical. The pre-existing overage is **not** this feature's to fix. |
| Adding two image libraries contradicts the existing generator's zero-dependency ethos | Deviation recorded in research R1; libraries confined to the generator, which is in no build graph; ICO writer and drift check stay stdlib-only. |

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 artifacts (`data-model.md`, `contracts/`, `quickstart.md`):

- **Principle II** — reinforced. The design has exactly one generator, one authored mark, one place
  each colourway is defined. Nothing is copy-pasted per surface.
- **Principle V** — reinforced, not merely preserved. No token changes, no Compose theme regeneration,
  no constitution amendment, and `check-no-jade.sh` continues to pass **without an exemption**.
- **Principles III, IV, VII** — remain N/A; the Phase 1 design introduced no backend, auth or runtime
  code that would change this.
- **Principle VI** — unaffected; no application layering is touched.

**Gate result after design: PASS.** No entries for Complexity Tracking.
