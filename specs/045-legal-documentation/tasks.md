---
description: "Task list for 045-legal-documentation"
---

# Tasks: Customer Legal & Informational Documentation (Web + Mobile, Store-Ready)

**Input**: Design documents from `specs/045-legal-documentation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED. The plan's Testing section and the constitution's Quality Gates (verify against
acceptance criteria) and guard doctrine ("proven the way it will break") make the content-render,
link-integrity, consistency, drift-guard and bundle-budget tests part of the deliverable.

**Organization**: By user story (US1–US4 from spec.md), each independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4; Setup/Foundational/Polish carry no story label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the shared content package and the operator-collateral location.

- [x] T001 Create the `packages/legal-content` package (`@effy/legal-content`): `package.json`,
  `tsconfig.json`, `src/index.ts`, wire into the pnpm workspace + Turborepo (`turbo.json` pipeline)
- [x] T002 [P] Add `legal:gen` and `legal:check` npm scripts to `packages/legal-content/package.json`,
  and hook `legal:check` into the repo test gate (root `package.json` / turbo `test`) so it rides `pnpm -r test`
- [x] T003 [P] Create `docs/store-submission/` with stub files `app-privacy-mapping.md`,
  `data-safety-mapping.md`, `submission-checklist.md`, `review-notes.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single-source content spine, the two renderers, and the generator+guard. Both the
prose (US1) and the store mappings (US2) derive from the inventory (T006), so this phase blocks everything.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T004 Define the constrained-Markdown subset + the document/version schema and the (empty) registry
  in `packages/legal-content/src/manifest.ts` per [data-model.md](./data-model.md) (LegalDocument, DocumentVersion)
- [x] T005 [P] Create `packages/legal-content/src/identifiers.ts` — RealWorldIdentifiers as fail-loud
  placeholder tokens (`[LEGAL_ENTITY_NAME]`, `[ABN]`, `[REGISTERED_ADDRESS]`, `[GOVERNING_LAW_STATE]`,
  privacy contact defaulting to an approved mailbox) per research R12
- [x] T006 Author the data-type / sub-processor inventory in `packages/legal-content/src/inventory.ts`
  — the ONE spine feeding the Privacy Policy + Apple + Google mappings (SC-004), derived from research R10
  (Cognito, Stripe, AWS SES/RDS/S3, PostHog, Crashlytics, FCM/APNs, Google sign-in; RETAINED = completed
  orders, payment records, fraud signals)
- [x] T007 [P] Implement the web Markdown→React **server** renderer (subset only, zero client JS) in
  `apps/customer-web/components/legal/MarkdownDocument.tsx` + `DocumentMeta.tsx` per research R2
- [x] T008 [P] Implement the mobile Markdown→Compose renderer (same subset) in
  `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/legal/presentation/MarkdownRender.kt` per research R3
- [x] T009 Implement `legal:gen` (canonical corpus → committed Kotlin content catalogue for mobile) in
  `packages/legal-content/scripts/gen-compose.mjs`, deterministic per contract
- [x] T010 Implement `legal:check` in `packages/legal-content/scripts/check.mjs` — fails and names the
  cause on: drift, unresolved identifier placeholder, manifest integrity, subset violation, broken
  internal link (per [contracts/legal-content.contract.md](./contracts/legal-content.contract.md))
- [x] T011 [P] Add nav keys (`Terms`, `Refunds`, `Cookies`, `AcceptableUse`, `Eula`, `Licenses`,
  `About`, `LegalIndex`, `DocumentVersions`) to
  `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/nav/CustomerNavKey.kt`

**Checkpoint**: Content spine, renderers, generator and guard exist — story work can begin.

---

## Phase 3: User Story 1 - Accurate, complete legal documents on both surfaces (Priority: P1) 🎯 MVP

**Goal**: Every required document exists as complete, honest, reviewed-pending prose, rendered on web
and natively in mobile from one source.

**Independent Test**: Open each document on web and mobile — real prose, version + effective date, no
placeholder; every factual claim traces to the built system (quickstart A–C).

### Tests for User Story 1

- [x] T012 [P] [US1] Web content-render test (every manifest document renders real prose + meta row, no
  "being prepared") in `apps/customer-web/__tests__/legal-render.test.ts`
