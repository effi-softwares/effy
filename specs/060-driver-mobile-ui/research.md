# Phase 0 Research: Driver Mobile UI Completion

**Feature**: 060-driver-mobile-ui · **Date**: 2026-09-20

Every finding below was verified against this repository or a primary source, not recalled. Where a
question could not be closed by reading, it is recorded as a **spike** with its fallback, rather than
guessed at.

---

## R1 — How to render OpenStreetMap inside Compose Multiplatform

**Decision**: **MapLibre Compose `org.maplibre.compose:maplibre-compose:0.17.0`** (Maven Central).

**Rationale**: It is the only actively-maintained Compose Multiplatform wrapper that renders OSM data
on **both** Android and iOS from `commonMain`. On both it renders through MapLibre Native. Its own
version catalog declares `android-minSdk = "24"` — **exactly** driver-mobile's `minSdk`, so the app's
floor does not move.

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| `osm-android-compose` | **Android only.** Half the surface has no map. |
| Hand-rolled raster tile canvas in `commonMain` | Genuinely viable and toolchain-free, but needs a keyless **raster** tile host, and the free OSM-derived hosts (R2) serve **vector** tiles. Building a tile pyramid, pan/zoom inertia, marker projection and attribution from scratch is a slice of its own, not a presentation task. |
| `kmp-maps-compose` | Wraps **Google Maps**, not OSM. Needs an API key and a billing account — the precise thing the operator's choice avoids. |
| Google Maps / Mapbox SDKs | Same: key + billing. |

⚠ **The API is pre-1.0.** Its own documentation states: *"The API is not yet stable. Expect breaking
changes between minor releases."* This is accepted knowingly and recorded in Complexity Tracking; the
map is one screen behind one wrapper composable, so the blast radius of a breaking change is bounded
by design (see R4).

---

## R2 — Which tile source

**Decision**: **OpenFreeMap** — `https://tiles.openfreemap.org/styles/liberty`. No API key, no usage
limit, MIT-licensed, OSM data via OpenMapTiles + Planetiler.

⚠ **The obvious choice is forbidden.** OpenStreetMap's own **Tile Usage Policy** states that heavy use
— *explicitly including distributing an app that uses tiles from openstreetmap.org* — is prohibited
without prior permission from its system administrators, and that access may be blocked without
notice. `tile.openstreetmap.org` is therefore **not** an option for a shipped app, and "use
OpenStreetMap" cannot be satisfied by pointing at OSM's own servers. This is the single most important
finding in this document: taking the naive route would have put the platform in breach of a volunteer
project's policy, and the only signal would have been the map going blank in production.

**Attribution is a licence obligation, not a nicety** (FR-023b). MapLibre adds OpenFreeMap's
attribution automatically when it renders the style; the plan does not rely on that alone — the
attribution is asserted by a test, because an automatic behaviour that silently stops is exactly the
class of defect this repo keeps recording.

**Alternatives considered**: MapTiler and Stadia (both key + account); Protomaps (self-hosting a
planet file — infrastructure work); running our own tile server (an infrastructure slice).

---

## R3 — The toolchain cost of MapLibre, and whether it is contained

**Finding**: There is **no MapLibre Compose release built against Compose Multiplatform 1.11.x.**
Release notes show v0.15.0 moved to CMP **1.12.0** / Kotlin 2.4.10, and v0.17.0 to Kotlin **2.4.20**.
driver-mobile is on **Kotlin 2.4.0 / CMP 1.11.1**.

**Decision**: Adopt MapLibre and **bump driver-mobile to Kotlin 2.4.20 + Compose Multiplatform
1.12.0**, gated on spike **S1** below.

**Why this is safe to attempt** — and this is the decisive structural fact:

- The three mobile apps are **three independent Gradle builds**. `apps/{customer,driver,shop}-mobile`
  each own a `settings.gradle.kts` and their own `gradle/libs.versions.toml`.
- Therefore a Kotlin/CMP bump in driver-mobile **cannot reach** customer-mobile or shop-mobile. SC-012
  ("the other apps' checks pass unchanged") holds **structurally**, not by careful behaviour.

⚠ **But the real SC-012 risk is elsewhere.** `packages/mobile-kit` is consumed by
`kotlin.srcDir(rootProject.file("../../packages/mobile-kit/common"))` — **source inclusion, not a
published artifact**. So:

