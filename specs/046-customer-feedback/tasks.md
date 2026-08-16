---
description: "Task list for 046-customer-feedback implementation"
---

# Tasks: Customer Feedback

**Input**: Design documents from `/specs/046-customer-feedback/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included per the platform's test culture (Vitest unit + container-backed repo tests +
per-service `config.contract.test.ts`; Kotlin `commonTest` on Android + iOS). Constitution Quality
Gates require verification against acceptance criteria, so tests are first-class here.

**Organization**: Tasks are grouped by user story. Cold path only — no Go/hot-path work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (submission + thank-you), US2 (read/search/triage), US3 (reply)

## Path Conventions

- Public submit service: `apis/edge-api/customer/src/feedback/`
- Console service: `apis/edge-api/admin/src/feedback/`
- Shared DTOs: `packages/shared-types/src/feedback.ts` · Emails: `packages/email-kit/src/`
- Storefront: `apps/customer-web/app/feedback/` · Console UI: `apps/back-office/src/features/feedback/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/feedback/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The cross-story scaffolding every story builds on.

- [ ] T001 [P] Create the migration `db/migrations/<ts>_customer_feedback.sql` (via `make db-new NAME=customer_feedback`) defining `public.feedback_submission`, `public.feedback_reply`, `public.feedback_note` with all CHECK constraints, indexes (created_at DESC, status/category, `pg_trgm` on message, citext email, source_key window), FKs, and the immutable-vs-mutable column comment — per [data-model.md](data-model.md). Forward-only; dev-only Down drops the tables.
- [ ] T002 [P] Add `packages/shared-types/src/feedback.ts`: the `FeedbackCategory` / `FeedbackStatus` / `FeedbackSource` / `FeedbackPlatform` unions, human label maps, `SubmitFeedbackRequest` / `SubmitFeedbackResult`, and the admin `FeedbackListItemDTO` / `FeedbackDetailDTO` / `FeedbackReplyDTO` / `FeedbackNoteDTO`; export from `packages/shared-types/src/index.ts`.
- [ ] T003 Scaffold the two domain dirs (`apis/edge-api/customer/src/feedback/`, `apis/edge-api/admin/src/feedback/`) and wire required env keys into each `serverless.yml` — reuse `email-kit`'s `MAIL_ENV_KEYS` and add the feedback rate-limit config keys (window + quota) with no literals buried in queries.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The migration, shared types, and the shared email templates — all stories depend on
these. `email-kit` is one shared package with one generation + one guard pass, so both templates are
authored together here even though `feedback-received` is exercised by US1 and `feedback-reply` by US3.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T004 Add the `feedback-received` and `feedback-reply` entries to `packages/email-kit/src/catalog.ts` (vars, subject, preheader, `audiences: ["customer"]`, `sentBy: "platform"`, `category: "transactional"`, and the opposite `onSendFailure` — `swallow` for received, `throw` for reply) per [feedback-email.contract.md](contracts/feedback-email.contract.md).
- [ ] T005 [P] Author `packages/email-kit/src/templates/feedback-received.mjml` + `packages/email-kit/src/text/feedback-received.txt.hbs` (monochrome tokens; reference code + category; no third-party asset).
- [ ] T006 [P] Author `packages/email-kit/src/templates/feedback-reply.mjml` + `packages/email-kit/src/text/feedback-reply.txt.hbs` (staff reply prominent + quoted original; approved reply identity only).
- [ ] T007 Regenerate the committed `email-kit` artifacts and run `make email-check` (drift/size/missing-text/contrast in light·dark·invert/banned-techniques/no-3p-asset) to green.

**Checkpoint**: Schema, DTOs, and both email templates ready — stories can begin.

---

## Phase 3: User Story 1 - A shopper sends feedback and is thanked (Priority: P1) 🎯 MVP

**Goal**: Public `/feedback` web page + mobile screen; a guest or signed-in shopper submits
categorised feedback, is confirmed on screen with a reference code, and (when an email was given)
receives a thank-you email. Makes the checkout header link real (SC-004).

**Independent Test**: Submit from web and mobile as guest and signed-in; verify a stored submission,
on-screen confirmation, and a `feedback-received` email when an email was provided.

### Tests for User Story 1

