# Research: Monochrome Design Language & Customer Mobile Rebuild (026)

**Phase 0 output.** Resolves every NEEDS CLARIFICATION in [plan.md](plan.md) Technical Context.
Source-design facts live in [figma-source-findings.md](figma-source-findings.md); this file records
**decisions**.

---

## R1 — The semantic colours, and why both need AA tuning

**Decision**: adopt the source's two semantic hues, but **tune the red** and **restrict the green to
non-text use**.

| Role | Source value | Effy value | Ratio | Basis |
|---|---|---|---|---|
| Error / destructive (light) | `#ED1010` | **`#e01010`** | 4.94:1 vs white | WCAG AA text 4.5:1 |
| Error / destructive (dark) | — | **`#ff6b6b`** w/ `#0a0a0a` label | guard-verified | lifted for the dark ground |
| Success | `#0C9409` | **`#0C9409` unchanged** | 4.00:1 vs white | non-text indicator, WCAG 1.4.11 → 3:1 |

**Rationale.** The source's `#ED1010` measures **4.48:1** against white — it misses AA normal-text.
`check-tokens.mjs` holds `destructive-foreground/destructive` to 4.5 and would fail the build.
`#e01010` clears at **4.94:1** and is visually indistinguishable at UI sizes. (All ratios in this file
were computed with the same luminance formula the guard uses, not estimated.) This is the same move 017 already made when the supplied terracotta `#d0735a` was tuned to
`#bf5540` — precedent exists, and FR-015a makes the floor binding.

The green measures **4.00:1** against white, which fails text but **passes the 3:1 bar for non-text UI
components**. In the source it is only ever a **field border and a ✓ glyph** — never a fill carrying
text. So it is adopted **unchanged and constrained**: success is a non-text indicator, and if a future
screen wants white text on a green fill, the value must be re-tuned then. Recorded as a rule, not left
to chance.

**Alternatives rejected**: (a) drop both hues for a strictly hueless palette — rejected because the
source declares them as tokens and removing them makes error and success *harder* to read, not purer;
(b) ship `#ED1010` as-is with a contrast exemption — rejected outright by FR-015a.

---

## R2 — FR-022: how customer and shop stay distinguishable without a hue

**Decision**: **ground polarity**, not hue. Each surface's mark keeps one mark and one neutral ramp,
and differs by whether the mark is **dark-on-light** or **light-on-dark**.

| Surface | Ground | Mark | Reads as |
|---|---|---|---|
| customer (web + mobile) | light `#F4F5F7` | near-black `#1A1A1A` | a light tile |
| shop (web + mobile) | near-black `#1A1A1A` | off-white `#F4F5F7` | a dark tile |
| back-office | mid `#808080` | near-black `#1A1A1A` | a grey tile |

**Rationale.** This was the spec's one genuinely unsolved problem. 024 separated the marks purely by
`body`/`fold` hue (emerald vs sky) while `outline` and `tag` stayed shared — remove hue and the three
colourways collapse into the same asset.

Polarity is the strongest non-hue signal available: the two grounds sit at **15.95:1** against each
other, so the icons are distinguishable at 16 px, in grayscale, at a glance, on any wallpaper, and by
a colour-blind user. Lightness-only variation within one polarity (e.g. `#333` vs `#666` marks on the
same light ground) was **tested against the requirement and rejected** — at launcher size on a busy
wallpaper those two read as the same icon.

### R2a — what implementing polarity actually required (29/07)

Three things the decision implied that were not obvious until the code was written:

1. **Ground had to move from the composition to the colourway.** Compositions owned `background`, so
   every surface got the same white tile — a light mark on it would be invisible. Compositions now
   keep deciding *whether* a target has a ground (and the alpha policy); a `groundFromColourway` flag
   lets the colourway decide *which*. ⚠ `ios-dark` and `ios-tinted` deliberately **do not** take the
   flag: the first is the dark-appearance icon and must stay dark on every surface, the second needs
   black for iOS's luminance-derived tinting.
2. **The Android adaptive BACKGROUND layer was a hardcoded `#ffffff`.** That is the tile the mark sits
   on, so it now derives from the colourway's ground. Left alone, shop's light mark would have been
   rendered invisible on a white tile.