- A **toolchain** change in driver-mobile is invisible to the other apps. ✅
- A **source** change to mobile-kit is compiled into **all three**. ⚠

That inverts the intuitive risk. Every mobile-kit edit in this feature must be additive and proven
against the other two apps' suites (see R7).

### ⚠ S1 RESULT (2026-09-20): PASSED — but the bump was **five parts, not two**

Executed. The plan predicted Kotlin + CMP. The real dependency chain, discovered one failure at a
time, was:

| # | Change | Forced by |
|---|---|---|
| 1 | Kotlin `2.4.0` → **`2.4.20`** | MapLibre Compose 0.17.0's own toolchain |
| 2 | Compose Multiplatform `1.11.1` → **`1.12.0`** | no MapLibre release targets 1.11.x |
| 3 | `compileSdk` `36` → **`37`** | ⚠ `androidx.compose.animation:animation-core-android:1.12.0` *"requires libraries and applications that depend on it to compile against version 37 or later"* |
| 4 | AGP `9.0.1` → **`9.1.0`** | ⚠ nine CMP 1.12.0 artifacts *"require Android Gradle plugin 9.1.0 or higher"* |
| 5 | Gradle `9.1.0` → **`9.3.1`** | ⚠ AGP 9.1.0: *"Minimum supported Gradle version is 9.3.1"* |

**Result**: `:shared:compileAndroidMain` ✅ · `:shared:testAndroidHostTest` ✅ **26/26, identical to
the baseline** · `:shared:compileKotlinIosSimulatorArm64` ✅ · `:shared:compileTestKotlinIosSimulatorArm64`
✅. No source change was needed — the two `BackHandler` deprecations BASELINE.md flagged as a risk did
**not** become removals.

⚠ **Two things worth recording.**

1. **`compileSdk 37` installed as `android-37.0` and AGP then looked for `android-37`.** The first
   build after the bump failed with *"Failed to find target with hash string 'android-37'"* having
   just successfully installed the platform. It resolved on the next invocation. A one-off local SDK
   naming mismatch, not a project defect — but it looks exactly like a broken build.
2. **The Gradle wrapper pins `distributionSha256Sum`.** Changing `distributionUrl` without it fails
   the build with a checksum mismatch — correctly, since that pin is a supply-chain control. The new
   value was taken from **`services.gradle.org/distributions/gradle-9.3.1-bin.zip.sha256`** and
   matched what downloaded; it was *not* copied from the build's own "actual checksum" line, which
   would have defeated the control entirely.

⚠ **driver-mobile now diverges from the other two apps' toolchain** (they remain Kotlin 2.4.0 / CMP
1.11.1 / AGP 9.0.1 / compileSdk 36). That is safe — three independent Gradle builds — and is the
whole reason this bump was affordable. It is written down here so nobody later "fixes" it as drift.

### Spike S1 (BLOCKING, Phase 0 of implementation) — as planned

Bump driver-mobile to Kotlin 2.4.20 / CMP 1.12.0 and confirm the existing stack still resolves and
compiles: `material3 1.11.0-alpha07`, `material3-adaptive-navigation-suite`, lifecycle 2.10.0,
`navigation3 1.1.1`, Ktor 3.5.1, Amplify 2.25.0, Firebase BOM 34.18.0, PostHog, BuildKonfig 0.22.0.
Run `:shared:compileAndroidMain`, `:shared:testAndroidHostTest`,
`:shared:compileKotlinIosSimulatorArm64` **and** `:shared:compileTestKotlinIosSimulatorArm64` (033
recorded that the iOS *test* compilation had never run and was broken for months).

**If S1 fails**, FR-023e's fallback applies: the Map tab ships the design's stylised route
representation, the toolchain does not move, and the reason is recorded in this plan. The Map tab is
finished either way — FR-003 admits no placeholder.

### Spike S2 (BLOCKING, iOS only)

MapLibre Compose requires **linker flags on the iOS app target**:
`-l"c++" -lz -framework CoreFoundation -framework CoreGraphics -framework CoreText -framework
Foundation -framework ImageIO -framework Metal -framework QuartzCore`.