- [ ] T008 [P] [US1] `apis/edge-api/customer/src/feedback/service.test.ts` — valid submit; missing/whitespace message refused; invalid email refused (shared `EMAIL_SHAPE`); rate-limit refusal without threshold disclosure; inert-text preserved raw; thank-you send failure does NOT lose the submission (FR-015); uniform success reveals no account existence.
- [ ] T009 [P] [US1] `apis/edge-api/customer/src/feedback/repo.container.test.ts` — insert returns reference code; the rate-limit window COUNT is keyed on `source_key`; authenticated path sets `customer_id` + `email_verified=true`, public path does not.
- [ ] T010 [P] [US1] `apis/edge-api/customer/src/feedback/config.contract.test.ts` — reads the real `serverless.yml` and asserts every env key the service reads (incl. `MAIL_ENV_KEYS` + rate-limit keys) is declared (035/038 guard).

### Implementation for User Story 1

- [ ] T011 [P] [US1] `apis/edge-api/customer/src/feedback/lib.ts` — opaque `FB-XXXXXX` reference-code generator (not sequential/guessable) and the `source_key` hashing (sub → hashed sourceIp), with unit tests.
- [ ] T012 [US1] `apis/edge-api/customer/src/feedback/repo.ts` — raw-SQL insert + the in-statement rate-limit window (research D5); explicit row→domain mapping.
- [ ] T013 [US1] `apis/edge-api/customer/src/feedback/service.ts` — validate (message, email shape/length, category, rating, source, platform), decide rate limit, insert, send `feedback-received` when an email is available, return the uniform result; log WITHOUT the address.
- [ ] T014 [P] [US1] `apis/edge-api/customer/src/functions/feedback-submit-v1-post.ts` — authenticated handler: verified `sub` → `customer.id`, trusted profile email, `email_verified=true`.
- [ ] T015 [P] [US1] `apis/edge-api/customer/src/functions/feedback-submit-public-v1-post.ts` — public handler: body email/name unverified, `source_ip` from `requestContext.http.sourceIp`.
- [ ] T016 [US1] Wire both functions in `apis/edge-api/customer/serverless.yml` — `/customer/v1/feedback` behind the customer authorizer, `/customer/v1/feedback/public` with no authorizer.
- [ ] T017 [P] [US1] `apps/customer-web/app/feedback/page.tsx` (server component; prefill name/email from session for signed-in customers) + `apps/customer-web/app/feedback/_components/FeedbackForm.tsx` (single client island: category, message, optional rating, email; success + reference-code confirmation; inline validation preserving typed text) + the API call selecting the authed vs public route by session.
- [ ] T018 [US1] Confirm the checkout header "Give us feedback" link resolves to `/feedback` (SC-004) and add a stable footer/nav entry; re-run `apps/customer-web` bundle-budget (`/feedback` within the 174 KB guest gate).
- [ ] T019 [P] [US1] `apps/customer-mobile/.../features/feedback/` — domain (`Feedback` model + `SubmitFeedbackUseCase`), data (`HttpFeedbackRepository` + DTO mapping to `contract`), presentation (`FeedbackViewModel` immutable UI state + `FeedbackScreen`), a nav entry (Account/Help), and `commonTest` (validation + submit) compiling on Android + iOS.
- [ ] T020 [US1] Telemetry: declare + wire `feedback_submitted` (props: category, hasRating, hasEmail, source, platform — no PII) in the web/mobile taxonomy; add the submission metric and the thank-you send-failure alarm; verify no `submitter_email` in logs. ⚠ Record the PostHog-not-yet-initialised-on-customer-web carry-forward (039).

**Checkpoint**: US1 fully functional — the checkout link is live, submissions are stored and thanked, on web and mobile.

---

## Phase 4: User Story 2 - Staff read, search, and triage feedback (Priority: P2)

**Goal**: A back-office feedback console — list newest-first, full-text search + combinable filters,
a detail view with full context, status changes, and internal notes.

**Independent Test**: With varied submissions present, load the list, apply each filter + a search,
open a submission, change its status, and add an internal note (confirming the note is not
submitter-visible).

### Tests for User Story 2