3. **`mid` needed a distinct MARK, not just a distinct ground.** The favicon composition has no ground
   at all, so a colourway varying only `ground` emitted a favicon **byte-identical to customer-web's**
   — the two would have been indistinguishable in a tab strip. Caught by the new "no two colourways
   are the same asset" test. `mid` became a *third polarity* (light mark on mid-grey) rather than a
   third lightness.

Also found by the new "the palette is hueless" test: the mark's off-white `#F4F5F7`, inherited from
024, is **blue-tinted** (r≠g≠b). Replaced with a true neutral `#F5F5F5`.

**Measured**: light/dark grounds 15.96:1 apart; every colourway's body-on-ground ≥3.16:1,
outline-on-ground ≥3.95:1, tag-on-outline ≥17.40:1.

**Consequence for `packages/brand`**: `COLOURWAYS` stops meaning "hue" and starts meaning "polarity".
Rule **C2** (shared `outline` + `tag` keep the marks one mark) **must be restated** — under polarity
the *geometry* is what is shared and the *values* necessarily differ, so C2 becomes "all colourways
draw the same paths from the same slot set", enforced by the existing unit tests with updated
expectations. This is a real change to that package's invariant and must be recorded in its header.

---

## R3 — The typeface cannot be installed the way the current one is

**Decision**: **self-host General Sans from local files on all six surfaces.** Every existing font
mechanism in the repo has to change.

| Surface | Today | Becomes |
|---|---|---|
| customer-web | `next/font/google` → `Nunito_Sans` | **`next/font/local`** |
| shop-web, back-office | `@fontsource-variable/nunito-sans` | **local `@font-face`** |
| 3 mobile apps | `composeResources/font/nunito_sans_*.ttf` | `general_sans_*.ttf` |
| shared | `packages/design-system/mobile-assets/font/` + `sync-mobile-assets.mjs` | same pipeline, new files |

**Rationale.** **General Sans is not on Google Fonts** — it is published by Fontshare (Indian Type
Foundry). `next/font/google` therefore cannot resolve it, and no `@fontsource` package exists. This is
the single most under-appreciated cost in the feature: it is not a token edit, it is a font-pipeline
replacement on six surfaces plus the shared mobile-asset sync and its drift check.

**Weights**: the source uses Regular 400, Medium 500, SemiBold 600 — all published by Fontshare.
⚠ **It never uses Bold 700.** The current generator's type scale is Bold-led
(`displayLarge`/`headline*`/`titleLarge` are all `FontWeight.Bold`), so `effyTypography()` must be
rewritten **SemiBold-led**. This also makes **025's deferred T113** (ship a Nunito Sans ExtraBold for
web-parity display type) **moot** — close it as superseded rather than carrying it forward.

### R3a — what the download actually contained (29/07), and what had to be done to it

The operator's `general-sans.zip` is Fontshare's **desktop** package. Three things about it changed
the work:

**1. It is CFF/PostScript OTF only — no TTF, no WOFF2.** So two different derivations were needed:

| Committed | Format | Operation |
|---|---|---|
| `mobile-assets/font/general_sans_*.ttf` | TrueType `glyf` | **Real conversion** — cubic → quadratic |
| `src/fonts/general_sans_*.woff2` | WOFF2 (CFF kept) | **Lossless repackage** |

⚠ The TTF conversion was first attempted by hand with fontTools and needed a patch per failure —
`maxp` hinting fields, then glyph bounds, then the `post` table. That is the shape of a font that
compiles, packages, and then fails to render (the 024 VectorDrawable lesson). It was **abandoned in
favour of the maintained `otf2ttf`**, which produced correct output first time. Verified after
conversion: `usWeightClass` 400/500/600, upem 1000, 436 glyphs, 384 cmap entries, full Latin +
punctuation + currency.

**2. It ships NO licence file.** The only licence statement that travelled with the files is embedded
in the `name` table, and it is **not permissive-by-default**:

> "You agree to identify the ITF fonts by name and credit the ITF's ownership of the trademarks and
> copyrights in any design or production credits."

**⚠ ATTRIBUTION IS REQUIRED.** Effy needs a credits home — a Legal/Credits entry on the storefront and
in the mobile account area — before this ships publicly. `OS/2.fsType = 0` (Installable Embedding, no
restriction) so embedding itself is unrestricted. Recorded in
`packages/design-system/mobile-assets/font/LICENSE.md`; full terms at <https://fontshare.com/terms>
still need an operator read (T005 / SC-018).

