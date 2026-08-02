# Implementation Plan: Customer Account Centre — Detail-Row Editing, Sectioned Account & Account Deletion

**Branch**: `034-customer-account-center` | **Date**: 2026-08-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/034-customer-account-center/spec.md`

**Phase 0**: [research.md](research.md) · **Phase 1**: [data-model.md](data-model.md) ·
[contracts/account-center.contract.md](contracts/account-center.contract.md) ·
[quickstart.md](quickstart.md)

---

## Summary

Restructure the customer account area on **both** customer surfaces around three ideas, and add the one
capability whose absence currently makes the mobile apps unpublishable.

1. **A value is edited one field at a time, in a container over the screen you were already on** — a
   bottom sheet on mobile, the existing `ResponsiveModal` on web. The screen behind shows current
   values as label/value/chevron rows and holds no input fields at all.
2. **The account root becomes identity + shortcuts + labelled groups**, with the identity header as the
   only route to personal details, and **sign out relocated** to Security where an accidental tap cannot
   reach it.
3. **Account deletion**, soft, with a 30-day window, reached from the bottom of Privacy & data, gated by
   a freshly issued verification code — plus the **public web deletion route Google requires and Apple
   does not**, which is the most-missed half of the requirement.

Four decisions carry the technical weight:

- **Cold path, exclusively**, per 011's FR-028 routing law — with **one recorded exception**: the
  deletion blocker reads `public."order"` directly rather than calling a hot path that has no cloud
  deploy (R2).
- **The re-authentication primitive already exists.** Feature 012's emailed-code pair is
  token-authorized, needs **zero new IAM**, and is uniform across all three credential routes — where a
  password prompt would dead-end a Google-only shopper (R3).
- **⚠ The blocking condition had to be bounded or it could never clear.** An order's only terminal state
  is unreachable in production, so as specified every shopper who had ever paid would have been
  permanently undeletable (R1). Spec amended.
- **Closure is its own state, not a third value of `status`** — because `status` is a platform sanction
  and closure is the shopper's own decision (R13).

---

## Technical Context

**Language/Version**: TypeScript + Node 22 (cold path) · Kotlin 2.4.0 / Compose Multiplatform 1.11.1
(mobile) · TypeScript + React 19 / Next.js 16.2.6 (web) · PostgreSQL 16

**Primary Dependencies**: Serverless Framework v3 · `@aws-sdk/client-cognito-identity-provider` (already
present) · pg (raw SQL, no ORM) · Ktor client · kotlinx.serialization · Radix via
`@effy/design-system/ui`. **No new runtime dependency on any surface.**

**Storage**: PostgreSQL 16 — one migration: a `phone` column on `public.customer`, plus closure state
and one new table. Goose, forward-only.

**Testing**: Vitest (cold-path units + web client components; it **cannot** test async Server
Components) · Kotlin `commonTest` on the JVM host, plus the iOS simulator target · Playwright against a
production build · the existing bundle-budget gate.

**Target Platform**: iOS + Android (KMP) · modern browsers (SSR/PPR) · Lambda on arm64.

**Project Type**: Monorepo vertical slice — one cold-path service extended, **one hot-path gate
amended**, two client surfaces, one shared-types change, one migration. **No Terraform, no new AWS
resource, no new IAM** (R3/R4).

⚠ The hot-path edit is easy to miss when reading the structure below: closure must be refused by
`apis/core-api/internal/platform/customeridentity`, which owns the commerce-side identity gate. This is
**not** a Principle III crossing — the hot path is enforcing its own gate — but it does mean Go is in
scope, and Go checks belong in the verification sweep (T087).

**Performance Goals**: the deletion blocker predicate resolves in a **single query**, and the editor is
focused with the keyboard raised **without a second interaction** (FR-013). *(An earlier "within one
frame" target was dropped — it had no measurement task and would have been an unfalsifiable claim.)*

**Constraints**:

- **Guest bundle: `GUEST_LIMIT = 174 KB`** across the **six** routes currently in `GUEST_PAGES`.
  ⚠ **Two conflicting headroom figures exist and neither is current for this branch**: the comment block
  in `bundle-budget.mjs` records 2.1–5.5 KB of slack (measured 2026-07-29, feature 026, five routes),
  while feature 033 more recently recorded `/search` and `/cart` at **0.5 KB and 0.2 KB** from the gate.
  **Treat 0.5 KB as the working assumption — the tighter and more recent of the two — and re-measure in
  T085 rather than trusting either.** `(account)` routes are budgeted separately, so the risk is a leak
  into the **shared chunk**, not the account pages themselves.
- **Up to three new PUBLIC routes** (privacy, terms, web deletion) must join `GUEST_PAGES` in the same
  commit (FR-058c, R8).
- **`core-api` has no cloud deploy** — local-Docker-only by platform decision. This is why the blocker
  predicate does not call it (R2).
- **Mobile route registration is a three-place edit** with an **iOS-only, post-process-death** failure
  mode, and a hard-coded count of `23` in `ScreenInventoryTest.kt:58` (R9).
- **`packages/mobile-kit` is `srcDir`-shared with `shop-mobile`** — customer-only components must not go
  there (R5).
- Compose tokens are **generated** and guarded by `check-compose-theme.mjs`; this feature adds no token.

**Scale/Scope**: 2 client surfaces · ~6 new/reworked screens per surface · 1 migration · 1 new table ·
**4** new cold-path routes · 3 new public web routes · **7** spec amendments applied · ~7 new shared
DTOs.

---

## Constitution Check

*GATE: passed before Phase 0; re-evaluated after Phase 1 — see the bottom of this section.*

| Principle | Verdict | How |
|---|---|---|
| **I — Spec-Driven** | ✅ | spec → plan → tasks → implement. **Five corrections found in research were written back into the spec** (FR-042, FR-042a, FR-047, FR-052a, FR-058c), not patched in code. |
| **II — Monorepo / Shared Contracts** | ✅ | DTOs in `packages/shared-types`, generated to Kotlin. Web reuses the existing `ResponsiveModal` rather than hand-rolling a second overlay; mobile extracts `EffySheet` once and migrates its two existing raw call sites onto it. |
| **III — Dual-Path Discipline** | ⚠ **pass with a recorded exception** | Cold path, per 011's FR-028 routing law — profile/account is explicitly cold-path territory. **The exception**: the deletion blocker reads a hot-path-owned table directly (R2, Complexity Tracking below). |
| **IV — Auth Isolation** | ✅ | Customer pool only. **No new IAM** — every Cognito call used is token-authorized (R3). Closure is enforced at the same record-is-authoritative point that already enforces `barred`, so a valid token never overrides it. **No new pool, client, or group.** |
| **V — Native-Feel, Consistent Design** | ⚠ **pass with one flagged departure** | Monochrome ramp, no new token, `tokens:check` unchanged. **The quick-action tiles are built container-free rather than as the filled tiles in the screenshot** — see R10; a better layout demonstrably exists, so no card exception is claimed. Destructive styling is reclaimed for deletion (R11). |
| **VI — Layered Architecture** | ✅ | Cold path keeps the `http → service → repo` shape already in `edge-api/customer`. Mobile stays MVVM with a formal use-case layer; the oversized `AccountViewModel` is split along the new screen boundaries. No DI framework. |
| **VII — Observability & Telemetry** | ⚠ **conditional — declared, not yet transmitting** | Events declared and emitted. **But PostHog has never been initialised on `customer-web`**, so `capture()` remains a platform-wide no-op (R15). |

### ⚠ Principle VII is the gate that does not cleanly pass

Feature 033 recorded that PostHog has never been initialised on `customer-web` and that mobile telemetry
has been deferred for twelve consecutive slices. Declaring events into a taxonomy nothing transmits
satisfies the letter of Principle VII and misses its point.

**This matters more here than in previous slices.** Deletion is irreversible, store-mandated, and
governed by a block (R1) whose whole safety argument is that it always clears. The only evidence that
the block is not silently stranding shoppers is a funnel — and nobody is currently recording one. The
initialisation gap is therefore named as a conditional pass rather than inherited quietly, and the
tasks phase should treat "does the deletion funnel actually emit?" as a verification step, not an
assumption.

### Post-Phase-1 re-evaluation

Re-checked after the data model and contracts were written. **No verdict changed.** Two things were
confirmed rather than assumed:

- The migration adds **no** predicate to any existing read path — closure lives on its own column plus
  its own table, so no query anywhere gains a `WHERE deleted_at IS NULL` that someone will later forget
  (the trap `20260802052141_customer_saved_items.sql:66` explicitly warns about).
- The contract adds **no** field to any existing catalogue or commerce response, so nothing this feature
  touches makes a cacheable response shopper-specific.

---

## Project Structure

### Documentation (this feature)

```text
specs/034-customer-account-center/
├── plan.md              # This file
├── research.md          # Phase 0 — 16 decisions, 5 spec amendments
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── account-center.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
db/migrations/
└── <timestamp>_customer_account_center.sql      # phone + closure state + closure request table