- [ ] T021 [P] [US2] `apis/edge-api/admin/src/feedback/service.test.ts` — list/search/filter shaping; detail includes replies+notes; status change persists; note insert; read allowed for any active staff incl. csa; fail-closed on authz error.
- [ ] T022 [P] [US2] `apis/edge-api/admin/src/feedback/repository.container.test.ts` — pagination + newest-first ordering; combinable category/status/rating/date filters; text search over message + email; status update; note insert.
- [ ] T023 [P] [US2] `apis/edge-api/admin/src/feedback/config.contract.test.ts` — real `serverless.yml` env coverage.

### Implementation for User Story 2

- [ ] T024 [P] [US2] `apis/edge-api/admin/src/feedback/types.ts` — internal row/param types + mappers to the shared DTOs.
- [ ] T025 [P] [US2] `apis/edge-api/admin/src/feedback/authz.ts` — `isActiveStaff` (read: any active staff incl. csa), mirroring `deliverability/authz.ts`; fail-closed.
- [ ] T026 [US2] `apis/edge-api/admin/src/feedback/repository.ts` — raw-SQL list (filters + `pg_trgm` search + keyset/offset pagination + total), detail (submission + ordered replies + notes), status update, note insert.
- [ ] T027 [US2] `apis/edge-api/admin/src/feedback/service.ts` — read/search/filter, `changeStatus` (rejecting a direct set to `replied`), `addNote`; authz-gated.
- [ ] T028 [P] [US2] Handlers `feedback-list-v1-get.ts`, `feedback-detail-v1-get.ts`, `feedback-status-v1-post.ts`, `feedback-note-v1-post.ts` in `apis/edge-api/admin/src/functions/` + `serverless.yml` wiring (back-office authorizer).
- [ ] T029 [P] [US2] `apps/back-office/src/features/feedback/` — `model.ts`, `queries.ts`, `repo.ts`, `access.ts`, and `FeedbackListScreen.tsx` (shared `DataTable` + search box + category/status/rating/date filters + count).
- [ ] T030 [US2] `apps/back-office/src/features/feedback/FeedbackDetailScreen.tsx` (full message + context: customer-vs-guest, source, platform, timestamps; notes list + add-note; status control) + `apps/back-office/src/routes/feedback.tsx` (index + `$referenceCode` detail) + a nav entry in `components/layout/nav.ts` with NO `requiredRole` (csa-visible, like Deliverability).

**Checkpoint**: US1 + US2 both work — feedback is collected AND staff can read/search/triage it.

---

## Phase 5: User Story 3 - Staff reply and the submitter is emailed (Priority: P2)

**Goal**: Staff (admin/manager) reply to a submission; the submitter is emailed the reply; the
submission becomes `replied`; each reply is recorded as visible history. Reply is unavailable without
a submitter email and hidden from csa.

**Independent Test**: As admin/manager, reply to a submission with an email → submitter receives a
`feedback-reply` email, status becomes `replied`, reply appears in history. As csa, reply is
unavailable. On a submission with no email, reply is disabled.

### Tests for User Story 3

- [ ] T031 [P] [US3] `apis/edge-api/admin/src/feedback/service.test.ts` (reply cases) — role gate admin/manager (csa refused); `no_reply_address` when no email; send-success writes the reply row AND sets `status='replied'`; send-failure (throw) writes nothing and does not change status (FR-030); reply text stored raw/rendered inert.
- [ ] T032 [P] [US3] `apis/edge-api/admin/src/feedback/repository.container.test.ts` (reply) — the reply insert + status→`replied` happen in one transaction; multiple replies accumulate (FR-031).

### Implementation for User Story 3

