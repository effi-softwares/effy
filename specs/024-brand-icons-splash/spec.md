# Feature Specification: Brand Marks — App Icons, Splash Screens & Favicons

**Feature Branch**: `024-brand-icons-splash`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "i have the svg that we can use for app icon, logo, splash screens and favicon. for next js app, i have generator files in app folder and public folder. you can use them. but for the mobile apps we need to create ios and android app icons and splash screens with the KMP packages and KMP standard way. here is the svg of the logo that we can use. so with those files we need to create icons for all 3 webapps and 2 android apps and ios apps. so we need to do modification to icon. if we use same icon for customer, shop mobile apps it get confused. so use the given svg for customer apps. for the shop apps edit the svg and make it blue like color. first identify, make a plan with good standard ways"

## Overview

Effy has shipped five client surfaces and is about to ship a sixth, and **not one of them carries the
Effy brand at the point a person first meets it** — the browser tab, the phone home screen, the app
switcher, the moment an app is opening. Two web consoles show no icon at all. All three mobile apps
still launch under the stock Android template robot. No mobile app has a splash screen of any kind.

This feature makes the Effy mark present and correct on every surface, from **one shared vector
source of truth**, in **three colourways** — Emerald for the customer, Blue for the shop, Neutral for
back-office — so that a shop worker with both apps installed, or an admin with three consoles pinned,
can tell them apart at a glance without reading a single label.

It is a **presentation-and-assets slice**: no backend, no database, no infrastructure, no new
product capability. Its risk is not correctness — it is *drift* (six surfaces slowly disagreeing
about what Effy looks like) and *store rejection* (platform icon rules are strict and are enforced at
submission time, not at build time).

## Clarifications

### Session 2026-07-26

- Q: The supplied mark uses the retired Jade palette that the constitution replaced and the repo's guard rejects — how is the conflict resolved? → A: Recolour into the **live Emerald family, legibility-tuned** — bag `#10b981` (emerald-500, already an authored token), fold `#065f46` (the brand accent). No constitution amendment and no guard exemption; the mark stays legible at favicon/small-icon sizes where emerald-800 alone would read near-black.
- Q: How far does the shop blue reach — mark only, or the shop surfaces' UI? → A: **Icon, splash and favicon only.** The blue lives exclusively in the shop's brand mark. Shop app and console UI remain emerald and visually unchanged. Principle V's single-accent rule is untouched, no design token is added, and no Compose theme is regenerated.
- Q: Which blue is the shop colourway? → A: **Blue-500 / blue-800** — bag `#3b82f6`, fold `#1e40af`. The same two scale steps as the emerald pair, so the two marks differ in hue and nothing else; ~57° of hue from emerald, far enough that neither reads as the other at icon size. **⚠ Amended 2026-07-27 (operator request): the shop colourway is now Sky — bag `#0ea5e9` (sky-500), fold `#075985` (sky-800).** Same two scale steps, same shared outline/tag, so FR-014's "hue only" rule still holds — but the gap to emerald narrows from ~57° to ~38°, which makes the SC-002/SC-003 side-by-side observer test load-bearing rather than a formality.
- Q: Supply the platform appearance variants, or let the OS synthesise them? → A: **Supply all three** — iOS dark, iOS tinted, and Android monochrome — for both colourways. The iOS appearance slots are already declared and empty, and the mark's navy outline fails against a dark backdrop if left to auto-derivation.
- Q: Which mark does the back-office console carry? → A: A **neutral / monochrome** colourway — the mark in navy and neutral greys, reusing the single-colour composition FR-007a already requires. This makes all three web surfaces mutually distinguishable in a tab strip, and signals "internal tool" through the absence of brand colour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A customer recognises Effy before the app or page loads (Priority: P1)

A customer installs the Effy shopping app, or pins the storefront to their phone's home screen. From
that moment on, the way they find Effy again is by **looking for the mark** — among thirty other
icons on a home screen, among fifteen open browser tabs. When they tap it, the app spends a moment
starting up; today that moment is a blank white rectangle that reads as a broken app.

**Why this priority**: This is the only surface in the set that a **paying member of the public**
sees. It is also the one that must pass an App Store / Play Store submission review, and the one
where a missing or amateur icon costs real installs. Everything else in this feature is internal
polish by comparison.

**Independent Test**: Install the customer mobile app on a clean iOS device and a clean Android
device, and load the storefront in a desktop and a mobile browser. Verify the Effy mark appears —
correctly cropped and never clipped — on the home screen, in the app switcher, in Settings, in
Spotlight/Search, on the browser tab, in a bookmark, and on the installed-PWA home-screen entry;
and that launching either app shows a branded opening screen rather than a blank frame.