- [x] T013 [P] [US1] Mobile catalogue test (every document present and renders under the Compose
  renderer) in `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/legal/LegalCatalogueTest.kt`
- [x] T014 [P] [US1] SC-002 honesty test: every data type / sub-processor / retained category named in
  the Privacy Policy exists in `inventory.ts` (no untraced claim) in `apps/customer-web/__tests__/legal-honesty.test.ts`

### Implementation for User Story 1 (author the prose — drafts for legal review)

- [x] T015 [P] [US1] Author **Privacy Policy** in `packages/legal-content/src/documents/privacy-policy/v1.md`
  (APP 1/5/7/8/11/12–13, retention & deletion per R11, overseas disclosure, cookies, complaint path — R6–R11)
- [x] T016 [P] [US1] Author **Terms of Service** in `packages/legal-content/src/documents/terms-of-service/v1.md`
  (accounts, ordering/pricing/GST/substitutions, delivery, cancellations, non-excludable ACL guarantees,
  acceptable-use ref, liability, disputes, governing law — R8/R9)
- [x] T017 [P] [US1] Author **Refund, Returns & Cancellations** in `packages/legal-content/src/documents/refunds-returns/v1.md`
  (grocery/perishable, missing/damaged/incorrect items, cancellation window, refund method/timing; includes the matrix table)
- [x] T018 [P] [US1] Author **Cookie & Tracking Notice** in `packages/legal-content/src/documents/cookies-tracking/v1.md`
  (web cookies/local storage + analytics/crash identifiers, purposes, controls)
- [x] T019 [P] [US1] Author **Acceptable Use Policy** in `packages/legal-content/src/documents/acceptable-use/v1.md`
- [x] T020 [P] [US1] Author **EULA posture** in `packages/legal-content/src/documents/eula/v1.md`
  (adopt Apple Standard EULA + Google Play terms; Terms govern the service — research R9)
- [x] T021 [P] [US1] Author **About / Business Identity & Contact** in `packages/legal-content/src/documents/about/v1.md`
  (entity, ABN, address, contact channels — all via identifier tokens)
- [x] T022 [US1] Generate **Open-Source Acknowledgements** in `packages/legal-content/src/documents/acknowledgements/v1.md`
  from the distributed dependency set
- [x] T023 [US1] Register all documents in `packages/legal-content/src/manifest.ts`
  (slug, title, version=v1, effectiveDate, category, order) and run `legal:gen` to emit the mobile content
- [x] T024 [US1] Web: implement `apps/customer-web/app/legal/[type]/page.tsx` to render any document by
  slug from `@effy/legal-content` (sectioned typography, no cards — research R5)
- [x] T025 [US1] Web: replace the placeholder bodies in `apps/customer-web/app/legal/privacy/page.tsx`
  and `apps/customer-web/app/legal/terms/page.tsx` with the real render (or redirect to the `[type]` slugs)
- [x] T026 [US1] Web: implement `apps/customer-web/app/about/page.tsx` (public)
- [x] T027 [US1] Mobile: implement `DocumentScreen` in
  `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/legal/presentation/LegalScreens.kt`
  and wire each nav key to render its document
- [x] T028 [US1] Web: add every new public route (`/legal`, `/legal/[type]` instances, `/about`) to
  `apps/customer-web/scripts/bundle-budget.mjs` GUEST_PAGES in the same change (FR-058c doctrine)

**Checkpoint**: All documents exist, render on both surfaces, and are honest — MVP.

---

## Phase 4: User Story 2 - Store submission readiness (Priority: P1)

**Goal**: Both mobile apps satisfy every Apple/Google legal, privacy, deletion and metadata requirement,
or record an explicit dependency.

**Independent Test**: Walk the submission checklist; confirm consistency across policy + both mappings
and the matching deletion URL (quickstart F).

### Tests for User Story 2

- [ ] T029 [P] [US2] Consistency test: the data-type / sub-processor set is identical across the Privacy
  Policy, `app-privacy-mapping.md` and `data-safety-mapping.md` (SC-004) in `apps/customer-web/__tests__/store-consistency.test.ts`
- [ ] T030 [P] [US2] SC-008 test: the Google deletion URL equals the URL cited in the Privacy Policy
  (both `/delete-account`) in the same or a sibling test

