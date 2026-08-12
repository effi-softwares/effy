# Implementation Plan: Customer Legal & Informational Documentation (Web + Mobile, Store-Ready)

**Branch**: `045-legal-documentation` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/045-legal-documentation/spec.md`

## Summary

Author the full set of Effy's customer-facing legal and informational documents as reviewed-pending
**drafts** (Privacy Policy, Terms of Service, Refund/Returns/Cancellations, Cookie & Tracking Notice,
Acceptable Use, EULA posture, Open-Source Acknowledgements, About/Business-Identity), render them on
**customer-web** (Next 16 SSR) and **customer-mobile** (KMP + Compose) from **one shared, drift-guarded
content source**, wire each document into every place a customer or store reviewer expects it (footer,
sign-up consent, checkout, newsletter, Account → Privacy & data, mobile About, `/delete-account`, a
`/legal` index), give each document a version + effective date with a version-history view, and produce
the operator's **store-submission collateral** (Apple App Privacy mapping, Google Data safety mapping,
policy/deletion URLs, EULA posture, reviewer notes) so both mobile apps can be submitted.

**Technical approach**: legal content is **static, build-time** — a canonical Markdown corpus in a new
shared package `@effy/legal-content` is the single source of truth (Principle II). Web renders it in
server components under the existing `/legal/*` routes (zero client JS, guest-bundle-gated); mobile
renders a **generated, committed Kotlin copy** produced by a generator with a drift guard (`legal:gen` /
`legal:check`), exactly the pattern `@effy/design-system` (`tokens:gen`/`tokens:check`) and `@effy/brand`
(`brand-gen`/`brand-check`) already use — so the same words ship inside the app with **no network
dependency**, satisfying the stores' "accessible within the app" requirement while guaranteeing web ↔
mobile parity. **No backend, no database, no migration** — there is no consent-record or server-stored
document in this slice. Real-world identifiers (entity, ABN, address, jurisdiction, contacts) are
operator-supplied fail-loud placeholders enforced by `legal:check`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (customer-web, Next.js 16.2.x, App Router, Cache
Components/PPR); Kotlin 2.4 / Compose Multiplatform 1.11 (customer-mobile); Node 22 for the content
build/generator tooling. No Go, no Lambda.

**Primary Dependencies**: `@effy/design-system` (tokens, General Sans, UI primitives), `@effy/web-kit`
where a console primitive is reused; a **small, self-contained Markdown→React renderer** for the web
legal pages (a minimal server-side renderer, or a vetted lightweight library added under the locked Web
standard — decision in research R2); a **minimal Markdown→Compose renderer** for mobile (structured
render of a constrained Markdown subset, decision R3). New shared package `@effy/legal-content`.

**Storage**: N/A — content is committed source compiled at build time. No PostgreSQL, no Goose
migration. (Account-closure storage already exists from 034 and is untouched.)

**Testing**: Vitest (web content-render + link-integrity + guest-bundle-budget); Kotlin `commonTest`
(mobile document catalogue + nav-routing, including the Terms→Privacy regression); a `legal:check`
drift guard (web ↔ mobile parity + unresolved-placeholder detection); Playwright e2e for the public
legal routes and version-history.

**Target Platform**: Public web (SSR/PPR, indexable, non-geofenced); iOS 15+ and Android (minSdk 24)
via KMP.

**Project Type**: Web + Mobile presentation over a shared content package (no service tier).

**Performance Goals**: Legal pages are static server-rendered documents — no measurable runtime budget
beyond the existing **customer-web guest bundle gate (174 KB)**, which every new public `/legal/*` and
`/about` route MUST be added to and stay within (they ship ~0 client JS, so headroom is not the risk;
being *listed* is — an unlisted public route is the recorded failure mode).

**Constraints**: Every factual claim in a document MUST be true of the system as built (SC-002/FR-010);
web ↔ mobile content MUST NOT drift (FR-013, mechanically guarded); real-world identifiers MUST fail
loudly, never be guessed (constitution § Real-World Identifiers); documents render in the storefront's
existing appearance (operator decision: customer storefront is light-only) and in the mobile app's
Light/Dark/Follow-System theme.

**Scale/Scope**: 8 customer-facing documents × 2 surfaces + 1 index + version-history; ~6 new web
routes, ~4 new/edited mobile screens, 1 new shared package, 1 generator + drift guard, and 4
operator-facing store-collateral documents. No backend endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Verdict |
|---|---|---|
| **I. Spec-Driven Development** | spec.md → plan.md → tasks.md → implement; gaps go back to the artifact. | ✅ spec.md committed; this plan follows; tasks next. FR-010/SC-002 keep documents honest against the built system. |
| **II. Monorepo & Shared Contracts** | Cross-cutting content is a shared package; single source of truth; consumers generated, not hand-redefined. | ✅ **This is the crux.** Legal content lives once in `@effy/legal-content`; web imports it, mobile consumes a **generated committed** Kotlin copy with a drift guard. No copy-paste; the same doctrine as tokens/brand. |
| **III. Dual-Path Backend Discipline** | Every plan states which backend path(s) it uses and why. | ✅ **Neither.** No latency-sensitive read and no admin CRUD — the feature adds no backend. Content is build-time static; no hot- or cold-path service is added or modified. Explicitly recorded so the boundary stays honest. |
| **IV. Auth Isolation** | No cross-pool tokens; records authoritative over claims. | ✅ Legal pages are public; no auth change. `/delete-account` (public) and Account → Privacy & data (customer-pool-gated) are unchanged in posture; this slice only adds links and fixes a mis-wire. |
| **V. Native-Feel, Consistent Design** | design-system SSOT; monochrome; dark mode; native mobile; **no card layouts** (justify if used). | ✅ Long-form reading pages built from **sectioned typography + lists + detail rows** (the constitution's preferred patterns), General Sans, ramp tokens — **no cards**. Mobile uses `EffyAppBar`/`EffyNavRow` and the app theme. See research R5 for the reading-page layout. |
| **VI. Layered Architecture & Explicit Wiring** | Thin edge → use-case → repository; explicit wiring; unidirectional client state. | ✅ Presentation-only; content is a pure data module consumed by server components (web) and a small ViewModel-fed catalogue (mobile). No hand-cached server data; no DI framework. |
| **VII. Observability & Telemetry** | A user-facing flow states its telemetry. | ⚠ Minimal by nature (static reading pages). Declared: a `legal_document_viewed` product event (type, surface) and `legal_link_clicked` from consent/checkout. **Recorded platform gap**: PostHog is still not initialised on customer-web (CLAUDE.md §039), so web events are declared but no-op until that is fixed — tracked, not silently dropped. No new metrics/alerts (no backend). |
| **Real-World Identifiers** | Operator-supplied; fail loudly; approved mailboxes; banned address absent. | ✅ FR-009: entity/ABN/address/jurisdiction/contacts are fail-loud placeholders enforced by `legal:check`. Contact addresses use approved mailboxes or the already-shipped `support@effyshopping.com` (operator-confirmed); the banned `techsupport+claudeone@phantm.com` appears nowhere. |

**No violations.** No entry requires Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/045-legal-documentation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (document/version/disclosure entities — content model, no DB)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/
│   ├── legal-content.contract.md      # the shared content module's shape + drift-guard contract
│   └── store-submission.contract.md   # the Apple/Google mapping + checklist contract
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/
└── legal-content/                     # NEW — @effy/legal-content, the single source of truth
    ├── src/
    │   ├── documents/                  # canonical Markdown corpus (one dir per document)
    │   │   ├── privacy-policy/…        #   v1.md + front-matter (title, version, effectiveDate)
    │   │   ├── terms-of-service/…
    │   │   ├── refunds-returns/…
    │   │   ├── cookies-tracking/…
    │   │   ├── acceptable-use/…
    │   │   ├── eula/…                  # posture note + any custom-EULA text
    │   │   ├── acknowledgements/…      # generated OSS attributions
    │   │   └── about/…                 # business identity & contact
    │   ├── identifiers.ts              # operator-supplied real-world values (fail-loud placeholders)
    │   ├── manifest.ts                 # document registry: slug, title, version, effectiveDate, order
    │   └── index.ts                    # typed exports consumed by web
    ├── scripts/
    │   ├── gen-compose.mjs             # legal:gen  → committed Kotlin content for mobile
    │   └── check.mjs                   # legal:check → web↔mobile drift + unresolved-placeholder guard
    └── package.json

apps/customer-web/
├── app/
│   ├── legal/
│   │   ├── page.tsx                    # NEW — /legal index (lists all documents)
│   │   ├── [type]/
│   │   │   ├── page.tsx                # NEW — renders any document by slug from @effy/legal-content
│   │   │   └── versions/page.tsx       # FILL — version history for a document
│   │   ├── privacy/page.tsx            # REPLACE placeholder → real render (or redirect into [type])
│   │   └── terms/page.tsx              # REPLACE placeholder → real render (or redirect into [type])
│   ├── about/page.tsx                  # NEW — business identity & contact (public)
│   ├── delete-account/page.tsx         # KEEP — reconcile copy with authored privacy policy
│   └── (shop)/_components/StorefrontFooter.tsx   # EDIT — add a "Legal & company" column
├── components/legal/                   # NEW — MarkdownDocument + DocumentMeta render components
└── scripts/bundle-budget.mjs           # EDIT — add every new public /legal/* and /about route

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/
├── features/legal/                     # NEW — document catalogue + render screens (generated content)
│   ├── domain/…                        #   LegalDocument catalogue (from generated source)
│   └── presentation/LegalScreens.kt    #   DocumentScreen, LegalIndex, AboutScreen, LicensesScreen
├── features/account/presentation/AccountScreens.kt   # EDIT — fix Terms→Privacy; add rows
└── core/nav/CustomerNavKey.kt          # EDIT — add Terms/Refunds/Cookies/AcceptableUse/Eula/
                                        #        Licenses/About/LegalIndex nav keys

docs/store-submission/                  # NEW — operator collateral (not customer-facing)
├── app-privacy-mapping.md              # Apple App Privacy details questionnaire mapping
├── data-safety-mapping.md              # Google Play Data safety form mapping
├── submission-checklist.md             # itemised store requirements + satisfied/blocked state
└── review-notes.md                     # reviewer instructions (throwaway account for deletion test)
```

**Structure Decision**: Web + Mobile presentation over a **new shared content package**
(`@effy/legal-content`). The package is the Principle-II single source of truth; web consumes it
directly and mobile consumes a generated, drift-guarded copy. No `apis/` change, no `db/migrations/`
change. Operator store collateral lives in a durable `docs/store-submission/` path (referenced at
submission), not buried in the spec folder.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
