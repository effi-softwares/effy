# Contract: Design Tokens & Typeface

**Producer**: `packages/design-system`
**Consumers**: all six surfaces — `customer-web`, `shop-web`, `back-office` (CSS vars via Tailwind v4)
and `customer-mobile`, `shop-mobile`, `driver-mobile` (generated Compose themes).

This contract is what makes FR-013 ("no surface may drift") enforceable rather than aspirational.

---

## C1 — One source, no private palettes

`packages/design-system/src/tokens.css` is the **only** place a colour, radius, or font family is
authored. A surface MUST NOT declare its own palette or typeface.

**Enforced by**: `scripts/check-no-emerald.sh` (new) + `scripts/check-no-jade.sh` (existing) sweeping
`packages/` and `apps/` for retired values, and by review for improvised new ones.

⚠ The new script MUST extend the existing include list `--include='*.css' '*.ts' '*.tsx' '*.kt' '*.svg'`
with **`*.mjs`** and **`*.xml`** — otherwise it silently misses `packages/brand/src/*.mjs` and the
Android `values{,-night}/colors.xml` splash grounds, which is exactly where the retired brand colours
live today.

⚠ It MUST exclude `*.test.*` **and** `packages/brand/src/colourways.mjs`, where `RETIRED_EMERALD`
legitimately names the forbidden values in order to forbid them.

## C2 — Both appearances, every key

Every `--*` colour key in `:root` MUST also exist in `.dark`. Missing either side is a build failure.

## C3 — Contrast floor, zero exemptions

All 12 guarded pairs MUST meet their threshold in **both** appearances:

`foreground/background` · `card-foreground/card` · `popover-foreground/popover` ·
`primary-foreground/primary` · `secondary-foreground/secondary` · `muted-foreground/muted` ·
`accent-foreground/accent` · `destructive-foreground/destructive` · `sidebar-foreground/sidebar` ·
`sidebar-primary-foreground/sidebar-primary` · `sidebar-accent-foreground/sidebar-accent` ·
`ring/background` — all at **4.5:1**.

**Source fidelity is never grounds for an exemption** (FR-015a). Where the source design's own pairing
fails, the value is tuned:

| Source | Measured | Adopted | Measured |
|---|---|---|---|
| `#ED1010` error | 4.48:1 ❌ | `#e01010` | 4.94:1 ✅ |
| `#CCCCCC` disabled fill w/ white label | 1.61:1 ❌ | `#E6E6E6` fill w/ `#808080` label | 3.16:1 ✅ (3:1 bar) |
| `#999999` placeholder on white | 2.85:1 ❌ | `#808080` | 3.95:1 ✅ (3:1 bar) |
| `#0C9409` success | 4.00:1 | unchanged, **non-text only** | passes 3:1 ✅ |

**Three source values are tuned, not two.** Any later "restore source fidelity" edit reintroduces a
failing pair.

**Enforced by**: `packages/design-system/scripts/check-tokens.mjs` (`pnpm test` in that package).

## C3a — Every rendered value is a token

FR-004 permits **no improvised or hardcoded value on any surface**. The adapted disabled pair and the
placeholder grey are therefore **tokens** (`--disabled`, `--disabled-foreground`, `--placeholder`), not
literals written into `StorefrontKit.kt` or the web primitives. The guarded-pair list grows to include
them at the 3:1 non-text bar, and the four `--sidebar*` pairs are pinned in
[data-model.md §2](../data-model.md) rather than left undecided — they are one third of the gate.

## C4 — Radius parity

`--radius-sm` MUST be `0.5rem` (8 px) and `--radius-md` MUST be `1rem` (16 px), so web px equals
mobile dp. **Enforced by**: `check-tokens.mjs`.

## C5 — The accent inverts polarity

`--primary` MUST be near-black in light and near-white in dark, with `--primary-foreground` inverted to
match. A neutral accent that holds one value across both appearances is invisible in one of them.

**Enforced by**: C3 — a non-inverting accent fails `primary-foreground/primary` in one appearance.

## C6 — Exactly two semantic hues

The palette MUST contain no hue beyond the declared error and success values. Neither may be used
decoratively or as an accent, and success MUST NOT carry text.

**Exception, and only this one**: a third-party sign-in mark whose provider's brand guidelines require
its own colours (the Google mark). It is an asset, not a token.

## C7 — Generated themes are committed and drift-checked

`compose/`, `compose-shop/`, and `compose-driver/` are **generated then committed**. Regenerating from
unchanged tokens MUST produce no diff.

**Enforced by**: `pnpm --filter @effy/design-system tokens:check`
(`check-compose-theme.mjs` + `check-mobile-assets.mjs`).

## C8 — Typeface

`--font-sans` resolves to **General Sans** on every surface, self-hosted from local files. Weights are
**400 / 500 / 600 only** — the source never uses 700, and the generated Compose type scale MUST be
SemiBold-led rather than Bold-led.

Per-surface mechanism (all six change — none is a re-point):

| Surface | From | To |
|---|---|---|
| customer-web | `next/font/google` | `next/font/local` |
| shop-web, back-office | `@fontsource-variable/nunito-sans` | local `@font-face` |
| 3 mobile apps | `composeResources/font/nunito_sans_*` | `general_sans_*` |

The licence file MUST be committed beside the fonts, as `OFL.txt` is today.

**Enforced by**: `check-mobile-assets.mjs` for the mobile half; typecheck + build for the web half.

## C9 — Display metrics

Letter-spacing `-5` from the source is **percent** → `-0.05em` / `(-0.05).em`, applied only to H1/H2.
H1's line height of 0.8 is display-only and MUST NOT be applied to arbitrary-length strings.

**Verification before commit**: render "Discover" at H2 and compare against `Homepage.jpg`.

---

## Required tests

1. `check-tokens.mjs` passes — 12 pairs × 2 appearances, radii 8/16, zero exemptions.
2. **Negative proof**: reintroduce `#065f46` into `tokens.css`, confirm `check-no-emerald.sh` fails and
   names the file, then revert. *Break the guard the way it will actually break* (011 D11, R13).
3. **Negative proof**: put a retired value in an `.mjs` and in a `values/colors.xml`, confirm the guard
   catches **both** — these are the two file types the existing script misses.
4. `tokens:check` passes after regeneration with no diff (C7).
5. A contrast unit assertion for each tuned value in C3, so a later "restore source fidelity" edit fails.
6. Build + typecheck green on all three web surfaces with the local font.
7. Kotlin `commonTest` green on all three mobile apps after theme regeneration.
