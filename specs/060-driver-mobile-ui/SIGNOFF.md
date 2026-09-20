# Sign-off: 060-driver-mobile-ui

**Date**: 2026-09-20 · **Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED. RUNS ON AN iOS
SIMULATOR — a handful of screens have now been seen. NOT COMMITTED, NOT RUN ON ANDROID, AND THE
45-SCREEN WALK IS STILL UNDONE.**

**90 / 110 tasks.** All **45 in-app design screens** are built. The 20 open tasks are the operator's
walks, two deferrals recorded below, and the remaining polish.

---

## ⚠ Read this first

039 shipped **four live defects behind a fully green suite**, because layout, contrast and hierarchy
are not properties an assertion can see. Everything below is machine-verified. **None of it is
proof that the app looks right.** [quickstart.md §4](./quickstart.md) — 45 screens × 2 appearances,
90 screenshots — is the only thing that closes this feature.

---

## Verified

| Gate | Result |
|---|---|
| `driver-mobile :shared:testAndroidHostTest` | ✅ **34** (26 baseline + 8 guard tests) |
| `driver-mobile :shared:compileKotlinIosSimulatorArm64` | ✅ |
| `driver-mobile :shared:compileTestKotlinIosSimulatorArm64` | ✅ ⚠ the target 033 found had never run |
| `driver-mobile :androidApp:assembleDebug` | ✅ |
| `customer-mobile :shared:testAndroidHostTest` | ✅ **316 — UNMODIFIED** |
| `shop-mobile :shared:testAndroidHostTest` | ✅ **105 — UNMODIFIED** |
| `@effy/design-system test` | ✅ tokens, component shape, token usage |
| `tokens:check` | ✅ **10 generated files match** — no mobile theme moved |
| `mobile-assets:check` | ✅ **138 copies** (was 84) |
| `check-no-emerald` / `check-no-jade` | ✅ |
| No currency anywhere (SC-007) | ✅ swept |
| No shop-audience copy (SC-008) | ✅ swept + guarded |
| No design colour literal (SC-010) | ✅ swept |
| No map key or credential (SC-014) | ✅ swept |
| No "coming soon" destination (SC-002) | ✅ `ComingSoonScreen` **deleted** |

⚠ **The customer/shop unmodified passes are the load-bearing ones.** `packages/mobile-kit` is
`kotlin.srcDir`-included into all three apps, so every edit there compiles into the other two. Those
counts match [BASELINE.md](./BASELINE.md) with **zero test-file edits**.

## Guards, each proven by breaking it

| Guard | Asserts |
|---|---|
| `RouteSerializerGuardTest` | every `AppNavKey` is registered — an omission fails only after process death otherwise |
| `PlaceholderRegisterGuardTest` | code ↔ register agree **in both directions**, and operational placeholders carry no value |
| `MapLibreImportGuardTest` | one import site · ⚠ **never `tile.openstreetmap.org`** · attribution present |
| `AudienceCopyGuardTest` | no shop-audience copy · no currency |

⚠ **Two guards failed their own first proof, and both were real.** The route guard's regex excluded
colons, so every parameterised route read as undeclared. The register guard read a file **outside
the Gradle project**, so editing the register left the test `UP-TO-DATE` and **the guard did not
run** — silent in exactly the case it exists for. Both fixed. 057 recorded the same near-miss.

## The defects this feature fixed

Found while building, none of them in the brief:

1. **Sign-in told drivers they were signing into a shop.** "Shop workspace", "Passwordless access
   for provisioned shop operators" — copied from shop-mobile in 049, shipped through four features.
2. **A locked-out driver saw "check it and try again"** — advice for something that cannot succeed.
3. **`EN_ROUTE` and `ARRIVED` had no screens.** Both states existed since 049; the driver tapped and
   nothing visible changed.
4. **Report-a-problem was one `TextButton`** firing `onReport("missing")` instantly — no package, no
   reason, no note.
5. **Every proof path passed `null` for the note.** The repository has accepted one since 049.
6. **iOS had no photo proof at all** — `rememberPhotoCapture` returns `null` there, so the option was
   hidden. It now works via the system camera.
7. **Activity's unread dots never cleared** — marked read server-side, never updated locally.
8. **History printed "Photo/signature captured" and showed nothing.** The image now renders.
9. **A collection run's record showed a "Proof" heading** it can never have.
10. **The tab bar rendered the first letter of each label** — ⚠ because `sync-mobile-assets.mjs` gave
    driver-mobile `kinds: ["font"]` on a 026 comment promising *"it gains `drawable` when it gets its
    shell"*. 049 gave it a shell. `mobile-assets:check` reported ✅ throughout, because an app
    configured to take nothing is trivially in sync.

## ⚠ A crash found by running it — and a misdiagnosis worth recording

Tapping **Map** killed the app with `SIGABRT` on MapLibre's render thread.