- [ ] T033 [US3] Extend `apis/edge-api/admin/src/feedback/authz.ts` with `canReplyFeedback` (active AND role ∈ {admin, manager}); fail-closed.
- [ ] T034 [US3] Extend `apis/edge-api/admin/src/feedback/repository.ts` with the transactional reply write (insert `feedback_reply` + set submission `status='replied'`) invoked only after a successful send.
- [ ] T035 [US3] Extend `apis/edge-api/admin/src/feedback/service.ts` `reply` — require a submitter email (else `no_reply_address`), send `feedback-reply` via `@effy/email-kit/send`, write the row only on send success, propagate a send failure as `reply_send_failed`; snapshot `staff_name`.
- [ ] T036 [P] [US3] Handler `feedback-reply-v1-post.ts` in `apis/edge-api/admin/src/functions/` (403 for non-admin/manager, 409 `no_reply_address`, 502 `reply_send_failed`) + `serverless.yml` wiring.
- [ ] T037 [US3] Extend `apps/back-office/src/features/feedback/FeedbackDetailScreen.tsx` — reply composer (bounded length), replies history, disabled-with-reason state when no submitter email, and the reply action hidden for csa (role-gated in `access.ts`).
- [ ] T038 [US3] Telemetry: declare + wire `feedback_reply_sent` (prop: category) and the reply-count metric; the reply send-failure feeds the same alarm as T020.

**Checkpoint**: All three stories independently functional — the feedback loop is closed end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T039 [P] Update the parity register `docs/audiences/customer-capabilities.md` §046 (web ↔ mobile feedback parity) and note the console capability.
- [ ] T040 Full machine sweep: `pnpm -r typecheck`, `pnpm -r test`, `make email-check`, customer-mobile `:shared:testAndroidHostTest` + `:shared:iosSimulatorArm64Test` + `assembleDebug`, and the customer-web bundle budget — all green.
- [ ] T041 Operator: commit the migration then `make db-up ENV=dev`; `make edge-deploy SERVICE=customer ENV=dev` and `SERVICE=admin ENV=dev`.
- [ ] T042 Operator: live SC walk per [quickstart.md](quickstart.md) — US1–US3 across web/mobile/console, the rate-limit + send-failure negative proofs, the inert-text proof, and the no-PII-in-logs sweep.
- [ ] T043 Write `specs/046-customer-feedback/SIGNOFF.md` recording what was machine-verified vs what remains an operator device/live walk.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all stories (migration + DTOs + emails).
- **US1 (Phase 3)**: depends on Foundational. MVP — independently shippable.
- **US2 (Phase 4)**: depends on Foundational. Independent of US1 (reads the same tables US1 writes, but testable on seeded rows).
- **US3 (Phase 5)**: depends on Foundational and **builds on US2's admin domain** (extends `authz.ts`/`repository.ts`/`service.ts`/`FeedbackDetailScreen.tsx`) — do US2 before US3.
- **Polish (Phase 6)**: after the desired stories.

### Within Each Story

- Tests before implementation; repository before service; service before handlers; handlers before UI.
- US3 extends US2 files, so US3 tasks are sequential on those shared files (few [P]).

### Parallel Opportunities

- Setup: T001 + T002 in parallel.
- Foundational: T005 + T006 in parallel (T004 before both; T007 after all).
- US1: T008/T009/T010 (tests) in parallel; then T011; T012→T013; T014/T015 in parallel; T017 + T019 (web + mobile) fully parallel to each other and to the edge work once the service exists.
- US2: T021/T022/T023 in parallel; T024/T025 in parallel; then T026→T027→T028; T029 parallel to handlers, T030 after T029.
- Cross-story: with capacity, US1 and US2 can proceed in parallel after Foundational; US3 waits on US2.

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "service.test.ts for submit validation/rate-limit/inert-text in apis/edge-api/customer/src/feedback/"
Task: "repo.container.test.ts for insert + rate-limit window in apis/edge-api/customer/src/feedback/"
Task: "config.contract.test.ts in apis/edge-api/customer/src/feedback/"

# Clients together (after the service exists):
Task: "customer-web /feedback page + FeedbackForm island in apps/customer-web/app/feedback/"
Task: "customer-mobile features/feedback slice in apps/customer-mobile/.../features/feedback/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** (checkout link live,
submissions stored + thanked on web and mobile) → deploy/demo.

### Incremental Delivery

Foundation → US1 (MVP: shoppers are heard) → US2 (staff can read/triage) → US3 (staff can reply) —
each adds value without breaking the last.

---

## Notes

- Cold path only; two edge services, no Go.
- Two submit routes (authed + public) are deliberate (per-route authorizers — research D2).
- No new real-world identifier — emails use the approved `hello@` / `workspace-admin@` mailboxes.
- Commit after each task or logical group; the migration must be committed before `make db-up` (003 guard).
- Do NOT auto-commit — the operator commits (per user preference).