That is an **Xcode project change**, not a Gradle one. Per this project's operating rule the operator
performs it; the plan hands them the exact flags and an iOS build is the proof. ⚠ Until S2 is done the
iOS build **fails to link** — so S2 is sequenced before any map work lands, not after.

---

## R4 — Bounding a pre-1.0 dependency

**Decision**: MapLibre is reached through exactly **one** composable in the driver app —
`core/platform/EffyMapCanvas.kt` — which takes a list of plotted points and a mode, and returns a map.
No feature file imports `org.maplibre.*`.

**Rationale**: The library documents breaking changes between minor releases. One call site means an
upgrade is one file, and the FR-023e fallback is a substitution of that file rather than a rewrite of
the Map feature. A source guard asserts the single import site, in the repo's established style
(054's availability guard, 058's rollup-only guard) — because "only import it in one place" is a
comment until something fails.

---

## R5 — ⚠ The typeface: a constitution gap found while planning

**Finding**: There is **no Geist font file anywhere in this repository.** `find . -iname "*geist*"`
returns nothing. All three mobile apps render **General Sans**, self-hosted from
`packages/design-system/mobile-assets/font/general_sans_{regular,medium,semibold}.ttf`.

Constitution v2.0.0 names "the **Geist / Geist Mono** typefaces" as part of the token set every
surface takes from the design-system package. On the web that resolves correctly — `--font-sans` names
Geist first and General Sans second, and the consoles load Geist from Google Fonts. **On mobile there
is no fallback chain**: Compose resolves a `FontFamily` from committed files, and the only committed
files are General Sans.

**Decision**: Mobile renders **General Sans**, and this is correct, not a deviation — it is the
fallback face doing exactly the job the token declaration gives it. ⚠ **But the constitution did not
say so**, and an unstated fact of this kind is the same law-versus-practice gap the cobalt amendment
just closed. A **PATCH clarification (v2.0.1)** is owed, making explicit that mobile renders the
fallback face because Geist is not self-hosted.

**This feature does not add Geist to mobile.** Adding a typeface to three apps is a design-system
slice with its own licensing question, not a driver-app presentation task.

---

## R6 — Swipe-to-confirm (FR-018)

**Decision**: `AnchoredDraggable` from Compose **Foundation** (multiplatform), with two anchors
(`Idle` / `Confirmed`), a commit threshold, and a spring settle back to `Idle` when released short.

**Rationale**: The design uses a swipe for the two irreversible acts — completing a shop stop and
ending the collection run — precisely because a tap is too cheap for them. `AnchoredDraggable` gives
the positional anchoring and velocity-aware settling the gesture needs; a raw `draggable` would mean
hand-writing the settle animation.

**Requirements this imposes** beyond the design: the gesture MUST be cancellable before it commits
(FR-018), and MUST have an accessible equivalent — a swipe is not operable by a switch or screen-reader
user, so the track carries a click action and a custom accessibility action. The design does not show
this; leaving it out would make the app's two most important actions unreachable for some drivers.

---

## R7 — Pull-to-refresh, and a Principle II promotion

**Finding**: `EffyPullToRefresh` already exists — in **customer-mobile**
(`core/presentation/EffyPullToRefresh.kt`), built by 027, used on six screens. driver-mobile has no
pull-to-refresh at all, and the design calls for it on four screens.

**Decision**: **Promote** `EffyPullToRefresh` into `packages/mobile-kit/common/ui/` and have all three
apps consume it (Principle II — shared concerns live in shared packages, never copy-pasted).

⚠ **This is a mobile-kit source change, so it reaches all three apps** (R3). The promotion is therefore
done the way this repo has proven promotions before: move the file, leave the customer-mobile call
sites untouched, and **prove customer-mobile's suite passes unmodified**. That unmodified pass is the
evidence the extraction changed no behaviour — the same proof 028 used for the S3 presign helper and
058 used for three promotions.

**Rejected**: copying the file into driver-mobile. Two implementations of one gesture is the
two-sources-for-one-fact shape the constitution now names explicitly.

---

## R8 — The in-app camera viewfinder (design screen `proof-photo`)