**3. Fontshare's desktop naming makes each weight its own family** ("General Sans", "General Sans
Medium", "General Sans Semibold"). Harmless here — both Compose and the CSS `@font-face` bind weights
explicitly — but it would break any OS-level family matching.

### R3b — the web hosting decision (deviates from R3 as planned)

R3 planned `next/font/local` for customer-web and local `@font-face` for the two Vite consoles.
**Implemented instead as a single `@font-face` block in `tokens.css`**, so all three web surfaces get
the typeface from the same import that gives them the palette. One mechanism, one source, Principle II
— and no app carries a font config at all.

⚠ **The tradeoff, recorded rather than hidden**: `next/font/google` supplied a metric-matched fallback
(`size-adjust`) that eliminated swap-induced layout shift. A plain `@font-face` with `font-display:
swap` does not. The faces are ~23 KB and same-origin so the swap window is short, but **if CLS
regresses on the storefront, the fix is `next/font/local` pointing at the same committed WOFF2 with
`adjustFontFallback` — not a second copy of the font.** Flagged in `layout.tsx` too.

Verified in the production build: `@font-face` emits on all three surfaces with correct hashed URLs,
`--font-sans` resolves to `"General Sans"`, and **zero Nunito references remain in production output**
(the only hits are stale `.next/dev/` artifacts).

---

## R4 — Dark appearance: the accent inverts polarity

**Decision**: derive dark by **inverting the accent's polarity**, not by inverting the ramp.

| Token | Light | Dark |
|---|---|---|
| `--background` | `#FFFFFF` | `#1A1A1A` |
| `--foreground` | `#1A1A1A` | `#FFFFFF` |
| `--card` | `#FFFFFF` | `#333333` |
| **`--primary`** | **`#1A1A1A`** | **`#F5F5F5`** |
| **`--primary-foreground`** | **`#FFFFFF`** | **`#1A1A1A`** |
| `--border` | `#E6E6E6` | `#4D4D4D` |
| `--muted-foreground` | `#666666` | `#B3B3B3` |
| `--ring` | `#1A1A1A` | `#FFFFFF` |

**Rationale.** The naive derivation — keep `--primary: #1A1A1A` and darken the ground, as the emerald
theme legitimately does — **fails in monochrome**: a near-black primary button on a near-black ground
is invisible. Emerald could hold its value across appearances because it is a hue distinct from both
grounds; a neutral accent has no such luxury. So in dark appearance the accent **becomes near-white
with a near-black label** — the standard monochrome-system resolution.

The ramp itself is not inverted wholesale, because a straight inversion would make `--card` lighter
than `--background` in a way that reads as an artefact. Instead each role is re-selected from the same
10-step neutral ramp for its appearance, which is why FR-014 says "derived, preserving character",
not "inverted".

**Consequence**: the `--secondary` / `--accent` hover steps must be re-picked per appearance too, and
`check-tokens.mjs` verifies all 12 pairs in both — unchanged mechanism, new values.

---

## R5 — `letterSpacing: -5` is percent, and H1's line height will clip

**Decision**: treat the source's letter-spacing as **percent** → `-0.05em` (CSS) / `(-0.05).em`
(Compose). Treat H1's `lineHeight: 0.8` as a **display-only** treatment, never applied to arbitrary
strings.

**Rationale.** The source reports `lineHeight` as unitless multipliers (0.8 / 1.0 / 1.2 / 1.4), which
is percentage-mode; letter-spacing in the same variable set is therefore also percentage-mode. Read as
px, `-5` at 16 px body would be catastrophic (−31 %); read as percent it is a normal tight-display
treatment. **Verification is mandatory before the value is committed**: render "Discover" at H2 and
compare against `Homepage.jpg`, which is a pixel-accurate export.

H1 at 64 px with line height 0.8 resolves to **51.2 px — below the cap height**. It is intentional for
one- or two-word display strings (the Onboarding screen) and **will clip descenders** on anything
longer. Applied as a token it is a latent defect, so it is scoped to a display style used only where
the source uses it, and FR-043's max-text-size check is the guard.

---