packages/
├── shared-types/src/customer.ts                 # CustomerDTO gains phone + closure; new deletion DTOs
├── shared-types/contract/Dto.kt                 # regenerated (drift-guarded)
└── design-system/src/ui/responsive-modal.tsx    # REUSED unchanged — no edit

apis/core-api/internal/platform/customeridentity/
└── customeridentity.go                          # ⚠ the HOT-path gate must also refuse a closed customer

apis/edge-api/customer/src/
├── customer/{repo,service,model}.ts             # phone read/write; closure state
├── closure/                                     # NEW — the deletion slice
│   ├── repo.ts                                  #   closure record + the blocking-order query (R2)
│   ├── service.ts                               #   blocker predicate, code challenge, closure write
│   └── http.ts
└── functions/
    ├── customer-closure-v1-get.ts               # NEW — blockers + what-will-happen disclosure
    ├── customer-closure-v1-challenge.ts         # NEW — issue the verification code (reuses 012)
    └── customer-closure-v1-post.ts              # NEW — verify + close, one transaction

apps/customer-mobile/shared/src/commonMain/kotlin/.../
├── core/presentation/StorefrontKit.kt           # NEW EffySheet + a tappable detail row
├── core/nav/CustomerNavKey.kt                   # ⚠ three-place edit (R9)
└── features/account/presentation/               # AccountScreens split: root · details · security · privacy · delete

