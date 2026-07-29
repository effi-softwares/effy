# Quickstart: Monochrome Design Language & Customer Mobile Rebuild (026)

Validation runbook. Every command is runnable from the repo root. **Operator-only steps are marked
⚠ OPERATOR** — per the platform's mode of work, Claude authors but does not run anything outward-facing,
and this feature additionally has two **blocking licence confirmations** that no command can discharge.

---

## 0. Prerequisites — the blocking ones first

| # | What | Why it blocks |
|---|---|---|
| 1 | ⚠ **OPERATOR** — read the Figma Community kit's licence and author attribution; record in research R14 | FR-008 / SC-018. If attribution is required it needs a home before assets ship. |
| 2 | ⚠ **OPERATOR** — download **General Sans** (Regular 400, Medium 500, SemiBold 600) from Fontshare; read and commit the ITF licence file | Nothing renders without the font files, and they cannot be fetched at build time. |
| 3 | ⚠ **OPERATOR** — approve the **constitution amendment v1.10.0 → v1.11.0** (Principle V brand constant) | Principle I forbids implementing against a constitution the change contradicts. |

Steps 2 and 3 gate all code. Step 1 gates shipping, not building.

---

## 1. Baseline — measure before changing anything

```bash
make cw-build && make cw-size          # budget is 174 KB (GUEST_LIMIT); see research R15a
pnpm -r test                            # current green baseline
pnpm -r typecheck
```

Record the per-route numbers. The budget is **174 KB** (raised from 160 during 025 because the
framework floor grew ~7.5 KB) — routes are **within** it but by only 2.1–5.5 KB, so FR-044 means "still under 174 after the
change", measured against the numbers you just recorded.

---

## 2. Guards first, proved by breaking them

Build `scripts/check-no-emerald.sh` **before** touching tokens.

```bash
bash scripts/check-no-emerald.sh        # expect: OK (nothing retired yet — emerald is still live!)
```

⚠ On a clean tree this **must fail**, because emerald is still everywhere. That is correct: the guard
is written first, run last. Wire it into `pnpm test` only after the palette moves.

**Negative proofs — the guard must catch all three file types:**

```bash
# 1. a .css value (the type the old guard already covered)
echo '  --x: #065f46;' >> packages/design-system/src/tokens.css
bash scripts/check-no-emerald.sh        # expect FAIL naming tokens.css
git checkout packages/design-system/src/tokens.css

# 2. a .mjs value — the old guard MISSES this file type
# 3. an .xml value — the old guard MISSES this file type too
```

Both 2 and 3 must fail and name the file. If either passes, the guard is the 011-D11 mistake repeated.

---

## 3. Tokens and typeface

```bash
pnpm --filter @effy/design-system test          # check-tokens.mjs — 12 pairs × 2 appearances
pnpm --filter @effy/design-system tokens:gen    # regenerate 3 Compose themes
pnpm --filter @effy/design-system tokens:check  # drift + mobile assets (incl. fonts)
```

**Expected**: zero contrast exemptions. If `destructive-foreground/destructive` fails, the source's
`#ED1010` (4.48:1) was committed instead of the tuned `#e01010` (4.94:1) — see contracts C3.

**Display-metric verification (do this by eye, once):** render "Discover" at H2 and compare against
`~/Downloads/…(Copy)/Homepage.jpg`. If the tracking is visibly wider, `-5` was read as px, not percent.
Same check for B2 = 14 against any B2 string.

---

## 4. Brand assets

```bash
make brand-gen && make brand-check
make brand-gen && git diff --exit-code        # determinism, SC-006 — expect empty
pnpm --filter @effy/brand test                # 101 tests + RETIRED_EMERALD absence
```

**Negative proofs (SC-005) — all three, each must exit non-zero and name the surface:**

```bash
# stale:    edit one derived asset by hand
# orphaned: add a derived asset with no declared target
# missing:  delete one derived asset
make brand-check
```

**Polarity check**: `light` ground `#F4F5F7` vs `dark` ground `#1A1A1A` = **15.95:1**. Asserted in
tests; the human half is §6.

---

## 5. Surfaces