**Finding**: The current implementation is a **system camera handoff**, not a viewfinder — Android
uses `ActivityResultContracts.TakePicturePreview`. ⚠ And `rememberPhotoCapture` returns **null on
iOS**, so the Photo proof option is **hidden entirely on iOS today**. The design's screen is an in-app
viewfinder with a shutter, flash and flip control and a location/timestamp caption bar.

**Decision**: Split the screen into **designed chrome (shared) + a viewfinder surface (per-platform)**.

- The chrome — header, caption bar, shutter, flash, flip, the framing guidance — is built once in
  `commonMain` and is identical on both platforms, so **the screen exists on both** (FR-001).
- The surface is an `expect/actual CameraPreviewSurface`. **Android**: a live CameraX preview.
  **iOS**: a designed stand-in that hands off to the system camera on shutter, until a Swift
  AVFoundation bridge is written.

**Rationale**: A live viewfinder on iOS needs a Swift bridge, which is the same shape as the platform's
other deferred iOS bridges (`SwiftPushBridge`, 050). Deferring the *surface* while shipping the
*screen* keeps FR-001 honest and confines the gap to one register entry. ⚠ It also **closes a real
defect in passing**: iOS drivers currently have no photo proof at all, and after this they do — via
the system camera — even before the bridge exists.

The caption bar's **geotag** is a placeholder (no location capture is wired) and the register says so.

---

## R9 — Icons

**Finding**: `apps/driver-mobile/shared/src/commonMain/composeResources/drawable/` contains exactly
one file — `compose-multiplatform.xml`, the KMP template's own asset. The driver app has **no icons at
all**. The shared SSOT `packages/design-system/mobile-assets/drawable/` has 34, but none for a driver's
Map or History tab. The navigation currently renders the first letter of each tab label.

**Decision**: Author the driver app's icons **into the shared SSOT**
(`packages/design-system/mobile-assets/drawable/`) and let `mobile-assets:check` copy and verify them,
never straight into the app's own resources.

**Rationale**: 027 recorded exactly this defect — two drawables "used but never promoted to the
`mobile-assets/` SSOT" — and the gate caught it. Writing app-local icons would re-introduce it
knowingly. The gate already verifies 84 asset copies across three apps.

⚠ **VectorDrawable conversion is a known trap here.** 024 shipped a converter whose attribute regex
could not match `x1`/`y1`/`x2`/`y2`, emitting `pathData="M undefined,undefined"` — **valid XML that
compiled, packaged, and then failed to inflate at runtime**, taking the launcher icon and splash with
it. Any icon added here is verified by rendering it on a device, not by the build succeeding.

---

## R10 — Loading skeletons

**Decision**: A shared `EffySkeleton` in mobile-kit — a shimmer built from an
`infiniteRepeatable` animated brush — with per-screen skeletons composed from the **same primitives as
the real content**.

**Rationale**: 028 recorded the failure mode directly: a skeleton built from different primitives than
the content it stands in for **cannot match it**, because a `Row` allocates width sequentially and
coerces `Modifier.width()` into what is left. The fix there was to build the skeleton from the same
`LazyRow` the content uses. That lesson is adopted here rather than rediscovered.

Reduced-motion (FR-009) suppresses the shimmer to a static tint; the app already has a
`reducedMotion` signal via `PlatformUiController`.

---

## R11 — Where placeholder data lives

**Decision**: One file per feature, `features/<x>/data/PlaceholderData.kt`, and a single
`core/placeholder/Placeholder.kt` declaring the marker type. Never inline in a composable.

**Rationale**: FR-016 means placeholder values are **invisible in the app**, so the only way to keep
the register honest is to make every placeholder value greppable in exactly one place. A value typed
inline into a `Text(...)` is undiscoverable six months later.

**A guard** enumerates the placeholder files and fails if the register does not list every value they
export — so the register cannot silently go stale, which is the failure mode of every documentation
artifact this repo has written. ⚠ 058 records the counterpart lesson: *"a count in a comment is true
only while someone maintains it."* A register nobody checks is a comment.

**Naming**: fixtures are authored fresh. The design's own sample content — the named driver, the
Melbourne street addresses, the `EFY-409xx` references, `1800 EFFY OPS` — is **not** copied in
(FR-012), because a real driver seeing another person's name and address on their own screen is a
different and worse failure than seeing an obvious stand-in.

---