## R6 — Type scale mapping

The source's 14 styles map onto the existing generated `Typography` slots. Sizes are the source's;
weights become SemiBold-led per R3.

| Source | Size/weight | Compose slot | Web |
|---|---|---|---|
| H1/SemiBold | 64 / 600 / lh 0.8 / −5 % | `displayLarge` | `text-6xl` display |
| H2/SemiBold | 32 / 600 / lh 1.0 / −5 % | `headlineLarge` | `text-3xl` |
| H3/SemiBold | 24 / 600 / lh 1.2 | `headlineMedium` | `text-2xl` |
| H4/SemiBold | 20 / 600 / lh 1.2 | `titleLarge` | `text-xl` |
| H4/Medium | 20 / 500 / lh 1.2 | `titleMedium` | `text-xl` medium |
| B1 R/M/SB | 16 / 400·500·600 / lh 1.4 | `bodyLarge` / `labelLarge` | `text-base` |
| B2 R/M/SB | 14 / 400·500·600 / lh 1.4 | `bodyMedium` / `labelMedium` | `text-sm` |
| B3 R/M/SB | 12 / 400·500·600 / lh 1.4 | `bodySmall` / `labelSmall` | `text-xs` |

⚠ B2 = 14 is **inferred** — the source's `Typograhy` sheet lists a B2 row but no size was recoverable
from the variable dump. 14 is the only value consistent with the 16/12 neighbours and the rendered
screens. Confirm by measuring a B2 string before committing.

---

## R7 — Navigation: keep Effy's five tabs (FR-031a decision)

**Decision**: **keep the existing destination set** — Home · Browse · Search · Orders · Account — and
restyle it in the source's idiom (filled icon + bold label + underline indicator).

**Rationale.** The spec asked for this to be an explicit decision rather than an absorbed restyle.
Both sets are five tabs, so the choice is purely *which five*:

| | Home | Browse | Search | Saved | Cart | Orders | Account |
|---|---|---|---|---|---|---|---|
| Source kit | ✓ | | ✓ | ✓ | ✓ | | ✓ |
| Effy today | ✓ | ✓ | ✓ | | | ✓ | ✓ |

Adopting the source's set would **drop Browse**, and Browse in primary navigation is a **signed-off
requirement of 025** (FR-009/FR-010) written specifically because the browse entry used to be a
dead-end placeholder. Regressing it to satisfy a fashion kit's IA would undo the fix. Cart already has
a badged entry in the chrome, and Saved already lives under Account — both remain one tap away.

**Alternative considered**: promote Cart into the bar (grocery carts are high-frequency) by moving
Orders under Account. Rejected for this slice as a **structural change beyond a presentation refresh**
— FR-001 and FR-017 bound this feature to appearance. Recorded here as a candidate for a later slice.

---

## R8 — Cart lines: the source already supplies the row

**Decision**: render cart and order lines using the source's **third card variant** — the borderless
`image · name · price · action` row.

**Rationale.** The kit's `Cards` sheet defines exactly three containers: the product tile (kept — the
constitution's recorded exception), the bordered cart line (the Principle V conflict), and a
**borderless list row**. Adopting variant 3 satisfies FR-005 **without deviating from the design
language**, because it *is* the design language. No justification entry is needed in the plan's
Complexity Tracking — there is no violation to justify.

---

## R9 — Backend path: none (Principle III)

**Decision**: **no backend path is used.** No hot-path and no cold-path work.

**Rationale.** Principle III requires every plan to declare its path. This feature adds no server
capability (FR-002), reads no new data, and changes no contract. Order tracking (FR-036) is rendered
**entirely from order state the customer surface already receives**. Declaring "none" is the honest
answer, and the boundary is enforced by FR-002 rather than by a path choice.

---

## R10 — Disabled controls

**Decision**: the source's disabled button (white label on `#CCCCCC`, **1.61:1**) is **not adopted**.
Disabled becomes `#E6E6E6` fill with a `#808080` label (**3.16:1**) plus the platform's existing
`disabled` semantics for assistive technology.

⚠ An earlier draft of this section said "≈3.9:1". That was wrong — recomputed with the guard's own
luminance formula the pair is **3.16:1**, which clears the 3:1 non-text bar but with far less headroom
than 3.9 implied. If a future change darkens the fill or lightens the label, this pair fails quickly.