```bash
pnpm -r typecheck && pnpm -r test
turbo build                                   # all three web surfaces
make cw-size                                  # FR-044 — must not exceed the §1 baseline
make cw-depcruise
bash scripts/check-no-jade.sh
bash scripts/check-no-emerald.sh              # NOW must pass
```

Mobile:

```bash
# from each app dir
./gradlew :shared:allTests
./gradlew :androidApp:assembleDebug
./gradlew :shared:linkDebugFrameworkIosSimulatorArm64
make cm-guard && make sm-guard
```

All three mobile apps must build — `shop-mobile` and `driver-mobile` get **theme regeneration only**.
A screen diff in either is a scope error (screen-inventory contract, preamble).

---

## 6. ⚠ OPERATOR — device and human verification

Nothing below can be automated.

| # | Check | Criterion |
|---|---|---|
| 6.1 | **Side-by-side observer test** — customer and shop apps on **one** home screen | Distinguishable at a glance (FR-022, SC-002/003). This is the half of R2 no test can prove. |
| 6.2 | Launcher-mask sweep — circle, squircle, rounded-square, teardrop | No clipping at any committed size (SC-007) |
| 6.3 | Cold launch, both apps, light **and** dark | Branded splash, neutral ground (SC-005) |
| 6.4 | Android themed/tinted icon; iOS tinted appearance | `mono()` renders correctly |
| 6.5 | **Visual matrix** — 5 viewports × 2 appearances × both platforms | Zero clipped/overlapped/unreachable; nothing behind bars, cutouts, or keyboard (SC-015) |
| 6.6 | Max supported text size, every screen | No clipping — watch H1's 0.8 line height (SC-015) |
| 6.7 | **Grayscale review** of every status, badge, selected state, error, destructive | Meaning survives without colour (SC-013). The identity is nearly hueless, so this is the highest-risk check in the feature. |
| 6.8 | Screen reader — discovery → product → cart → checkout → orders → all 6 new screens | Zero unlabelled controls, zero traps, dynamic changes announced (SC-014) |
| 6.9 | Keyboard-only on all three web surfaces | Focus visible against the neutral ring, no trap (SC-014) |
| 6.10 | Three web tabs open together | Favicons distinguishable by polarity (SC-005) |
| 6.11 | Source kit vs app, side by side | Judged one system — **including the two invented screens** (SC-008) |
| 6.12 | Full purchase on both platforms | Pricing, delivery, payment, orders unchanged (SC-017) |

---

## 7. Sign-off gate

- [ ] Licences confirmed and recorded — kit **and** typeface (SC-018)
- [ ] Constitution at **v1.11.0**; Effy Emerald recorded as retired alongside Jade
- [ ] `check-no-emerald.sh` green **and proved by breaking it in `.css`, `.mjs`, and `.xml`**
- [ ] `check-tokens.mjs` green, **zero exemptions**
- [ ] `brand:check` green **and proved by breaking it three ways**; regeneration byte-identical
- [ ] `tokens:check` green; all three Compose themes regenerated and committed
- [ ] All existing tests pass **unchanged** — the proof this stayed presentational (SC-017)
- [ ] Bundle no worse than the §1 baseline (SC-016)
- [ ] All **48** source screens have exactly one recorded disposition (SC-008)
- [ ] Touch targets meet the platform minimum on every rebuilt and new control (SC-020)
- [ ] Customer and shop marks distinguishable at launcher size, in a tab strip, and in grayscale (SC-021)
- [ ] `pnpm e2e` green — SSR shell and SEO no worse than the §1 baseline (SC-016)
- [ ] The retired-palette guard **runs in CI**, proved by a failing branch (FR-011)
- [ ] Zero placeholder items presented as real (SC-011); each carries an owning slice
- [ ] Order tracking leaks no location, map, or courier — single **and** multi-package (SC-012)
- [ ] §6 operator matrix walked and recorded
- [ ] `docs/audiences/customer-capabilities.md` updated, mobile-only items marked as such (SC-019)
- [ ] spec, plan, research, data-model, contracts, tasks committed **with** the code (Principle I)