## R12 — Cards, and Principle V's escape clause

**Finding**: The design is card-built — a hero current-stop card, per-stop cards on the run screen, a
proof-method list, the hub split blocks. Constitution Principle V forbids card layouts **"unless a card
is demonstrably the right pattern for that specific content and no better layout exists, in which case
the plan MUST record the justification."**

**Justification, recorded here per screen that uses one**:

| Screen | Card | Why a card is right |
|---|---|---|
| `home` / `home-delivery` | The current stop/drop hero | It is **one** object, not a tile in a set. It carries a map strip, a title, an address and a metrics row as a single tappable target a driver hits while holding a parcel. A detail row cannot contain a map. |
| `collection-run` | Per-stop blocks | Each block holds a **per-stop action button**. A list row with an embedded primary action inside it is a card by any honest reading; pretending otherwise would be a naming dodge. |
| `hub-checkin` | The two split blocks | Two mutually-exclusive outcomes of one quantity, each with a state chip. A table of two rows loses the proportional relationship the screen exists to show. |

Everything else — history, activity, account, help, the queues, the package manifests — is built as
**rows, sections and lists**, as the constitution prefers. ⚠ Note the constitution's own bar is "no
better layout exists", not "a card looks nice"; the three above are the only ones that clear it.

---

## R13 — 45 design screens onto app destinations

**Finding**: The design's 45 in-app screens are not 45 routes. Several are **states of one destination**
(`otp` / `otp-verifying` / `otp-invalid` / `otp-expired` / `otp-locked` are five states of the code
step; `skeleton` and `error` are states of Today; `activity-empty`, `history-empty`,
`hub-checkin-empty` are empty states).

**Decision**: Map them to **~24 destinations carrying ~45 states**, and make the *state* the unit of
verification, not the route. The acceptance evidence (SC-001) is a screenshot of each of the 45, which
means each state must be reachable deliberately — so every screen's state is drivable from a
preview/state harness, not only by contriving live conditions.

**Rationale**: 039 recorded that "layout, contrast and hierarchy are not properties a DOM assertion can
see", and four live defects shipped behind a green suite. The same is true here: only looking at all 45
proves SC-001, and states that need a backend failure to reach would never be looked at.

---

## R14 — Notification copy (FR-002)

**Decision**: The design's `push` screen is the **OS's** rendering; what this feature owns is the four
notification **texts** it shows — run assigned, packages ready at a shop, same-day window starting,
short-package report. Those strings are brought into line with the design and pinned by a test.

**Rationale**: FR-002 already carves the presentation out. Pinning the strings is what stops "match the
design" being unverifiable for the one screen we cannot render.

---

## Summary of decisions

| # | Decision |
|---|---|
| R1 | MapLibre Compose 0.17.0 for OSM on both platforms |
| R2 | OpenFreeMap tiles — ⚠ OSM's own server forbids app distribution |
| R3 | Bump driver-mobile to Kotlin 2.4.20 / CMP 1.12.0; contained by build isolation; spikes S1 + S2 gate it |
| R4 | MapLibre confined to one composable, asserted by a guard |
| R5 | Mobile renders General Sans (the fallback face); ⚠ constitution PATCH owed |
| R6 | `AnchoredDraggable` swipe, cancellable, with an accessible equivalent |
| R7 | Promote `EffyPullToRefresh` to mobile-kit; prove customer-mobile unmodified |
| R8 | Photo proof = shared chrome + per-platform surface; iOS gains photo proof it never had |
| R9 | Icons authored into the shared mobile-assets SSOT, verified on a device |
| R10 | Skeletons built from the same primitives as their content |
| R11 | Placeholder data in one file per feature, guarded against register drift |
| R12 | Three cards justified per Principle V; everything else rows and sections |
| R13 | 45 screens = ~24 destinations × states; every state deliberately reachable |
| R14 | Notification copy owned and pinned; presentation is the OS's |

## Open risks carried into the plan

1. **S1 (toolchain bump)** — blocking. Fallback FR-023e recorded.
2. **S2 (iOS linker flags)** — blocking, operator-run, must precede any map work.
3. **MapLibre pre-1.0** — accepted; bounded by R4.
4. **mobile-kit source is shared by three apps** — every edit additive and proven.