**Acceptance Scenarios**:

1. **Given** the customer mobile app is installed on an Android device, **When** the person views
   their home screen and app drawer, **Then** the Effy mark is shown, correctly composed inside
   whatever icon shape the device's launcher applies (circle, squircle, rounded square, teardrop),
   with no part of the bag clipped and no unintended transparent corner.
2. **Given** the customer mobile app is installed on an iOS device, **When** the person views the
   home screen in light appearance, dark appearance, and tinted appearance, **Then** an appropriate
   Effy mark is shown in each, and the icon has no transparent regions.
3. **Given** the person taps the customer app icon, **When** the app is starting, **Then** a branded
   opening screen bearing the Effy mark is shown on an Effy-branded background, which hands over to
   the app's first screen without a flash of a differently-coloured or blank frame.
4. **Given** the storefront is open in a browser, **When** the person looks at the tab, **Then** the
   Effy mark is legible at tab size, in both a light and a dark browser theme.
5. **Given** the person adds the storefront to their phone's home screen, **When** they view that
   home screen, **Then** the entry shows the Effy mark composed for the platform's icon shape and
   labelled "Effy".

---

### User Story 2 - A shop worker tells the two Effy apps apart (Priority: P2)

Shop staff carry a workplace device. Depending on the person, that device may have **both** the
customer app (to see what a customer sees) and the shop operator app installed. Today those two apps
would be indistinguishable — same name root, same icon — and the operator app is the one that
accepts and picks live orders. Tapping the wrong one mid-shift is a real, repeated cost.

**Why this priority**: It protects a daily working task, but it affects employees on a managed
device rather than the public, and it cannot be tested until US1's mark exists. It is also the
requirement that motivates a **second colour variant**, which is the only genuinely new design
decision in this feature.

**Independent Test**: Install both the customer app and the shop operator app on one device. From
arm's length, at normal home-screen icon size, confirm an untrained person can name which is which
without reading the labels.

**Acceptance Scenarios**:

1. **Given** both Effy mobile apps are installed on the same device, **When** a shop worker views the
   home screen, **Then** the two icons are distinguishable by colour alone at normal icon size,
   without reading either label.
2. **Given** the shop operator app is launched, **When** it is starting, **Then** its opening screen
   carries the **shop** variant of the mark, not the customer one.
3. **Given** the two variants are viewed side by side, **When** a brand reviewer assesses them,
   **Then** they read as **the same mark in two colourways** — the same silhouette, weights and
   proportions — not as two unrelated logos.
4. **Given** the shop operator web console is open in a browser, **When** the person looks at the
   tab, **Then** it shows the **shop** variant, so an operator with the console and the storefront
   both open can tell the tabs apart.

---

### User Story 3 - Every internal console is identifiable in a browser tab (Priority: P3)

Back-office and shop-web are pinned, long-lived tabs in an employee's browser. Both currently render
with the browser's default blank-page icon, which makes them indistinguishable from each other and
from any other tab in a crowded window.

**Why this priority**: Pure daily-friction relief for a small internal audience, with no revenue,
store-review or public-perception exposure. It is genuinely independent — it can ship on its own and
still be worth having.

**Independent Test**: Open back-office and shop-web in adjacent pinned tabs and confirm each shows a
distinct, legible Effy mark.

**Acceptance Scenarios**:

1. **Given** the back-office console is open, **When** the person looks at the browser tab or a
   bookmark entry, **Then** the Effy mark is shown and is legible at tab size.
2. **Given** back-office, shop-web **and the customer storefront** are open as adjacent pinned tabs,
   **When** the person scans the tab strip, **Then** all three are distinguishable from one another.
3. **Given** the back-office mark carries no brand colour, **When** a reviewer compares it to the
   customer and shop marks, **Then** it is still recognisably the same Effy bag.

---

### User Story 4 - The brand cannot silently drift out of sync (Priority: P3)

Six surfaces now need the same mark in dozens of derived sizes. The failure mode is not a bad icon —
it is **a good icon that decays**: someone updates one surface, four others keep the old mark, and
nobody notices for months because no test fails. The platform already solved exactly this problem for
colour tokens (one authored source, derived committed artifacts, a check that fails when they
diverge).

**Why this priority**: It buys nothing a user can see today, and everything about what the set looks
like in a year. It is deliberately last because it is only meaningful once the marks from US1–US3
exist to be guarded.

**Independent Test**: Change the authored mark, do not regenerate the derived assets, and confirm the
repository's own checks fail with a message naming what is stale.

