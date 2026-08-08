# Implementation Plan: Monochrome Consoles & Shop Mobile — Unified Dashboard Identity

**Branch**: `041-monochrome-console-redesign` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-monochrome-console-redesign/spec.md`

## Summary

Adopt the operator-supplied appearance values as the platform's design-token source of truth, rebuild the two web consoles (`shop-web`, `back-office`) onto the shadcn **dashboard** (`dashboard-01`) structure, and re-skin `shop-mobile` onto the same monochrome identity. Because the tokens live in one shared package (`@effy/design-system/src/tokens.css`) that every surface reads, this is one governance change plus three presentation changes, validated so the surfaces already on the monochrome identity (customer web/mobile, driver mobile) stay visually equivalent.

**The technical approach hinges on four toolchain realities uncovered during planning** (full detail in [research.md](./research.md)):

1. **The token guards are hex-only.** Both `check-tokens.mjs` (the WCAG AA gate) and `gen-compose-theme.mjs` (which generates every mobile Compose theme, including shop-mobile's) parse `--name: #rrggbb` and *ignore* `oklch()`. Pasting oklch verbatim breaks mobile theme generation and the AA gate. **Decision: convert the pasted oklch to hex** — lossless for these values (the neutral ramp is chroma-0 grey; the chart hues sit in sRGB gamut), preserves the zero-dependency toolchain and web↔mobile parity, and honours "adopt exactly" in *value*.

2. **The pasted set omits platform-required tokens.** It has no `--success`, `--disabled`, `--placeholder`, radius scale, `--font-sans`, or the `@theme inline` mapping — all of which the generator and guard require and which are *not in conflict* with the pasted values. **Decision: replace the role colours that have a pasted equivalent; retain the platform-only tokens.**

3. **Some pasted values fail the AA gate the operator did *not* relax.** `--muted-foreground` (~4.1:1 on `--muted`) and `--ring` (a light grey that fails even 3:1 on the ground) fall below the constitution's zero-exemption AA bar. The platform already documents exactly this situation ("three values tuned away from the source design, all for contrast, none negotiable"). **Decision: adopt the pasted ramp, but tune the specific pairs that fail AA to the nearest passing value, each recorded with its measured ratio** — preserving the AA invariant the operator kept, while keeping the identity the operator chose. (Alternative — relaxing the AA guard — is rejected; see Complexity Tracking.)

4. **The dashboard structure is card-led and chart-led**, which collides with Principle V ("No card layouts / no metric cards at top") and needs `recharts` + a new `chart` primitive the repo does not have. **Decision: adopt the structure as an operator-directed Principle V exception (recorded below), add the `chart` primitive + chart tokens to the shared design-system, and bound the chart hues to data-visualisation only.**

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (web); Kotlin 2.4.0 + Compose Multiplatform 1.11.1 (mobile). No backend/DB/infra change.

**Primary Dependencies**: `@effy/design-system` (tokens SSOT + shadcn primitives), `@effy/web-kit/console` (shared console shell), TanStack Router/Query/Table, Tailwind v4, `recharts` (**new**, for the dashboard chart primitive). Shop-mobile consumes the generated `compose-shop/` theme.

**Storage**: N/A — no new data. Charts render from data the consoles already read, or bounded placeholder data where a console has none.

**Testing**: `pnpm -r typecheck`; vitest (`make bo-test`, `make shop-test`, web-kit/design-system suites); `packages/design-system` `test` = `check-tokens.mjs` (AA gate) + `tokens:check` (compose drift); `scripts/check-no-emerald.sh` / `check-no-jade.sh`; `make sm-tokens-check` / `sm-guard`; shop-mobile Android + iOS compile + unit tests; the web apps' bundle/gate scripts.

**Target Platform**: Web SPAs (Vite + React 19) on desktop browsers; shop-mobile on Android + iOS.

**Project Type**: Multi-surface monorepo — shared packages + two web consoles + one KMP mobile app.

**Performance Goals**: No regression vs current consoles; chart rendering must not block first paint of the dashboard landing. Shop-mobile: no change to navigation/flows.

**Constraints**: WCAG 2.1 AA on all text pairs, both appearances, zero exemptions (unchanged invariant). Web↔mobile radius parity (`--radius-sm`=8px, `--radius-md`=16px) preserved. No backend/auth/data/permission behaviour change (FR-018). Retired hues absent (`check-no-emerald`/`check-no-jade` green).

**Scale/Scope**: 2 web consoles (shop-web: auth · app/overview · catalog · orders; back-office: auth · app/overview · shops · staff · catalog-schema · promotions · deliverability) + shop-mobile (colour-only) + the shared token SSOT (affects all six surfaces, validated equivalent for the four already monochrome).

## Constitution Check