### Implementation for User Story 2

- [x] T031 [P] [US2] Author `docs/store-submission/app-privacy-mapping.md` (Apple App Privacy details +
  privacy-manifest/ATT note) from `inventory.ts`
- [x] T032 [P] [US2] Author `docs/store-submission/data-safety-mapping.md` (Google Data safety, incl.
  in-app + web deletion paths) from `inventory.ts`
- [x] T033 [P] [US2] Author `docs/store-submission/review-notes.md` — instruct the reviewer to register a
  throwaway account before testing deletion (FR-027; no special-cased account in code)
- [x] T034 [US2] Author `docs/store-submission/submission-checklist.md` (StoreSubmissionItems); mark the
  permanent-erasure claim **blocked-dependency** (R11) and the identifiers **operator-action** (FR-009)
- [x] T035 [US2] Reconcile the `apps/customer-web/app/delete-account/page.tsx` copy with the authored
  Privacy Policy deletion language (honest current behaviour — R11), keeping the retained-category wording aligned

**Checkpoint**: The apps are submittable; the only open items are recorded external/operator dependencies.

---

## Phase 5: User Story 3 - Discoverable from the right place (Priority: P2)

**Goal**: Every document is linked where its decision is made, on both surfaces, with no broken or
wrong-document link — including the fixed mobile Terms→Privacy defect.

**Independent Test**: Walk every entry point in the link-integrity table; each resolves to the correct
document (quickstart D).

### Tests for User Story 3

- [ ] T036 [P] [US3] Web link-integrity test over the contract table (footer, sign-up consent, checkout,
  newsletter, account privacy, delete-account, `/legal` index) in `apps/customer-web/__tests__/legal-links.test.ts`
- [x] T037 [P] [US3] Mobile link-integrity + **Terms→Privacy regression** test (FR-022) in
  `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/legal/LegalLinksTest.kt`

### Implementation for User Story 3

- [x] T038 [US3] Web: add a "Legal & company" column to
  `apps/customer-web/app/(shop)/_components/StorefrontFooter.tsx` (all legal docs + About + delete-account + `/legal`)
- [x] T039 [US3] Web: implement `apps/customer-web/app/legal/page.tsx` — the `/legal` index listing all documents
- [x] T040 [US3] Web: point the sign-up consent links in `apps/customer-web/app/(auth)/_components/AuthKit.tsx`
  at the current Terms + Privacy slugs
- [ ] T041 [US3] Web: add Terms + Refund/Returns links at the checkout place-order point in
  `apps/customer-web/app/checkout/_components/` (and `CheckoutFooter.tsx` where appropriate)
- [ ] T042 [US3] Web: reference the Privacy Policy with consent wording on the newsletter sign-up
  (`apps/customer-web/app/(shop)/newsletter/`)
- [x] T043 [US3] Web: ensure Account → Privacy & data links Privacy, Terms, Refunds, Acknowledgements,
  delete in `apps/customer-web/app/(account)/account/page.tsx`
- [x] T044 [US3] Mobile: fix the Terms→Privacy mis-wire and add Refunds + Licenses rows in
  `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/account/presentation/AccountScreens.kt`
- [x] T045 [US3] Mobile: implement the **About** screen (app version, business identity, licenses, legal
  links) in `features/legal/presentation/LegalScreens.kt` and wire it into the Account section
- [ ] T046 [US3] Mobile: add Terms + Refund/Returns links at checkout and Terms/Privacy on the sign-up
  consent (`features/auth/presentation/AuthScreens.kt`)

**Checkpoint**: All links resolve correctly on both surfaces; the mobile defect is fixed.

---

## Phase 6: User Story 4 - Versioned documents (Priority: P3)

**Goal**: Each document shows a version + effective date and has a working version-history view.

**Independent Test**: Each document shows its version/date; the history route lists versions or states
"first version" (quickstart B/§version).

### Tests for User Story 4

- [ ] T047 [P] [US4] Version-history test (lists versions, marks current, first-version state) in
  `apps/customer-web/__tests__/legal-versions.test.ts`

### Implementation for User Story 4