**Rationale.** FR-015a makes the contrast floor binding over source fidelity. Note that WCAG exempts
*disabled* controls from the contrast minimum, so this is a deliberate choice to exceed the standard
rather than a requirement — but a 1.6:1 control is unreadable in sunlight and the platform has never
shipped one. The state is additionally conveyed by the accessibility layer, so meaning does not rest
on the fill (FR-040).

---

## R11 — Placeholder-backed screens (FR-035)

**Decision**: screens standing on absent capabilities render from a **single clearly-named fixture
module**, not from scattered literals, and each carries a **recorded owning slice**.

| Screen | Capability status | Owning slice |
|---|---|---|
| Notifications, Notifications-Empty | no notifications capability exists | a future `notifications` slice |
| FAQs, Help Center, Customer Service | static content, no CMS | content-owned; static is the shipped answer |
| Order tracking | **real** — 020 fulfilment states | none; it is real data |

**Rationale.** FR-035 requires placeholder content to be evident to the operator and never presented
to a shopper as a real event. One fixture module makes both testable: its presence is greppable, and a
test asserts no fixture identifier is reachable from a production build path. Order tracking is called
out because it is the one new screen that is **not** placeholder — it renders 020's real state machine,
constrained by FR-037 to disclose no location, map, or courier.

---

## R12 — Brand assets: the colourway axis is replaced, not recoloured

**Decision**: `packages/brand` keeps its architecture — authored master → committed derived assets →
drift check that names the stale surface — and changes only what a "colourway" means (R2).

- `SLOTS` values in `src/logo.svg` are recoloured to the neutral ramp.
- `COLOURWAYS` becomes `{ light, dark, mid }` polarity variants.
- `mono()` stays as-is for the Android themed layer and iOS tinted appearance; it is already hueless
  and is the one derivation that gets *simpler* under this change.