apps/customer-web/app/
├── (account)/account/                           # detail rows + per-field ResponsiveModal editors
├── (account)/account/security/                  # NEW
├── (account)/account/privacy/                   # NEW — deletion control at the bottom
├── legal/privacy/ · legal/terms/                # NEW, PUBLIC — shell only, content operator-owned (R7)
└── delete-account/                              # NEW, PUBLIC — the Google-required web route

apps/customer-web/scripts/bundle-budget.mjs      # ⚠ the three new public routes join GUEST_PAGES (R8)
```

⚠ **The public deletion route is `/delete-account`, deliberately NOT `/account/delete`.** The latter
would put one URL subtree across two route groups with different layouts and different auth posture —
`(account)/account/...` is session-gated, and this page must be reachable by someone who has uninstalled
the app. A future auth guard added to the `(account)` layout would silently not cover a same-looking
sibling. A distinct top-level path removes the ambiguity rather than documenting it.

**Structure Decision**: this is a **monorepo vertical slice** across the two customer surfaces and the
existing cold-path customer service, plus **one line in the hot path's identity gate**. It adds one new domain folder (`closure/`) to a service that
already owns customer identity, addresses and password state — deletion belongs beside them, not in a
new service, because it is the terminal operation on the record they all share.

---

## Complexity Tracking

> Filled because the Constitution Check records one Principle III exception and one Principle V
> departure.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Cold-path service reads `public."order"`**, a table the hot path owns (Principle III boundary) | FR-042's blocker must know whether the shopper has an order in flight, and the deletion flow is cold-path by 011's routing law | Calling the hot path was rejected outright: **`core-api` has no cloud deploy**, so deletion would be permanently broken in dev and impossible in production. Duplicating order state into the account domain was rejected as strictly worse — two copies that can disagree about whether someone may delete their account. The read is one narrow, owned predicate returning a boolean plus the facts FR-042 requires; it projects no order data into the account domain. |
| **Quick-action tiles built container-free**, departing from the operator's screenshot (Principle V) | Principle V permits a card only when it is *demonstrably* the right pattern and **no better layout exists**. Here one plainly does — labelled icons, which is what the rest of the account area already is | Building the filled tiles would require claiming a card exception that the doctrine's own test defeats. **Flagged for the operator rather than decided silently**: if the filled tiles are wanted on sight, that is a one-line direction and the justification moves into this table instead. |
| **Telemetry declared but not transmitting** (Principle VII) | The events this feature needs are declared and emitted, but **PostHog has never been initialised on `customer-web`**, so `capture()` is a platform-wide no-op, and mobile telemetry has been deferred for twelve slices (research R15). Initialising it properly is a platform concern with its own consent, config and key-management surface — larger than this feature and wrong to smuggle in beside an account redesign | Doing nothing was rejected: **deletion is the one flow where losing the signal is materially bad**, because the whole safety argument for the FR-042 block is that it always clears, and only a funnel can show it does. **T082 therefore verifies emission at the call site**, so the events are correct and wired the day the platform initialiser lands. ⚠ Recorded here, not only in prose, because the Quality Gates make this table the required home for a deviation — an undocumented one is a defect. |

---

## Operator dependencies (outside code)

These cannot be completed by writing code, and the feature is not shippable without them:

1. **⚠ Privacy policy and terms content** — legally reviewed, operator-supplied (FR-052a, R7). The
   feature ships the routes; placeholder legal text would defeat SC-010.
2. **⚠ The erasure slice** — permanent deletion at day 30 is out of scope, and **store submission is
   blocked until it ships** (FR-041, SC-011). It will need `AdminDeleteUser`, a **new IAM statement**
   (R4).
3. **Play Console Data safety** — the web deletion URL must be declared there, matching FR-050 exactly.
4. **App review notes** — instruct reviewers to register a throwaway account before testing deletion
   (FR-051). ⚠ Not a special-cased account in code.
5. **The retained-data category list** — needs legal confirmation before the FR-045 disclosure copy is
   final. Apple has demanded developers cite the specific law behind retention claims.