- [x] T048 [US4] Web: implement `apps/customer-web/app/legal/[type]/versions/page.tsx` from the manifest
  `getVersions(slug)` (mark current; "This is the first version" when only v1)
- [x] T049 [US4] Confirm the meta row (version + effective date) renders on every document on both
  surfaces (web `DocumentMeta`, mobile `DocumentScreen` header)

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T050 [P] Telemetry: declare `legal_document_viewed` (type, surface) and `legal_link_clicked`
  events in the shared taxonomy; record the platform gap that PostHog is not yet initialised on
  customer-web (events declared, no-op until fixed) per plan §VII
- [ ] T051 [P] Playwright e2e for the public legal routes + version history in `apps/customer-web/e2e/legal.spec.ts`
- [ ] T052 Run the `legal:check` break-it proofs (drift / unresolved placeholder / manifest integrity)
  per quickstart §E and confirm each fails with a named cause
- [x] T053 Confirm the guest-bundle budget lists every new public route and passes (`pnpm --filter @effy/customer-web build` + budget)
- [ ] T054 [P] Update the parity register `docs/audiences/customer-capabilities.md` §045
- [ ] T055 Run the full quickstart.md A–F validation walk
- [ ] T056 Verify the banned `techsupport+claudeone@phantm.com` appears nowhere (`git grep` clean);
  run `pnpm -r typecheck`, `pnpm -r test`, `legal:check`, and Android + iOS compile

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup; **blocks all user stories** (the content spine, renderers,
  generator and guard).
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after Foundational; depends on the T006 inventory (shared with US1). Content-authoring
  independent of US1 prose, but the checklist references US1's routes as evidence.
- **US3 (Phase 5)**: after US1 (needs documents to link to). Independently testable once US1 exists.
- **US4 (Phase 6)**: after US1 (needs the manifest/documents). Small.
- **Polish (Phase 7)**: after the desired stories.

### Story independence

- **US1** stands alone (documents render).
- **US2** derives from the same inventory as US1; can proceed in parallel with US1's prose once T006 is done.
- **US3** and **US4** consume US1's output.

### Within each story

- Tests before implementation where practical (content-render/link/consistency tests are written to fail first).
- Inventory (T006) before any privacy/mapping prose.
- `manifest.ts` registration + `legal:gen` (T023) before web `[type]` render and mobile render depend on it.

### Parallel opportunities

- Setup: T002, T003 in parallel.
- Foundational: T005, T007, T008, T011 in parallel (different files); T009/T010 after T004/T006.
- US1 prose: T015–T021 all `[P]` (one file each).
- US2 mappings: T031–T033 all `[P]`.
- Tests within a story marked `[P]` run together.

---

## Parallel Example: User Story 1 (author the corpus)

```bash
# The eight documents are one file each — author in parallel:
Task: "Author Privacy Policy in packages/legal-content/src/documents/privacy-policy/v1.md"
Task: "Author Terms of Service in packages/legal-content/src/documents/terms-of-service/v1.md"
Task: "Author Refund/Returns in packages/legal-content/src/documents/refunds-returns/v1.md"
Task: "Author Cookie & Tracking in packages/legal-content/src/documents/cookies-tracking/v1.md"
Task: "Author Acceptable Use in packages/legal-content/src/documents/acceptable-use/v1.md"
Task: "Author EULA posture in packages/legal-content/src/documents/eula/v1.md"
Task: "Author About in packages/legal-content/src/documents/about/v1.md"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP and VALIDATE** the
documents on both surfaces (quickstart A–C). This alone discharges the legal-obligation half and unblocks
the store-content requirement.

### Incremental delivery

Setup + Foundational → US1 (documents, MVP) → US2 (store collateral, submittable) → US3 (wiring) →
US4 (versioning) → Polish. Each adds value without breaking the previous.

---

## Notes

- ⚠ **Real-world identifiers are placeholders** (T005) — `legal:check` (T010) blocks publish until the
  operator supplies them and a lawyer reviews the drafts. This is intended: the tasks produce
  publish-ready drafts, not a self-authorised publish.
- ⚠ **The permanent-erasure claim stays honest** (T035/T034) — the erasure worker is a recorded
  dependency, not written as an unmet promise (R11).
- Commit after each task or logical group; keep `legal:check` green.