- `SPLASH_GROUND` (024's brand-colour splash grounds, `#4ade80` / `#3b82f6`) is restated to the
  neutral ramp per polarity, remaining asset-local under rule C4.
- `RETIRED_JADE` gains a sibling **`RETIRED_EMERALD`**, whose authoritative content is
  [data-model.md §4](data-model.md) — **ten** values, proved absent by the same test.
  ⚠ An earlier draft of this section listed only five (`065f46, 10b981, d0735a, 0ea5e9, 075985`),
  omitting both terracotta appearances (`bf5540`, `dd8368`), the dark-mode emerald ring (`69b08b`),
  and **both 024 splash grounds** (`4ade80`, `3b82f6`) — precisely the values most likely to survive a
  sweep, since they live in `.mjs` and `.xml` files the old guard never scanned. Do not re-derive the
  list here; cite data-model §4.

**Determinism (SC-006) and the aapt2 lesson**: 024's converter shipped a live-only defect where
invalid `pathData` compiled and packaged but failed to inflate at runtime. `assertRenderable()` and
its 17 regression tests exist because of it. **No geometry changes in this feature** — only fills — so
that surface is not re-opened, but the full brand test suite (101 tests) is a required gate.

---

## R13 — Guards: what must exist before the palette moves

**Decision**: build the guard **before** the change, and prove it by breaking it.

1. **`scripts/check-no-emerald.sh`** — the sibling of `check-no-jade.sh`, scanning the same file types
   for `065f46|10b981|d0735a|bf5540|dd8368|69b08b|0ea5e9|075985|4ade80|3b82f6`.
   ⚠ `check-no-jade.sh` excludes `*.test.ts` so guard tests may name forbidden values; the new script
   must do the same, and must **also** exclude `packages/brand/src/colourways.mjs` where
   `RETIRED_EMERALD` legitimately names them. Extend the include list to `.mjs` and `.xml` — the
   current script covers `.css/.ts/.tsx/.kt/.svg` only, which would **miss** the Android
   `values/colors.xml` splash grounds and the brand package's `.mjs`.
2. **`check-tokens.mjs`** — unchanged mechanism, new values; must pass with **zero exemptions**.
3. **`tokens:check`** (`check-compose-theme.mjs` + `check-mobile-assets.mjs`) — must be run after
   regeneration; the mobile-assets check covers the font files, so it catches a half-migrated typeface.
4. **`brand:check`** — must fail on stale/orphaned/missing, proved three ways (SC-005).

**Rationale.** 011's research D11 recorded the lesson that a guard reported clean while broken because
it matched only direct imports. 024 repeated a version of it. The rule this feature inherits: **break
the guard the way it will actually break, before trusting it.**

### R13b — applying that rule found a second dead guard (29/07)

Running T038's three negative proofs against `brand-check` showed **STALE and MISSING fired, ORPHANED
did not**. The mechanism was fine; the **coverage** was not. `MANAGED_DIRS` listed `public/`,
`drawable/` and `LaunchLogo.imageset/` but **not** the ten `mipmap-*` directories or either
`AppIcon.appiconset` — so a stale legacy mipmap or a leftover app icon could survive a colourway
change indefinitely, which is precisely the failure mode 024 wrote the check for.

Widened, and re-proved by planting an orphan in each newly-watched directory. A narrow
`MANAGED_DIR_EXEMPT` (`Contents.json`, `.gitkeep`) covers the platform sidecars the toolchain owns —
narrower and more honest than not watching their directory at all.

⚠ **One gap remains and is recorded rather than hidden**: `apps/customer-web/app/` cannot be watched,
because the Next.js App Router puts `icon.svg` / `favicon.ico` / `apple-icon.png` alongside every route
file, so walking it would report every `page.tsx` as an orphan. Exposed via `orphanCoverage()` in
`targets.mjs` so the limitation is greppable.

### R13a — the guard, written and proved (29/07)

`scripts/check-no-emerald.sh` is written and **proved against the live tree**, which is a stronger test
than the synthetic break-and-revert originally specified: because emerald is still live everywhere, the
guard's ability to find it in each file type is directly demonstrable rather than simulated.

It reports **69 hits across all seven scanned extensions**, including the two the Jade script cannot see:

| Type | Example |
|---|---|
| `.css` | `tokens.css` — `--primary`, `--ring`, `--destructive`, 4 sidebar vars, both appearances |
| `.mjs` | `brand/src/compositions.mjs` — both `SPLASH_GROUND` values |
| `.xml` | `customer-mobile` + `shop-mobile` `values{,-night}/colors.xml` and 4 VectorDrawables |
| `.kt` | all three generated `EffyTokens.kt` |
| `.svg` | `brand/src/logo.svg`, `customer-web/app/icon.svg`, `shop-web/public/icon.svg` |
| `.ts` | `customer-web/app/manifest.ts` — `theme_color` |
| `.tsx` | `customer-web/components/storefront/kit.tsx` — a comment |

**The `.mjs`/`.xml` extension is quantifiably load-bearing.** Running the same value set through the
**Jade script's include list** (`css,ts,tsx,kt,svg`) finds **0** of them; adding `.mjs`/`.xml` finds
**12**. Had the guard been cloned verbatim from `check-no-jade.sh`, twelve retired brand values —
including both mobile splash grounds, which ship inside the APK — would have passed a green check.

---

## R14 — Licensing (FR-008 / SC-018)

Two independent obligations, both **blocking on the operator**:

1. **The UI kit** — a Figma Community "freebie". Community files carry the author's chosen licence,
   commonly CC BY 4.0, which permits derivative commercial use **with attribution**. The author and
   licence must be read off the Community page and recorded; if attribution is required, it needs a
   home (an About/Legal entry).
2. **General Sans** — ITF Free Font License. Read and commit the licence file (R3).

Neither is a code task and neither can be discharged by inspection of the file alone.

---

## R16 — Two latent defects the US3 foundation exposed (29/07)

Both were introduced by US1 and would only have shown up on a device.

**1. Every `FontWeight.Bold` became SYNTHETIC.** Nunito Sans shipped Regular/SemiBold/**Bold**;
General Sans ships Regular/**Medium**/SemiBold and has no Bold face. Nine call sites across
customer-mobile (8) and shop-mobile (1) were still asking for 700, which Compose satisfies by
algorithmically smearing the SemiBold glyphs — worst at display size, which is exactly where they
were used. All nine moved to SemiBold; `EffyDisplay` too. The source design never uses 700 either, so
this is a correction toward the design, not a compromise.

**2. 025's surface inversion silently broke.** It set `page = card` and `tint = background`, which
worked when `background` was grey `#EFEFF1` and `card` was white. Under the monochrome palette those
tokens are **both `#ffffff`** in light, so every product-image plate, hero and category tile would
have rendered **white on a white page — invisible** — and in dark the page would have painted
`#333333` rather than the `#1a1a1a` ground.

The inversion was a fix for one token arrangement, not a principle, so it was **reversed**: `page` is
now `background`, and `tint`/`skeleton` are picked per appearance from the ramp so the skeleton stays
one step stronger than the tint in **both** appearances — which no single Material 3 slot pair can
deliver, because the ramp runs in opposite directions either side of the ground.

**3. A related bug caught while writing it**: reading appearance via `isSystemInDarkTheme()` is wrong
in this app, because `EffyTheme` accepts an explicit `AppearanceMode` (Light / Dark / Follow-System,
017). A shopper forcing Light on a dark device would get dark-picked values inside a light theme.
Appearance is now derived from the **luminance of the resolved `background`**, which is true under all
three modes.

## R15 — Sequencing and independent shippability

US1 (identity) → US2 (marks) → US3 (mobile rebuild) → US4 (new screens) → US5 (accessibility).

US1 is genuinely shippable alone: it changes appearance on six surfaces with no structural edit. US2
must follow closely — between them the app icon contradicts the app it opens. US3 and US4 are mobile-
only. US5 is verified across all of it, but its **guards** (contrast, no-colour-only meaning) are
built in US1, not deferred — otherwise the palette lands unverified.

**Bundle**: the guest budget is **174 KB** (`GUEST_LIMIT = 174 * KB`), raised from 160 during 025
because the Next 16 + React 19 framework floor grew ~7.5 KB. Earlier notes describing a
"167.4 / 160 KB pre-existing overage" predate that change and are stale.

⚠ **Two stale numbers in the repo itself**, found while measuring — fix in T083a:
`bundle-budget.mjs`'s own header comment says **176** three times while the enforced constant is
**174**, and claims "routes sitting at 160–168" when they now sit at 168.5–171.9. The CI step label
still says 160.

### R15a — measured baseline (29/07, before any code change)

| Guest route | First-load JS (gz) | Budget | Headroom |
|---|---|---|---|
| `/` | **170.5 KB** | 174 KB | 3.5 KB |
| `/browse` | **168.5 KB** | 174 KB | 5.5 KB |
| `/search` | **171.9 KB** | 174 KB | **2.1 KB** |
| `/product/[id]` | **170.7 KB** | 174 KB | 3.3 KB |
| `/cart` | **170.9 KB** | 174 KB | 3.1 KB |

**All within budget — but headroom is 2.1–5.5 KB, far tighter than "raised to 174" suggests.**
`/search` has ~2 KB of slack. FR-044 is judged against these five numbers.

This materially raises the risk on the font swap (R3): `next/font/google` already self-hosts at build
time, so `next/font/local` should be roughly neutral on JS — but "roughly" is not a margin `/search`
can absorb. Measure immediately after T021, not at the end of US1.

### R15b — after the colour half of US1 (29/07)

Tokens rewritten, three Compose themes regenerated, per-surface brand guards updated. **The bundle is
byte-identical to R15a on all five routes** — the identity change is pure CSS custom-property values
and costs zero first-load JS. That was the hypothesis; this is the measurement.

`check-tokens`: **31 vars × 2 appearances, all pairs pass WCAG AA, zero exemptions** (was 27 vars).
`pnpm -r test`: **741 pass** (was 739; +2 from the new brand-guard assertions).

⚠ **`make mobile-guard` does not exist** — the real targets are **`make cm-guard`** and
**`make sm-guard`** (both run `scripts/mobile-guard.sh`). Earlier drafts of these artifacts named a
target that would have failed at sign-off; corrected throughout.

**Green test baseline (29/07)**: `pnpm typecheck` 12/12 · `pnpm -r test` all pass —
edge-shared 38 · edge-customer 55 · edge-admin 94 · edge-shop 164 · web-kit 44 · customer-web 158 ·
back-office 52 · shop-web 134 (**739 JS/TS tests**) · brand **101** + `brand-check` 57 assets ·
`check-tokens` 27 vars × 2 appearances.