*GATE: evaluated against constitution v1.12.0.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **II — Shared packages, no copy-paste** | ✅ PASS | Tokens stay in the one SSOT; the dashboard shell and the new `chart` primitive land in `@effy/design-system` + `@effy/web-kit/console`, consumed by both consoles. Nothing is copied per app. |
| **V — MONOCHROME, exactly two semantic hues** | ⚠️ **VIOLATION — operator-directed, needs amendment** | The adopted values add five chart hues (`--chart-1..5`), a different corner-radius base, and (via the dashboard) a card/metric-card layout. All three are explicitly chosen by the operator (spec clarification + FR-003/FR-005a-style precedent). Requires a constitution amendment via `/speckit-constitution` **before this feature is complete**. Tracked in Complexity Tracking. |
| **V — WCAG AA, zero exemptions** | ✅ PRESERVED | The operator relaxed *monochrome*, not *AA*. Pasted values that fail AA are tuned to the nearest passing value (documented, per the existing tokens.css precedent). The AA gate stays green with no exemption added. |
| **V — Dark mode required + user-selectable** | ✅ PASS | Both light and dark adopted; Light/Dark/Follow-System retained on every in-scope surface. |
| **V — Retired hues swept** | ✅ PASS | `check-no-emerald`/`check-no-jade` must stay green; any residual legacy accent on the in-scope surfaces is removed (FR-005). |
| **VI — Layered architecture** | ✅ PASS | Presentation-only; no service/repository/domain change. |
| **VII — Observability** | ✅ N/A | No new telemetry required; existing events unaffected. |
| **Real-World Identifiers** | ✅ N/A | No identifiers introduced. |

**Gate result: PROCEED with a recorded Principle V violation.** The violation is the operator's deliberate design decision (spec §Assumptions, clarification "adopt pasted values exactly"), and the platform's own precedent (039 coloured panels, 028 card exception) is to record such an exception in the plan and amend the constitution rather than block. The AA invariant — the part of Principle V the operator did *not* touch — is preserved mechanically.

### Principle V card-layout justification (required record)

The operator selected the shadcn **dashboard** example as the mandated structure for both consoles. That example leads with metric/summary cards and an interactive chart — the exact aesthetic Principle V biases against. This is recorded as an **operator-directed exception scoped to the two internal operator consoles' dashboard landing**: the card/chart summary is the demonstrably-intended pattern for an at-a-glance operator overview, no better layout was offered, and it does not extend to customer-facing surfaces. Existing feature screens (catalog, orders, shops, promotions, etc.) keep their table/list/detail-row layouts.

## Project Structure

### Documentation (this feature)

```text
specs/041-monochrome-console-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 — the four toolchain decisions + AA-tuning table
├── data-model.md        # Phase 1 — token role map (no data entities)
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── design-tokens.contract.md   # the adopted token set + guard rules
│   └── console-shell.contract.md   # the dashboard shell structure both consoles consume
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/design-system/
├── src/tokens.css                    # ← adopt pasted values (converted to hex) + retain platform tokens + add --chart-1..5
├── src/ui/chart.tsx                  # ← NEW shadcn chart primitive (recharts wrapper)
├── src/ui/{card,sidebar,...}.tsx     # existing primitives reused
├── scripts/check-tokens.mjs          # ← extend PAIRS/coverage for chart tokens (non-text), keep AA gate
├── scripts/gen-compose-theme.mjs     # ← unchanged if hex; regenerates compose-shop/ from new tokens
└── compose-shop/EffyTokens.kt        # ← regenerated (shop-mobile monochrome theme, committed artifact)

packages/web-kit/src/console/
├── ConsoleShell.tsx                  # ← restructure to the dashboard-01 shell (app-sidebar + site-header + inset)
├── DashboardOverview.tsx (or blocks) # ← NEW shared overview scaffold (section cards + chart + table slots)
└── ... (ConsoleBrand/Header/UserMenu/NavList reused/adjusted)

apps/shop-web/src/
├── routes/app.tsx                    # ← render new shell; overview landing uses shared dashboard blocks
└── features/{catalog,fulfillment,shop-identity,auth}/  # ← re-skinned inside the new shell, behaviour unchanged

apps/back-office/src/
├── routes/app.tsx                    # ← same shell + overview landing
└── features/{shops,staff-identity,catalog-schema,promotions,deliverability,auth}/  # ← re-skinned, behaviour unchanged

apps/shop-mobile/
└── (no structural change) consumes regenerated compose-shop/ theme — colour only
```

**Structure Decision**: Multi-surface monorepo. All shared work (tokens, `chart` primitive, dashboard shell) lands in `@effy/design-system` and `@effy/web-kit` so both consoles consume one implementation (Principle II). `shop-mobile` changes only by regenerating its committed Compose theme from the updated tokens — no app-local edits beyond removing any residual legacy accent.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle V — five chart hues added | Operator adopted the pasted values exactly; the dashboard chart needs a categorical palette | Keeping monochrome-only charts was offered in clarification and **explicitly declined** by the operator ("adopt pasted values exactly"). |
| Principle V — card/metric-card dashboard layout | Operator mandated the shadcn dashboard example as the structure | A table/list overview (the Principle V default) was the prior state; the operator asked specifically for this structure. Bounded to the two consoles' overview landing only. |
| Constitution amendment required before completion | The above two relax a NON-NEGOTIABLE principle | Shipping without amending would leave live source contradicting the constitution — the exact drift the governance workflow forbids. The amendment is a prerequisite task, not optional. |
| oklch → hex conversion (deviation from literal notation) | The zero-dep hex-only generator/guard power all six surfaces' themes | Rewriting both guards to parse oklch adds a colour-space converter to two "proudly zero-dependency" scripts for no visual gain; values are identical once converted. |
| AA-tuning 2–3 pasted values | Those pairs fail the zero-exemption AA gate | Relaxing the AA gate was rejected: the operator relaxed monochrome, not accessibility, and the platform already treats AA-tuning of source values as "non-negotiable" precedent. |
