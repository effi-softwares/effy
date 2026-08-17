# Implementation Plan: Customer Feedback

**Branch**: `046-customer-feedback` | **Date**: 2026-08-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/046-customer-feedback/spec.md`

## Summary

Make the checkout header's existing "Give us feedback" link real, end to end. A public feedback form
on the customer web storefront (`/feedback`) and a matching customer-mobile screen let any shopper —
guest or signed-in — send categorised feedback with an optional rating and reply email; a stored
submission is acknowledged on screen and, when an email was given, with a thank-you email. Back-office
staff get a feedback console to list, search, filter, and triage submissions, add internal notes,
change status, and reply — where a reply is delivered to the submitter as an email.

**Technical approach**: a **cold-path** slice on both sides (the user's explicit instruction and the
correct path under Principle III — low-frequency traffic whose real work is asynchronous email).
Public submission adds a `feedback/` domain to **`apis/edge-api/customer`** (the newsletter precedent:
DB access, `ses:SendEmail`, a public-route precedent already present). Staff reading/replying adds a
`feedback/` domain to **`apis/edge-api/admin`** behind the back-office authorizer with RBAC decided
from the `admin.staff` record (the deliverability precedent). One forward-only migration adds three
`public` tables. Two new **`@effy/email-kit`** templates (`feedback-received`, `feedback-reply`) are
authored in MJML and generated to committed artifacts. DTOs live in **`@effy/shared-types`**. The
storefront page is a server component with a single small client form island; the console reuses the
shared `DataTable`/dialog primitives; mobile follows Clean Architecture + MVVM.

## Technical Context

**Language/Version**: TypeScript on Node 22 (both edge services + web); React 19 (customer-web Next 16
SSR, back-office Vite SPA); Kotlin Multiplatform + Compose (customer-mobile). No Go — the hot path is
not used.

**Primary Dependencies**: `@effy/edge-shared` (pg `query`, logger, handler helpers), `@effy/email-kit`
(catalogue + send + MJML generation), `@effy/shared-types` (DTOs + `EMAIL_SHAPE`/`EMAIL_MAX_LENGTH`),
`@effy/web-kit` (console shell + `DataTable`), `@effy/design-system/ui` (shadcn primitives). No new
third-party runtime dependency is introduced.

**Storage**: PostgreSQL 16, `public` schema, raw SQL via pgx-equivalent `query`, Goose forward-only
migration. Three new tables: `feedback_submission`, `feedback_reply`, `feedback_note`.

**Testing**: Vitest (edge services, web, email-kit) incl. container-backed repo tests and a
config-contract test per edge service; Kotlin `commonTest` (Android + iOS) for mobile; Playwright for
the storefront form path.

**Target Platform**: AWS Lambda (arm64) behind the shared HTTP API for both edge services; the public
customer web storefront; the internal back-office SPA; iOS + Android for customer-mobile.

**Project Type**: Web + mobile + API — six-ish touchpoints (two edge services, three clients, one
shared email/types layer) forming one vertical slice.

**Performance Goals**: submission and admin list/detail complete well within the cold-path budget;
console list/search stays responsive at high submission volume via keyset/offset pagination and an
index supporting the default newest-first order and text search.

**Constraints**: customer-web guest bundle gate is **174 KB** — the `/feedback` client island must be
minimal (one form). No PII (submitter email) in logs or telemetry beyond the auth subject id. Reply
and thank-you emails must render in light/dark, ship a plain-text part, and carry no third-party asset
requests (existing `make email-check` guards). Real-world sender/reply identity uses only the approved
mailboxes already wired into `email-kit` config.

**Scale/Scope**: low submission volume relative to commerce; designed to remain usable as the archive
grows (indexed, paginated). Two email templates, three DB tables, two edge domains, three client
surfaces.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-Driven Development** ✅ — spec.md written and validated first; this plan cites it. No code
  before artifacts.
- **II. Monorepo with Shared Contracts** ✅ — DTOs in `@effy/shared-types`; email in `@effy/email-kit`;
  the storefront's email validation reuses the shared `EMAIL_SHAPE`/`EMAIL_MAX_LENGTH` (044) so the
  form refuses exactly what the service refuses. No per-surface copies.
- **III. Dual-Path Backend Discipline** ✅ — **cold path on both sides**, justified below. Hot path is
  explicitly NOT used.
  - *Public submission* → `edge-api/customer`: low frequency, asynchronous email work, and the service
    already carries DB access + `ses:SendEmail` + the `MAIL_*` env + a public-route precedent
    (newsletter, healthz). It is **not commerce**, so the hot-path routing law (011 FR-028) is not
    engaged.
  - *Staff reading/replying* → `edge-api/admin`: the doctrine's internal-console CRUD, mirroring
    deliverability/shops/promotions.
- **IV. Auth Isolation** ✅ — the authenticated submit route uses the **customer** authorizer; the
  console uses the **back-office** authorizer. RBAC is decided from the `admin.staff` record (read =
  any active staff incl. csa; reply = admin/manager), never from the token claim alone. No token
  crosses pools; no cross-pool brokering. A guest submit route is public with no authorizer.
- **V. Native-Feel, Consistent Design** ✅ — monochrome design system throughout; **no card layouts**
  (the console is a `DataTable` list + a sectioned detail page; the storefront form is a sectioned
  page). Emails derive from the monochrome tokens via `email-kit`. Reference platforms: eBay/Uber Eats
  "contact/feedback" patterns — a simple categorised form, an admin queue.
- **VI. Layered Architecture & Explicit Wiring** ✅ — three-layer slices (handler → service →
  repository) with raw SQL and explicit mapping; mobile is MVVM (ViewModel → immutable UI state);
  web treats the server-state cache as source of truth; no DI framework.
- **VII. Observability & Telemetry** ✅ — telemetry declared in Phase 1 (product events, metrics, one
  alarm on thank-you/reply send failure). No submitter PII in logs (logged without the address, per
  newsletter). ⚠ Known carry-forward: PostHog is not yet initialised on customer-web (039) — events
  are declared and wired, and this limitation is recorded, not hidden.
- **Real-World Identifiers** ✅ — no new outward identifier. The reply/thank-you sender + reply-to use
  the approved `hello@effyshopping.com` / `workspace-admin@effyshopping.com` mailboxes already in
  `email-kit` config. No identifier is inferred from session/env.

**Result**: PASS. No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/046-customer-feedback/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── feedback-api.contract.md
│   └── feedback-email.contract.md
└── checklists/
    └── requirements.md  # from /speckit-specify
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_customer_feedback.sql               # public.feedback_submission | _reply | _note

packages/
├── shared-types/src/
│   └── feedback.ts                           # submit req/result + admin list/detail DTOs + enums
└── email-kit/src/
    ├── catalog.ts                            # + feedback-received, feedback-reply entries
    ├── templates/feedback-received.mjml
    ├── templates/feedback-reply.mjml
    ├── text/feedback-received.txt.hbs
    ├── text/feedback-reply.txt.hbs
    └── generated/…                            # regenerated committed artifacts

apis/edge-api/customer/src/
├── feedback/      repo.ts · service.ts · lib.ts · repo.container.test.ts ·
│                  service.test.ts · config.contract.test.ts
└── functions/     feedback-submit-v1-post.ts (authenticated) ·
                   feedback-submit-public-v1-post.ts        # handlers live in src/functions/ (existing convention)

apis/edge-api/admin/src/
├── feedback/      authz.ts · repository.ts · service.ts · types.ts ·
│                  service.test.ts · repository.container.test.ts · config.contract.test.ts
└── functions/     feedback-list / feedback-detail / feedback-status /
                   feedback-note / feedback-reply  (v1 handlers)

apps/customer-web/app/feedback/
├── page.tsx                                   # server component; prefill from session
└── _components/FeedbackForm.tsx               # the single client island

apps/back-office/src/
├── routes/feedback.tsx                        # list + detail routes
└── features/feedback/                         # ListScreen, DetailScreen, queries, repo, model, access

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/feedback/
├── domain/        (models, SubmitFeedbackUseCase)
├── data/          (HttpFeedbackRepository, DTO mapping)
└── presentation/  (FeedbackViewModel, FeedbackScreen)
```

**Structure Decision**: One vertical slice across the existing surfaces, each following its
surface's established layout. No new package or deployable is created — every touchpoint extends a
directory that already exists (`edge-api/customer`, `edge-api/admin`, `shared-types`, `email-kit`,
`customer-web`, `back-office`, `customer-mobile`). Two submit handlers (authenticated + public) are a
deliberate consequence of API Gateway's per-route authorizer model — see research D2.

## Complexity Tracking

> No constitutional violations. This section is intentionally empty.
