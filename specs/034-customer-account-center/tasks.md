---

description: "Task list for 034-customer-account-center"
---

# Tasks: Customer Account Centre — Detail-Row Editing, Sectioned Account & Account Deletion

**Input**: Design documents from `/specs/034-customer-account-center/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/account-center.contract.md](contracts/account-center.contract.md) ·
[quickstart.md](quickstart.md)

**Tests**: Included, but **targeted rather than exhaustive**. Each test task below exists because
research identified a *specific* defect class it catches — not to hit a coverage number. Four are
load-bearing: the blocker-clears test (**T043**), the dirty-check matrix (**T029** + walk **T093**), the
Go↔Kotlin wire contract (**T033**), and the closed-customer hot-path refusal (**T013a**).

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves (US1–US6)
- Exact file paths in every description

## Path Conventions

Monorepo. Cold path `apis/edge-api/customer/`, mobile `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`
(abbreviated **`CM/`** below), web `apps/customer-web/`, shared `packages/`.

---

## Phase 1: Setup

**Purpose**: Get the shared contract and the migration file in place before anything consumes them.

- [ ] T001 Create the migration file by running `make db-new NAME=customer_account_center` and confirm it lands in `db/migrations/` with a fresh timestamp
- [ ] T002 [P] Read `apis/edge-api/customer/src/customer/repo.ts:17-39` and `apps/customer-web/scripts/bundle-budget.mjs:100-130` before writing code — both carry standing warnings this feature can violate (the `ON CONFLICT` trap and the unmeasured-public-route trap)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, contract, gates and shared UI primitives. **No user story can begin until this phase is complete.**

**⚠️ CRITICAL**: T003–T010 change the data and the contract; T011–T014 change how *every* request is authorized. Getting T012/T013 wrong leaves a deleted shopper able to place orders.

### Schema

- [ ] T003 Write the migration in `db/migrations/<timestamp>_customer_account_center.sql`: add `phone text NULL` and `closure_state text NOT NULL DEFAULT 'open' CHECK (closure_state IN ('open','closing'))` to `public.customer`
- [ ] T004 In the same migration, create `public.customer_closure_request` per [data-model.md](data-model.md) — including the **partial unique index** `UNIQUE (customer_id) WHERE cancelled_at IS NULL`, which is what makes a double submission unable to create two windows with two different erase dates
- [ ] T005 Add column comments to the migration recording *why* `closure_state` is separate from `status` and why `erase_after` is stored rather than derived — the reasoning in [data-model.md](data-model.md) belongs next to the schema, not only in a spec

### Shared contract

- [ ] T006 Add `phone: string | null` and `closureState: "open" | "closing"` to `CustomerDTO` in `packages/shared-types/src/customer.ts`
- [ ] T007 Add `phone?: string` to `UpdateCustomerDTO` in `packages/shared-types/src/customer.ts` — and **do not** add `closureState` to it; extend the existing doc comment at `customer.ts:69-76` to say why
- [ ] T008 Add `ClosurePreviewDTO`, `ClosureBlockerDTO`, `RetainedCategoryDTO`, `ClosureChallengeResultDTO`, `ClosureRequestDTO`, `ClosureResultDTO` and `ClosureRestoreResultDTO` to `packages/shared-types/src/customer.ts` per the contract, with `clearsAt` **non-nullable** so a blocker that cannot say when it ends is unrepresentable (same file as T006/T007 — **not** parallel with them)
- [ ] T009 Reference every new type from the Kotlin generator's aggregator so it actually generates — **a type nobody references generates zero times and the drift check then passes trivially** (the trap feature 033 recorded as R17)
- [ ] T010 Regenerate `packages/shared-types/contract/Dto.kt` and confirm the drift guard passes

### Both authorization gates

- [ ] T011 Extend `apis/edge-api/customer/src/customer/model.ts` and `repo.ts` to read/write `phone` and `closure_state`, and **verify `closure_state` is absent from the JIT upsert's `ON CONFLICT DO UPDATE` clause** — for the reason `status` is absent (`repo.ts:17-39`)
- [ ] T012 Refuse a `closing` customer in `apis/edge-api/customer/src/customer/service.ts:33`, alongside the existing `status !== "active"` check, keeping the refusal body uniform so it discloses nothing about which condition applied
- [ ] T013 ⚠ Refuse a `closing` customer on the **hot path** in `apis/core-api/internal/platform/customeridentity/customeridentity.go:63`, beside `if found.Status == "barred"` — **this is the single easiest thing in this feature to miss**: a closure enforced only on the cold path leaves a "deleted" shopper able to browse, cart and check out
- [ ] T013a ⚠ Add a Go unit test in `apis/core-api/internal/platform/customeridentity/` asserting a `closing` customer is refused — the one security-critical backend change in this feature, and until this exists nothing verifies it at all
- [ ] T014 [P] Keep `apis/edge-api/customer/src/functions/customer-sessions-v1-delete.ts` ungated for closure, matching the deliberate barred carve-out already at line 24 — a closing customer must still be able to sign out
- [ ] T014a Implement the **explicit restore path** in `apis/edge-api/customer/src/customer/service.ts`, ordered upsert → restore-if-explicitly-requested → otherwise refuse (per [data-model.md](data-model.md) §Enforcement). ⚠ The refusal and the restore run through the **same** `getOrCreateCustomer`; a naive "throw when closing" refuses the very request meant to restore
- [ ] T014b Test the ordering directly: a `closing` customer's ordinary authenticated read is **refused**, an explicit restore call **succeeds and returns the account to `open`**, and a stolen token alone never silently un-deletes (FR-041a)

### Shared UI primitives

- [ ] T015 Add `EffySheet` to `CM/core/presentation/StorefrontKit.kt`: drag handle, an **explicit visible close control** (FR-017), `imePadding` (FR-016), bounded `sheetMaxWidth` (FR-024), and a dirty-aware dismissal hook. ⚠ **Must not go in `packages/mobile-kit`** — that package is `srcDir`-shared with `shop-mobile` (`StorefrontKit.kt:252-260`)
- [ ] T016 Add a tappable label/value/chevron row to `CM/core/presentation/StorefrontKit.kt` beside the existing `EffyDetailRow` (which is display-only, has no trailing slot and stays as it is). Same file as T015 — **serialize**
- [ ] T016a Give every control added in T015/T016 a **48 dp activation area** measured on the target, not the glyph (FR-055) — ⚠ feature 033 shipped a 32 dp control directly beneath a comment asserting it met the minimum
- [ ] T017 Migrate the two existing raw `ModalBottomSheet` call sites onto `EffySheet` — `CM/features/addresses/presentation/AddressBookScreen.kt:101-114` and `CM/features/checkout/presentation/CheckoutScreen.kt:125-126` — proving the primitive covers real cases before new screens depend on it
- [ ] T018 [P] Add a single-field editor wrapper on web in `apps/customer-web/components/`, composed from the **existing** `ResponsiveModal` in `@effy/design-system/ui` — no new overlay component, no new dependency
- [ ] T019 Register the new mobile routes in **all three places** in `CM/core/nav/CustomerNavKey.kt` — the sealed interface, the `customerNavSavedState` polymorphic module, and `ALL_CUSTOMER_ROUTES`. ⚠ Missing the module registration fails **only on iOS, only after process death**
- [ ] T020 Update the hard-coded route count at `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/app/ScreenInventoryTest.kt:58` to match

**Checkpoint**: Schema, contract, both gates and the shared primitives exist. User stories can begin.

---

## Phase 3: User Story 1 — Change one detail without a form (Priority: P1) 🎯 MVP

**Goal**: Personal details shows label/value rows and no inputs; tapping one opens a single-field editor with Save, a de-weighted Cancel, and a dirty-check that cannot silently discard work.

**Independent Test**: Reach personal details **without a "My details" row**, change the name via the editor, confirm the row behind updates and the change survives a restart. Then attempt every dismissal route with a dirty value and confirm each prompts.

### Backend

- [ ] T021 [P] [US1] Accept `phone` in `apis/edge-api/customer/src/functions/customer-me-v1-patch.ts`, mapping `""` → `NULL` on the **identical path** the name parts use at lines 111-119 — ⚠ a `null` is dropped by the mobile client's `explicitNulls = false`, so without this the field cannot be cleared
- [ ] T022 [US1] Trim and length-bound `phone` in `apis/edge-api/customer/src/customer/service.ts`, storing it as entered — deliberately **no** format validation while the value is unverified and non-authoritative
- [ ] T023 [P] [US1] Unit-test the phone patch path in `apis/edge-api/customer/src/customer/*.test.ts`, including that `""` clears to `NULL` and that `closureState` is rejected if sent

### Mobile

- [ ] T024 [US1] Split `CM/features/account/presentation/AccountScreens.kt` — extract a `PersonalDetailsScreen` and give it its own ViewModel, so one screen's error can no longer bleed onto another (the reason `clearTransient()` exists at line 210)
- [ ] T025 [US1] Build `PersonalDetailsScreen` as label/value/chevron rows for name, phone and email — **no input field anywhere on the screen** (FR-011)
- [ ] T026 [US1] Show the email row as **non-editable, explaining why on activation** rather than doing nothing (FR-022)
- [ ] T027 [US1] Show phone with **no verified indicator** (FR-060a), and do not copy it to or from `customer_address.phone` (FR-060b)
- [ ] T028 [US1] Wire the single-field editor: pre-filled, focused, keyboard raised (FR-013), Save with **de-weighted** Cancel below it (FR-014/FR-015)
- [ ] T029 [US1] Implement the dirty-check on **both** mobile dismissal paths — `onDismissRequest` (scrim + back) **and** the sheet state's drag veto. ⚠ Wiring only one leaves the other route discarding silently
- [ ] T029a [US1] Render the discard confirmation as an **alert, not a second sheet** (FR-023a) — and confirm no editor anywhere opens a sheet on top of a sheet (FR-023)
- [ ] T030 [US1] Keep the typed value on failure and distinguish "refused" from "could not be delivered" (FR-021)
- [ ] T030a [US1] Render validation errors **inside the editor, against the field**, preserving the typed value (FR-020) — distinct from T030, which is about *why* a save failed rather than *where* the error appears
- [ ] T030b [US1] Preserve the open editor and its typed value across **backgrounding and process death** (`rememberSaveable` on mobile) — ⚠ the same iOS-only-after-process-death class research R9 warns about
- [ ] T030c [US1] Preserve the typed value when the **session expires mid-edit** — the value must survive the trip to sign-in rather than being discarded on the way
- [ ] T031 [US1] Delete the unused `Password(...)` composable at `AccountScreens.kt:419-430` — dead code from before `EffyField` landed

### Web

- [ ] T032 [P] [US1] Replace the inline form in `apps/customer-web/app/(account)/account/ProfileForm.tsx` with label/value rows opening the T018 editor, preserving the existing dirty-check behaviour
- [ ] T033 [P] [US1] Add a **byte-identical Go↔Kotlin-style wire contract test** for `CustomerDTO`'s new fields — the cross-language pin feature 028 established, because a silent JSON rename compiles fine on both sides
- [ ] T034 [US1] Add the phone row and the non-editable email row to the web personal details view at parity with mobile
- [ ] T034a [P] [US1] Add a **Playwright** spec covering the web dirty-check matrix — close control, `Esc`, backdrop click and browser back, dirty and clean (SC-003). ⚠ Vitest cannot reach this: three of the four routes are browser behaviour, not component behaviour
- [ ] T034b [P] [US1] Assert `phone` is accepted by **zero** identity, recovery or authentication paths (SC-018's second half) — T027 covers only that no verified indicator is shown

**Checkpoint**: US1 fully functional and independently testable on both surfaces.

---

## Phase 4: User Story 2 — A grouped account page (Priority: P1)

**Goal**: Identity header is the only route to personal details; icon shortcuts for Saved items and Notifications; labelled sections; **no sign-out control on the root**.

**Independent Test**: Open Account, confirm header/shortcuts/sections, confirm sign out is absent, and walk every previously reachable destination to confirm none is orphaned.

- [ ] T035 [US2] Rebuild the mobile account root in `CM/features/account/presentation/AccountScreens.kt`: identity header as a single activation target (FR-002), no "My details" row (FR-003)
- [ ] T036 [US2] Build the quick-action shortcuts for Saved items and Notifications **container-free** (icon + visible label), per research R10 — ⚠ this deliberately departs from the supplied screenshot's filled tiles; if the operator wants tiles on sight, the justification moves into the plan's Complexity Tracking
- [ ] T037 [US2] Group the remaining destinations under labelled section headings, ≤4 groups and ≤6 items each (SC-004)
- [ ] T038 [US2] Remove both sign-out rows from the account root (FR-007) — they move to Security in US4
- [ ] T039 [US2] Confirm every new sub-screen carries an `EffyAppBar` — ⚠ the bottom bar hides below a tab root, and a screen without one **strands the shopper** (the regression `CM/features/help/presentation/HelpScreens.kt:82-84` records)
- [ ] T040 [P] [US2] Mirror the root structure on web in `apps/customer-web/app/(account)/account/page.tsx` and the nav in `apps/customer-web/app/(account)/layout.tsx`
- [ ] T041 [P] [US2] Add a mobile test asserting **zero** sign-out controls on the account root and that every pre-existing destination is still reachable (SC-005, FR-008)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Delete my account (Priority: P1)

**Goal**: In-app deletion, reached from the bottom of Privacy & data, blocked only by obligations that **always clear**, gated by a fresh emailed code, closing the account immediately on both paths.

**Independent Test**: Complete the flow and confirm the account is refused on **iOS, Android and the web storefront**, across both the account service and the commerce service.

### Backend — the blocker

- [ ] T042 [US3] Implement the blocking-order query in `apis/edge-api/customer/src/closure/repo.ts`: `status = 'pending_payment'`, **or** `status = 'paid' AND created_at > now() - interval '30 days'`. ⚠ Reads `public."order"` directly — the recorded Principle III exception (research R2); `core-api` has no cloud deploy so calling it would break deletion everywhere
- [ ] T043 [US3] ⚠ **The load-bearing test.** In `apis/edge-api/customer/src/closure/*.test.ts`, prove a paid order **stops blocking** once it ages past the window. Two cases, because this requirement has now been wrong twice: (a) an order older than the window does not block — catching the "ever paid ⇒ never deletable" defect; (b) **a shopper who orders every week still has deletable days** — catching the "still shopping ⇒ never deletable" defect the 30-day window would have shipped
- [ ] T044 [US3] Emit `resolvableByShopper: true` only for `order_awaiting_payment`, and populate `clearsAt` on **every** blocker (FR-042). ⚠ The paid-order kind is `order_in_transit` and its window is **7 days, not 30** — 30 matched the grace period, which answers a different question, and on a weekly-re-buy grocery platform it would have blocked the most active shoppers permanently
- [ ] T045 [P] [US3] Test that **no unmodelled blocker is ever emitted** — no balance, no refund (FR-042a)
- [ ] T046 [US3] Set `href` and `target` from the same order id and pin that they agree, per the web-routes-on-`href` / mobile-routes-on-`target` split feature 029 established

### Backend — the flow

- [ ] T047 [US3] Implement `GET /customer/v1/closure` in `apis/edge-api/customer/src/functions/customer-closure-v1-get.ts` returning blockers, retained categories and `eraseAfterIfRequestedNow` — side-effect free
- [ ] T048 [US3] Implement `POST /customer/v1/closure/challenge` in `apis/edge-api/customer/src/functions/customer-closure-v1-challenge.ts`, **reusing** `GetUserAttributeVerificationCodeCommand` from `apis/edge-api/customer/src/password/cognito.ts` — token-authorized, so **no new IAM**; refuse to issue a code while blockers exist
- [ ] T049 [US3] Implement `POST /customer/v1/closure` in `apis/edge-api/customer/src/functions/customer-closure-v1-post.ts` as **one transaction**: re-evaluate blockers **inside** it (an order can be placed between preview and confirm) → verify the code → insert the closure request with a **stored** `erase_after` → set `closure_state = 'closing'` → `GlobalSignOutCommand`
- [ ] T050 [US3] Return distinguishable failures — `400` bad code, `409` blockers appeared, `409` already closing — and **allow a barred customer through** (FR-049): a sanction must not override a data right
- [ ] T051 [US3] Implement restore-on-sign-in as a **deliberate, auditable write** setting `cancelled_at` — ⚠ never via `ON CONFLICT DO UPDATE`, for the reason at `customer/repo.ts:17-39`
- [ ] T052 [P] [US3] Register the three routes in `apis/edge-api/customer/serverless.yml` and confirm **no new IAM statement is required** — if the deploy asks for one, something has drifted from the plan
- [ ] T053 [P] [US3] Test that closure changes **no Cognito user state** — the user must stay enabled or restore-on-login is impossible (research R4)

### Clients

- [ ] T053a [US3] Build the **Privacy & data screen shell** on both surfaces — US3's control has no host without it. ⚠ Its full contents are US6/Phase 8; only the shell is needed here, and building it in Phase 5 is what lets US3 ship independently of US6
- [ ] T054 [US3] Build the mobile deletion flow under `CM/features/account/presentation/`, showing before any irreversible step: what is deleted, **what is retained and why**, the effect on anything in flight, and the erase date (FR-040)
- [ ] T055 [US3] Render blockers with their name, a **direct route** to the order, and when they clear — never a refusal without a way forward (FR-042, SC-012)
- [ ] T056 [US3] ⚠ Confirm the verification step is completable on a **Google-only account** — a password prompt here is an unresolvable dead end for every federated shopper (FR-043, research R3)
- [ ] T057 [US3] On success: end sessions, return to the signed-out storefront, and confirm refusal on both paths
- [ ] T058 [P] [US3] Mirror the flow on web at `apps/customer-web/app/(account)/account/privacy/`
- [ ] T059 [P] [US3] Add the **public** web deletion route at `apps/customer-web/app/delete-account/page.tsx`, usable by someone who has uninstalled the app, naming Effy, with the request path prominently placed (FR-050, FR-050a). ⚠ Deliberately a top-level path, **not** `/account/delete` — that would split one URL subtree across two route groups with different auth posture, so a guard later added to the `(account)` layout would silently not cover it
- [ ] T060 [US3] ⚠ Add `/delete-account` to `GUEST_PAGES` in `apps/customer-web/scripts/bundle-budget.mjs` **in the same commit** (FR-058c) — the file's own comments record a public route that sat 58.8 KB over budget for two features because it was never listed
- [ ] T061 [P] [US3] Implement guest data deletion (FR-046) — device-local only, clearing `localStorage` on web and `DevicePreferences` on mobile; there is no server record to erase
- [ ] T061a [US3] ⚠ Give a **guest** an actual route to T061 on each surface. As designed it is unreachable on both: the web control sits inside the session-gated `(account)` group, and the mobile Account tab is visible-but-gated behind deferred sign-in (feature 015). Apple's FAQ names guest accounts explicitly, so an unreachable control does not satisfy FR-046
- [ ] T061b [P] [US3] Implement `POST /customer/v1/closure/restore` in `apis/edge-api/customer/src/functions/customer-closure-v1-restore.ts`, and surface it on both clients as a **deliberate confirmation** shown on sign-in during the window — signing in surfaces the choice, it does not silently make it (FR-041a)
- [ ] T062 [P] [US3] Assert **zero** occurrences of "deactivate", "disable", "freeze" and "pause" in shopper-facing deletion copy (SC-009) as an automated check, not a reading

**Checkpoint**: The apps become publishable-shaped — subject to the erasure slice (see T086).

---

## Phase 6: User Story 4 — Manage how I sign in (Priority: P2)

**Goal**: Security renders from the credentials the account actually holds, and hosts both sign-out actions.

**Independent Test**: Sign in by each of the three credential routes and confirm only applicable rows appear.

- [ ] T063 [US4] Create the mobile Security screen in `CM/features/account/presentation/`, composed from the account's actual credentials (FR-025) — never a fixed row list
- [ ] T064 [US4] Show password **or** set-a-password, never both (FR-026), and surface `passwordUpdatedAt`, which mobile does not display today
- [ ] T065 [US4] Show a linked Google identity as the provider's, not as an editable Effy value (FR-027)
- [ ] T066 [US4] Move both sign-out actions onto Security (FR-028), with confirmation on **all devices** only (FR-029)
- [ ] T067 [US4] ⚠ Restyle sign out as **non-destructive** on mobile, settling FR-030 in favour of the web surface's existing position — signing out is trivially reversible, and destructive styling is now reserved for deletion, which is the first genuinely irreversible action this area has ever had
- [ ] T068 [P] [US4] Mirror Security on web at `apps/customer-web/app/(account)/account/security/`, moving the existing `PasswordCard`/`SessionCard` content there
- [ ] T068a [US4] Apply FR-031: security actions expressible as a **single field** use the editor; **multi-step** credential flows (set-first-password's code-then-password, change-password's current-plus-new) stay **full screens** and are not forced into a sheet — which would also violate FR-023
- [ ] T069 [P] [US4] Test all three credential shapes render **zero** inapplicable rows (SC-006)

---

## Phase 7: User Story 5 — Add an address without hunting (Priority: P2)

**Goal**: Full-width bottom button replaces the FAB; editing stays as reachable as adding.

**Independent Test**: With several addresses saved, confirm the FAB is gone, the button does not cover the last row, and a row body opens the same drawer.

- [ ] T070 [US5] Replace the `FloatingActionButton` at `CM/features/addresses/presentation/AddressBookScreen.kt:57-61` with a full-width primary button pinned at the bottom (FR-032)
- [ ] T071 [US5] Ensure the button does not obscure the last list row at any supported text size (FR-033, SC-013)
- [ ] T072 [US5] Replace the raw M3 `Button` in `CM/features/addresses/presentation/AddressFormSheet.kt:74-79` with `EffyPrimaryButton`, fixing an existing inconsistency with the rest of the app
- [ ] T073 [US5] Confirm the default badge does not rely on colour alone (FR-036)
- [ ] T074 [P] [US5] ⚠ Record the amendment in `specs/022-customer-address-book/spec.md` — its **FR-007 mandates the FAB being removed here**, and per Principle I the earlier artifact is corrected, not silently contradicted
- [ ] T075 [P] [US5] Confirm web parity in `apps/customer-web/app/(account)/addresses/` — edit must stay as reachable as add (FR-035), since nudging Add over Edit is measured to make shoppers accumulate stale addresses and mis-address orders

---

## Phase 8: User Story 6 — Privacy & data (Priority: P3)

**Goal**: The host screen for deletion, plus the in-app legal links both stores require.

**Independent Test**: Open Privacy & data, confirm policy and terms are reachable in-app and the deletion control is last.

- [ ] T076 [US6] Create the mobile Privacy & data screen with the deletion control as its **last** item (FR-039)
- [ ] T077 [P] [US6] Add the public legal routes `apps/customer-web/app/legal/privacy/page.tsx` and `apps/customer-web/app/legal/terms/page.tsx` — **shell and route only**; ⚠ content is operator-owned and legally reviewed (FR-052a), and placeholder legal text would defeat SC-010
- [ ] T078 [US6] ⚠ Add both legal routes to `GUEST_PAGES` in `apps/customer-web/scripts/bundle-budget.mjs` in the same commit (FR-058c)
- [ ] T079 [P] [US6] Link both documents from inside both apps (FR-052)
- [ ] T080 [US6] Render the retained-data disclosure from the contract's `RetainedCategoryDTO`, so the screen and the deletion flow cannot drift apart (FR-053)
- [ ] T081 [P] [US6] Add a promotional-consent withdrawal control that **does not disable any app functionality** (FR-054)

---

## Phase 9: Polish & Cross-Cutting

- [ ] T082 [P] Declare and emit the account and deletion events with **no PII beyond the subject id** (FR-059) — ⚠ and verify they actually transmit: PostHog has **never been initialised on `customer-web`**, so `capture()` has been a platform-wide no-op (research R15). Deletion is the one flow where losing the signal is materially bad
- [ ] T083 [P] Verify assistive-technology behaviour on both surfaces: focus enters the editor, background is inert, focus returns to the originating row (FR-056, SC-015)
- [ ] T084 [P] Update the parity register `docs/audiences/customer-capabilities.md` with a §034 section (FR-058, SC-016)
- [ ] T085 ⚠ Measure the guest bundle **before and after** on all six routes plus the three new public ones — headroom was last measured at **2.1–5.5 KB**, and the real risk is a leak into the shared chunk, not the account pages (FR-058a, SC-017)
- [ ] T085a [P] Verify the two "no work today" requirements were checked rather than forgotten: FR-047 (federated revocation is a stated no-op absent Sign in with Apple) and FR-061 (feature 012's initials avatar stands unamended). Record the check; do not leave them looking merely uncovered
- [ ] T086 ⚠ Create `specs/034-customer-account-center/SUBMISSION-BLOCKERS.md` and record the **erasure slice** and the **operator legal content** as unmet blocking dependencies (FR-041, FR-052a, SC-011) — until they land, a shopper is told "permanently deleted after 30 days" and on day 31 still has a row. ⚠ Named as a real file so the requirement is checkable; no such artifact exists in the repo today
- [ ] T087 Run the full machine sweep per [quickstart.md](quickstart.md) §5: `pnpm -r typecheck` (12/12) · `pnpm -r test` · web build · `depcruise` · `mobile-guard` · `check-compose-theme.mjs` **unchanged** (this feature adds no token) · **`go build ./... && go vet ./... && go test ./...` in `apis/core-api`** — ⚠ T013 edits Go and nothing else in this feature compiles it
- [ ] T088 ⚠ Run `:shared:iosSimulatorArm64Test`, not just the iOS **main** compile, and confirm the test count matches Android — feature 033 found the iOS test target had **never compiled** while the Android host suite was green

---

## Phase 10: Operator Walks (cannot be completed by writing code)

- [ ] T089 ⚠ **OPERATOR** Commit the migration, then `make db-up ENV=dev` (the 003 commit-guard), and verify the partial unique index landed
- [ ] T090 ⚠ **OPERATOR** `make edge-deploy SERVICE=customer ENV=dev`
- [ ] T091 ⚠ **OPERATOR** Walk quickstart §4d — **place an order, confirm it blocks, then age it past the window and confirm the block clears**. If it does not, the feature has a permanent dead end and must not ship
- [ ] T092 ⚠ **OPERATOR** Walk quickstart §4e end to end, including on a **Google-only account**, and confirm the **hot path** also refuses a closed customer
- [ ] T093 ⚠ **OPERATOR** Walk quickstart §4a — the dirty-check matrix, all three dismissal routes on mobile and all four on web
- [ ] T093a ⚠ **OPERATOR** Walk SC-002 — show 5 people the account root, ask them to change their name, and count how many tap the identity header within 10 seconds. This is the **only** evidence that FR-002's discoverability bet works; removing the "My details" row is otherwise an untested assumption
- [ ] T094 ⚠ **OPERATOR** Walk the **full §4h matrix**, not just Android: light **and** dark × largest text size × **phone, tablet and desktop** × **iOS, Android and web** (SC-014). Android is called out because it has not been visually checked across features 028, 029 or 033 — each recorded the gap and asked that it not be repeated — but tablet, desktop and large-text are equally unwalked
- [ ] T095 ⚠ **OPERATOR** Supply legally reviewed privacy policy and terms content, and confirm the retained-category list (FR-052a, SC-010)
- [ ] T096 ⚠ **OPERATOR** Declare the web deletion URL in the Play Console Data safety form — Apple does not require it and Google does, which is exactly why it gets skipped
- [ ] T097 ⚠ **OPERATOR** Write the app-review note instructing reviewers to register a throwaway account before testing deletion (FR-051) — **not** a special-cased account in code
- [ ] T098 ⚠ **OPERATOR** Decide the quick-action shortcut treatment on sight (T036) — container-free as built, or filled tiles with the justification recorded
- [ ] T099 ⚠ **OPERATOR** Sign-off against the SC table, then commit

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**: all depend only on Phase 2
- **US4 (Phase 6)**: depends on Phase 2; **soft-depends on US2** (T038 removes sign out from the root, T066 gives it a home — do not ship T038 without T066 or sign out is unreachable)
- **US5 (Phase 7)**, **US6 (Phase 8)**: depend only on Phase 2. ⚠ **US3 needs a Privacy screen to host its control**, which is US6's territory — so **T053a builds the shell inside Phase 5**, and Phase 8's T076 fills it in. Without T053a, US3 cannot ship before US6
- **Polish (Phase 9)** → **Operator (Phase 10)**: last

### The one ordering trap

**T038 and T066 must land together.** T038 removes both sign-out rows from the account root; T066 puts them on Security. Shipping T038 alone leaves a signed-in shopper with **no way to sign out** on mobile.

### Within each story

Backend → contract → mobile → web. Tests alongside the code they pin, not after.

### Parallel Opportunities

- T002 alongside T001
- T006–T008 are one file (`customer.ts`) — **not** parallel with each other; T009/T010 follow
- T015, T016 and T016a all edit `StorefrontKit.kt` — **serialize**. Only T018 (a different file) is
  genuinely parallel with them
- Once Phase 2 closes, **US1, US2, US3, US5 and US6 can proceed in parallel**
- Within US3: T042–T046 (blocker) parallel with T047–T053 (flow) until they meet at T049
- T077, T079, T081 are independent files

---

## Parallel Example: Phase 2 primitives

```bash
# Truly parallel — different files:
Task: "Add single-field editor wrapper in apps/customer-web/components/"        # T018
Task: "Keep customer-sessions-v1-delete.ts ungated for closure"                 # T014

# NOT parallel — T015, T016 and T016a all edit StorefrontKit.kt. Run them in order.
```

⚠ Three primitive tasks share one file. `[P]` was removed from T015/T016 for exactly this reason — a
marker that contradicts a note in the same document will be followed by an agent and cause a conflict.

---

## Implementation Strategy

### MVP (US1 only)

Phase 1 → Phase 2 → Phase 3 → **stop and validate**. This delivers the editing model — the core of the
brief — on both surfaces, and is demonstrable on its own.

### Incremental delivery

1. Setup + Foundational → foundation ready
2. **US1** → the editing model → demo (MVP)
3. **US2 + US4 together** → the restructured account with sign out relocated (see the ordering trap)
4. **US3 + US6** → deletion and its host screen → the apps become publishable-shaped
5. **US5** → the address book affordance

### ⚠ What "done" does not mean here

Completing every task above does **not** make these apps submittable. Two things sit outside this
feature and both are hard blockers: the **erasure slice** (T086) and **operator-supplied legal content**
(T095). Until both land, the deletion disclosure describes behaviour the platform cannot perform.