⚠ **The first diagnosis was WRONG.** The simulator log carries
`failed lookup: com.apple.metal.simulator.<app>`, which is benign noise present for most apps. It
was read as "no Metal", and the map was disabled on the simulator on that basis. Two lines further
up, the same log says the opposite:

```
maplibre-compose: Rendered the first map frame with METAL on maplibre-compose-render,
                  extent MapExtent(logical=402x260, physical=1206x780, scale=3.0)
```

**Metal works and the map rendered.** The abort was in **teardown** — repeated
`Host surface lost; closing the render session` — not initialisation, which the stack frame
(`RenderSessionHandle.kt` near `switchThreadState`) also said.

⚠ **The real cause was self-inflicted.** After the Map tab worked, `EffyMapCanvas` was also added to
the Today hero strip and the en-route panel — scope creep beyond the task. Three concurrent MapLibre
instances, **one of them inside a scrolling column** that composes and disposes as the driver
scrolls, churned the render session until teardown raced.

**Fix: exactly ONE live map, on the Map tab, where it has a stable host.** Asserted by
`MapLibreImportGuardTest`. The hero strip and en-route panel are neutral panels pointing at the Map
tab — a 106 dp band behind a card title never justified a native renderer.

`mapRenderingSupported()` remains and returns `true` everywhere. The rule it encodes — *a pre-1.0
third-party renderer must never be able to abort the app* — is still right; the simulator simply is
not where it fails. The wrong reasoning is corrected in the file rather than quietly deleted.

## ⚠ MapLibre was adopted, shipped, and then REMOVED

**Operator decision, 2026-09-20.** MapLibre Compose rendered real OpenStreetMap cartography via
OpenFreeMap and **worked when the app was launched normally** — but **aborted under Xcode's debug
build** every time the Map tab opened: `SIGABRT` on its own render thread
(`RenderSessionHandle.kt`, around `Kotlin_mm_switchThreadStateNative_debug`). The fault is in a
**pre-1.0** library's handoff between native render callbacks and the Kotlin/Native runtime. It is
not fixable from this repository, and an app that cannot be Run from Xcode cannot be developed.

The map is now the **stylised route** that FR-023e recorded as the fallback from the start.

⚠ **Less was lost than it sounds.** Real cartography was always going to draw genuine streets with
**invented pins** — 049 R13: shops carry no address or coordinates, orders carry an un-geocoded
address. The schematic shows only what the platform actually knows: how many stops, in what order,
ending where. **Navigate** — which hands the device's own maps app the real address string — was
and remains how a driver actually routes.

**What removal bought back**: no tile requests, no attribution obligation, no vendor dependency, no
pre-1.0 library, and a debuggable app.

⚠ **`MapLibreAbsentGuardTest` replaces `MapLibreImportGuardTest`** and now asserts the opposite:
MapLibre must not reappear in the catalog, the build file, or any import. It is an easy mistake to
re-make — the dependency is one line, the screen looks like it wants a real map, and **it works
until you run it from Xcode**, so someone could re-add it, see it render, and ship.

⚠ The `tile.openstreetmap.org` prohibition is retained in that guard: OSM's Tile Usage Policy
forbids distributing an app that uses their servers, and that stays true for any future attempt.

## ⚠ THREE wrong diagnoses before that, all recorded

1. **"The simulator has no Metal."** From `failed lookup: com.apple.metal.simulator.<app>` — which
   appears on **every** launch, including the ones where the map rendered. Two lines above it the
   same log says `Rendered the first map frame with METAL`. The system log was read before the
   library's own.
2. **"Three concurrent map instances."** `EffyMapCanvas` had been added to the Today hero strip and
   the en-route panel — scope creep beyond the task, one of them inside a scrolling column.
   Plausible; still crashed with one. ⚠ The change was kept on its own merits.
3. **"Metal API Validation."** A `simctl` launch with `MTL_DEBUG_LAYER=1` appeared to reproduce it
   — but that test was **confounded**: a second copy was running under Xcode at the same time, so
   the observed crash may have been that one. It was presented as proof and was not. A shared
   scheme with validation disabled was committed on that basis and **did not fix it**.

⚠ **The scheme is kept anyway, and is a genuine improvement**: this project had **no shared scheme
at all**, so Xcode generated one per machine and the run configuration was invisible and
unreproducible. It is now explicit and version-controlled.

**The lesson, plainly**: three theories, none tested before acting on it, each presented with more
confidence than the evidence carried. The first two came from reading a log and suspecting a diff;
the third from an experiment that was not actually controlled.

## ✅ Verified on a real iOS simulator## ✅ Verified on a real iOS simulator

The app **builds, installs, runs, and the Map tab renders live OpenStreetMap cartography** on an
iPhone 17 Pro simulator (iOS 26.5). Three defects were found by *looking*, none catchable by a test:

1. **"UP NEXT · 0 shops"** rendered a heading and a "Whole run ›" link over an empty list. The
   spec's own edge case asked whether that section collapses; it did not. Now hidden when empty.