**Acceptance Scenarios**:

1. **Given** the authored mark is the single source, **When** any derived asset for any surface is
   regenerated, **Then** it is produced from that source and from no other input.
2. **Given** the authored mark has been edited, **When** the derived assets have not been
   regenerated, **Then** the repository's verification fails and names which surface is stale.
3. **Given** a new surface is added later, **When** its icons are needed, **Then** they are produced
   by the same documented, repeatable process rather than by hand.

---

### Edge Cases

- **The mark is not square, and it is not centred.** The artwork occupies roughly half the width and
  three-quarters of the height of its canvas, sitting above centre. Naive scaling into a square icon
  produces a mark that looks small, low, and off-balance, and one that Android's adaptive-icon mask
  will clip. Every target needs a deliberate composition decision, not a resize.
- **Android launchers apply a shape the app does not control.** The same icon is masked to a circle
  on one device and a squircle on another. Anything outside the mask's safe region is cut.
- **Store rules are enforced at submission, not at build.** An icon with a transparent background is
  accepted by the local build, runs fine on a device, and is rejected by the App Store — days later,
  after everything else is done.
- **A tab favicon is roughly 16 pixels.** A mark with fine strokes (the tag's diagonal lines, the
  bag's handles) can turn to mud at that size and may need a simplified composition rather than a
  straight reduction.
- **Dark backgrounds.** A mark with a near-white element reads on a light tab strip and can
  disappear, or grow a halo, on a dark one. Both appearances must be checked, not assumed.
- **Modern platforms request variants the base mark cannot satisfy**: a themed/monochrome treatment,
  and dark and tinted appearances. When these are not supplied, the platform derives its own — usually
  badly. Each is a decision to take or to consciously decline.
- **Opening screens differ by platform generation.** Older and newer OS versions build the opening
  screen from different inputs; supplying only one produces a branded launch on new devices and a
  blank or default one on older devices in the supported range.
- **The two colourways must survive being seen apart.** Distinctness is easy to judge side by side
  and is what actually matters when a person sees only one of them.
- **The existing partial assets are stale.** The generator output already sitting in the storefront
  was produced from a raster copy of the mark in the platform's **retired** brand colours; treating it
  as a starting point would propagate both problems.

## Requirements *(mandatory)*

### Functional Requirements

#### The source of truth

- **FR-001**: The platform MUST hold the Effy mark as **one authored vector source**, versioned in
  the repository, from which every icon, opening screen and favicon for every surface is derived.
- **FR-002**: Each surface variant (**Emerald**, **Blue**, **Neutral**) MUST be expressed as a
  **colourway of that one mark** — identical silhouette, proportions and weights — and MUST NOT be
  independently redrawn.
- **FR-003**: Every derived asset MUST be reproducible by a **documented, repeatable process** that
  any contributor can re-run to produce byte-identical output, with no manual image editing step.
- **FR-004**: The mark's colours MUST be drawn **only from the platform's live authored palette**. The
  supplied artwork's two greens are values the platform formally retired, so the customer colourway
  MUST be recoloured to the **Emerald family**: the bag body to `#10b981` and the fold shadow to
  `#065f46`. The navy outline `#0C1D36` and the off-white tag `#F4F5F7` are unchanged. The retired
  values MUST NOT appear in any shipped asset, and this MUST be achieved **without** amending the
  brand law and **without** exempting anything from the repository's existing no-Jade sweep.
- **FR-004a**: The mark MUST remain **legible at the smallest size each surface renders it** — this is
  why the bag body takes the lighter emerald rather than the accent alone, which reads near-black at
  favicon size and on dark tab strips.

#### What every surface must show

- **FR-005**: All **six** client surfaces MUST present the Effy mark wherever their platform offers a
  brand slot: the three web surfaces in the browser tab, bookmarks, and history; the two in-scope
  mobile apps on the home screen, in the app switcher, in system settings, and in device search.
- **FR-006**: Each mobile app MUST supply a mark for **every size and variant its platform requests**,
  such that the platform never has to synthesise, upscale or crop one on the app's behalf.
- **FR-007**: Mobile app icons MUST be composed so that the mark remains **fully visible and visually
  centred** under every icon shape the platform may apply, including the most aggressive crop.
- **FR-007a**: Each mobile app MUST supply the platform's **appearance variants** rather than letting
  the OS synthesise them: a dark-appearance and a tinted-appearance treatment on iOS, and a
  single-colour themed treatment on Android. Each MUST be an authored composition of the same mark —
  in particular, the dark treatment MUST keep the silhouette legible where the navy outline would
  otherwise be lost against a dark backdrop, and the single-colour treatments MUST remain
  recognisable as the Effy bag when hue is stripped away.
- **FR-008**: The customer storefront MUST additionally present the mark in its **installed-to-home-screen**
  form, correctly composed for the platform's icon shape, under the name "Effy".
- **FR-009**: Web favicons MUST remain **legible at browser-tab size** and MUST be verified against
  both a light and a dark browser theme.

#### Opening screens

- **FR-010**: Both in-scope mobile apps MUST show a **branded opening screen** carrying their own
  variant of the mark on an Effy-branded background while the app starts.
- **FR-011**: The opening screen MUST hand over to the app's first screen **without an intervening
  blank, white, or differently-coloured frame**.
- **FR-012**: The opening screen MUST render correctly across the **full range of OS versions each app
  supports**, not only the most recent.
- **FR-013**: The opening screen MUST respect the platform's light and dark appearance, consistent
  with the app's existing user-selectable appearance behaviour.

#### Distinctness

- **FR-014**: The customer apps MUST use the Emerald colourway (FR-004), and the shop apps MUST use
  the **Sky colourway**: bag `#0ea5e9`, fold `#075985` (amended 2026-07-27 from blue-500 `#3b82f6` /
  blue-800 `#1e40af`), with the navy outline `#0C1D36` and off-white
  tag `#F4F5F7` shared with the customer mark. The two colourways MUST differ **in hue only** — the
  same two scale steps applied to a different hue — so they remain recognisably one mark.
- **FR-014a**: The sky blue MUST exist **only within the brand mark and the assets derived from it** —
  icons, opening screens and favicons. It MUST NOT be added to the design tokens, MUST NOT alter the
  accent, focus, or any other colour in the shop app's or shop console's interface, and MUST NOT cause
  any Compose theme to be regenerated. The shop surfaces' UI remains visually identical to today.
- **FR-015**: The two variants MUST be distinguishable **by colour alone at normal home-screen icon
  size**, judged without reading the labels.
- **FR-016**: The shop operator **web console** MUST use the same shop variant as the shop mobile app,
  so one audience has one mark across its two surfaces.
- **FR-016a**: The **back-office** console MUST use a third, **neutral** colourway — the mark rendered
  without brand colour — so that all three web surfaces are mutually distinguishable in a tab strip,
  and so the internal admin tool is not mistaken for the public storefront. This colourway MUST be the
  same single-colour composition required by FR-007a, not a separately authored one.

#### Housekeeping this feature must not leave behind

- **FR-017**: The **incomplete and stale** brand assets currently sitting unversioned in the customer
  storefront MUST be replaced by generated output from the authored source, and any stray or duplicate
  files among them removed — not merely added to.
- **FR-018**: Where a surface declares brand metadata (application name, theme colour, background
  colour) alongside its icons, that metadata MUST be **correct and effective** — declared in a form
  the surface's framework actually honours, and carrying the platform's real brand colours rather than
  placeholder defaults.
- **FR-019**: The feature MUST NOT alter application behaviour, data, or any backend, infrastructure
  or database artifact.

#### Not in this feature

- **FR-020**: The **driver** mobile app is **out of scope** and retains its current placeholder icon;
  it is a template app with no product surface yet, and its branding belongs to the slice that builds
  it. This feature MUST NOT be read as having branded all three mobile apps.

### Key Entities

- **Authored mark**: the single vector artwork defining the Effy silhouette — the bag, its handles,
  the tag and its detail. The origin of every other asset in this feature.
- **Colourway**: a named colour assignment over the authored mark — **Emerald** (customer), **Blue**
  (shop), **Neutral** (back-office and the platforms' single-colour treatments). Carries no geometry
  of its own.
- **Composition**: a rule for placing the mark inside a given target frame — how much padding, what
  background, what safe region — chosen per platform slot rather than shared.
- **Derived asset**: any concrete icon, opening-screen image or favicon produced from a
  (mark × colourway × composition) combination for a specific surface and slot.
- **Surface brand metadata**: the name, theme colour and background colour a surface declares
  alongside its icons.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **All six** client surfaces display an Effy mark in every brand slot their platform
  offers — measured as a count of surfaces with zero missing slots. Baseline today: **0 of 6**.
- **SC-002**: A person shown the two mobile app icons side by side at normal home-screen size, with
  labels hidden, correctly identifies which is the shop app **at least 9 times out of 10**.
- **SC-003**: The same people, asked whether the two marks belong to the same brand, answer **yes**
  in at least 9 of 10 cases — distinctness is achieved *without* fracturing the brand.
- **SC-004**: On every device and launcher shape tested, **no part of the mark is clipped** and the
  mark is visually centred — 0 clipping defects across the tested matrix.
- **SC-005**: Both in-scope mobile apps show a branded opening screen on **100%** of cold launches
  across the supported OS-version range, with **no blank or off-brand frame** observed between the
  opening screen and the first app screen.
- **SC-006**: Each app icon passes its store's published icon requirements on **first submission
  check**, with zero icon-related rejections.
- **SC-007**: Every favicon is judged legible at browser-tab size against **both** a light and a dark
  browser theme — 0 illegible results.
- **SC-007a**: With all three web surfaces open as adjacent pinned tabs, an observer correctly names
  which tab is which from the icon alone in at least **9 of 10** attempts.
- **SC-007b**: Every supplied appearance variant (iOS dark, iOS tinted, Android themed) is judged
  **recognisable as the Effy bag** on device — 0 results where the silhouette is lost, and 0 cases of
  the OS falling back to a synthesised icon.
- **SC-008**: Editing the authored mark without regenerating derived assets causes the repository's
  verification to **fail**, naming the stale surface — demonstrated by deliberately breaking it.
- **SC-009**: Regenerating all assets from an unchanged source produces **byte-identical** output,
  proving the process is deterministic.
- **SC-010**: The retired brand colour values appear in **zero** shipped brand assets, verified by the
  platform's existing no-Jade sweep passing.
- **SC-011**: The feature changes **no** backend, database or infrastructure artifact — verified as a
  zero-file diff outside client surfaces and shared design packages.
- **SC-012**: All existing quality gates — type checks, test suites, builds, the client bundle-size
  budget, and the mobile guards — remain green, with the customer storefront's guest bundle **not
  increased** by this feature.

## Assumptions

These are the reasonable defaults chosen where the request did not specify. Each is a decision the
plan will act on unless corrected.

- **Brand colour**: settled — see Clarifications and FR-004. The customer mark is recoloured into the
  Emerald family (bag `#10b981`, fold `#065f46`), which keeps every value inside the authored token
  palette, so no constitution amendment and no guard exemption are needed.
- **Shop blue**: settled — see Clarifications and FR-014/FR-014a. Sky-500 `#0ea5e9` over sky-800
  `#075985` (amended 2026-07-27 from blue-500/blue-800), confined to the mark and its derived assets;
  no token added, no UI changed.
- **Vector source**: the supplied `logo.svg` — a compact, hand-authored vector of flat named colours
  — is the authored source (FR-001). No tracing, redrawing or commissioning of new artwork is in
  scope. Its non-square, above-centre composition is treated as an input to per-target composition
  (FR-007), not as a defect to redraw.
- **The existing storefront generator output** (the wrapped-raster "svg", the icons, the manifest, the
  duplicate favicon) is treated as **input to be replaced**, not as a foundation — it was produced
  from a raster copy in the retired palette.
- **Surface-to-variant mapping**: settled — customer storefront + customer mobile → **Emerald**; shop
  console + shop mobile → **Blue**; back-office → **Neutral** (FR-016a). Three colourways, one mark.
- **Driver mobile** is excluded (FR-020), per the request naming three web and two mobile apps.
- **No new artwork**: no wordmark, lockup, or brand-guidelines document is produced here. This feature
  ships marks, not a brand system.
- **Appearance variants**: settled — all three are supplied (FR-007a), for both colourways. Note this
  makes the tinted and monochrome treatments the one place where the mark must work **without colour**,
  so the silhouette carries the recognition; that is a composition decision, not a recolour.
- **Verification is partly human.** Clipping, legibility and distinctness (SC-002, SC-003, SC-004,
  SC-007) cannot be asserted by an automated test; they are signed off by inspection on real devices
  and browsers, following a documented matrix. Determinism and staleness (SC-008, SC-009, SC-010) are
  machine-enforced.
- **Operator-run steps**: installing on physical iOS and Android devices, and any store submission,
  are performed by the operator, consistent with how this project divides work.

## Dependencies

- The **authored vector** (`logo.svg`) must be committed into the repository before any asset can be
  generated from it. It currently exists only outside the project.
- The **brand-colour question (FR-004)** blocks final asset generation: producing the full matrix
  before it is settled means producing it twice.
- The platform's existing **design-token source** is where any new named colour (the shop blue) must
  land, so that the mark and the app it launches never disagree.
- Physical **iOS and Android devices** are required to sign off SC-004 and SC-005; simulators do not
  reproduce the full range of launcher icon shapes.