2. **The map opened on the library's default position** — a Melbourne driver was shown the Indian
   Ocean. Now opens on Melbourne, the operating city (registered as a decorative placeholder).
3. **The attribution overlaid MapLibre's own logo and info button**, so two attributions collided
   and neither read cleanly. Moved to a full-width strip below the canvas — a licence obligation
   needs to be legible, not merely present.

## Refusals — design content NOT adopted

| What | Why |
|---|---|
| **Dispatch number `1800 EFFY OPS`** | ⚠ An outward-facing real-world identifier. The constitution requires operator-supplied, **never inferred** — 037 read an address from session context and AWS mailed a real person. Renders as unavailable. **You must supply one.** |
| **"Handed to carrier"** at hub check-in | Nothing has been handed to anyone; 053 established there is no `handed_over` state because the handoff is a later event. → **"Staged for carrier"**. |
| **"Packages return to the hub"** on failure | ⚠ **No return process and no re-attempt scheduling exist** — 056 recorded this is "closed for Effy, NOT for the shopper". The screen says only that dispatch is notified. |
| **ETAs, distances, delivery windows** | No routing engine, no coordinates (049 R13); the delivery promise is date-granular (052 R4). Omitted, never invented. |
| **Flash / flip camera controls** | Neither capture path exposes them — a dead button is worse than none. |
| **"Open Settings" on permission-denied** | Needs a platform intent this app has no driver for. |
| **`tile.openstreetmap.org`** | ⚠ Its Tile Usage Policy **forbids distributing an app that uses it**. OpenFreeMap instead — same data, no key, no billing. |

## ⚠ Recorded deviations

- **T076 — the in-app keypad is NOT on the sign-in code.** It would destroy emailed-OTP autofill and
  paste and discard 036's one-accessibility-node design. `OtpCells` already draws the design's boxes.
  The keypad serves the **delivery** code, where nothing autofills.
- **T018 — the 12 in-screen glyphs are deferred.** Every screen currently uses typographic glyphs
  (`←`, `›`, `✓`, `→`) consistently. ⚠ Authoring vector icons without device verification is exactly
  024's defect: `pathData="M undefined,undefined"` was valid XML that compiled, packaged, and failed
  to inflate at runtime. The six tab icons that *were* authored had their path data tokenised by a
  parser-equivalent check — and still need T019's device look.
- **T093 — notification copy is NOT app-side.** The text is composed by the notifications worker;
  the app only displays what arrives. Changing it is backend work 060 excludes. The in-app
  equivalent — `ActivityItem.headline()` — is built.
- **`SwipeToConfirm` uses stable `draggable`, not `AnchoredDraggable`** (research R6): mobile-kit is
  one source compiled by **two** toolchains now.
- **`STAGED` and `OUT_FOR_DELIVERY` share the detail screen.** The design collapses them; the
  platform distinguishes them and 060 changes no backend behaviour.

## ⚠ The toolchain moved

driver-mobile only, and **five parts**, each forced by the next: Kotlin `2.4.20` · Compose MP
`1.12.0` · `compileSdk 37` · AGP `9.1.0` · Gradle `9.3.1`. New deps: `maplibre-compose`, CameraX,
Coil 3.

It **cannot** reach the other two apps — three independent Gradle builds — which is why it was
affordable. ⚠ It now **diverges** from customer-mobile and shop-mobile (Kotlin 2.4.0 / CMP 1.11.1 /
AGP 9.0.1 / compileSdk 36). Intended, recorded, not drift.

---

## ⚠ Open — all yours

1. ~~**T005 — the Xcode linker flags.**~~ ✅ **NOT NEEDED — verified, not assumed.** The framework and
   the app both link without them; the iOS app **builds, installs and runs**. ⚠ Two real gotchas
   instead: a plain `xcodebuild` fails on `smithy-swift` for **x86_64**, so pass
   `ONLY_ACTIVE_ARCH=YES ARCHS=arm64` (Xcode's GUI defaults to the active arch and is fine); and
   **the Map tab needs a real device** to show cartography (see the Metal crash above).
2. **T105 — the 45-screen walk, 90 screenshots.** ⚠ **The single most important open item.** Nothing
   else here proves the app looks right.
3. **T106** — interaction checks on real hardware: swipe cancel-and-commit, swipe accessibility with
   TalkBack/VoiceOver, per-package ticking, proof notes, drop-spot chips, the keypad, touch targets.
4. **T107** — someone who did not build it walks the shift loop end to end.
5. **T108** — supply the real dispatch number, or leave the field unavailable (which is correct).
6. **T109** — constitution **PATCH v2.0.1**: mobile renders **General Sans**, the fallback face,
   because Geist is not self-hosted. ⚠ Found during planning; the same law-vs-practice gap the
   cobalt amendment closed, reopened elsewhere.
7. **T110 — the commit.** Nothing in this feature is committed.

**Never run:** the Android app on a device, the iOS app at all, and any of the 45 screens in front
of human eyes.
