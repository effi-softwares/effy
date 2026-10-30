---
description: "Task list for 012 - Customer Profile Management"
---

# Tasks: Customer Profile Management

**Input**: Design documents from `/specs/012-customer-profile-management/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/customer-account.contract.md) · [quickstart.md](./quickstart.md)

**Tests**: **Included.** Not because the template offers them, but because two of this slice's success criteria
(**SC-004**, **SC-005**) are *adversarial* - they assert that an attacker holding a valid session **cannot** do
something. A claim like that cannot be signed off by looking at the code; it has to be attacked and survive.

**Organization**: Grouped by user story so each ships and is tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable - different files, no dependency on an incomplete task
- **[Story]**: US1 · US2 · US3 · US4 (from spec.md)
- **🧑‍💻**: **OPERATOR-RUN.** Claude does not run these - live AWS, migrations, deploys (CLAUDE.md).

---

## Phase 0: Spikes (BLOCKING - the design is not trusted until these pass) 🧑‍💻

**⚠️ Nothing in Phase 4 (the password flows) may be built before T001 returns green.**

This slice is designed against **documentation, not evidence**. AWS says the set-first-password call works; our
pool has never been asked. If T001 fails, FR-017's entire mechanism changes and the plan must be revised - that is
cheaper to discover now than after the UI is built on top of it.

- [ ] T001 🧑‍💻 **[SPIKE S1 - blocks Phase 4]** Prove `ChangePassword` with `PreviousPassword` **omitted** works on the dev customer pool for an OTP-only customer. Commands in [quickstart.md](./quickstart.md) § Spike 1. Then confirm **both** sign-in routes still work afterwards (new password **and** emailed code - FR-026/SC-007). Record the result in `research.md` as **R1-VERIFIED** or **R1-REFUTED**. If refuted: **STOP, re-plan FR-017.**
- [ ] T002 🧑‍💻 **[SPIKE S2]** Determine what happens **today** when a never-had-a-password customer uses "Forgot password?" - this path is **live right now** and its behavior is unknown. Commands in [quickstart.md](./quickstart.md) § Spike 2. Decides whether FR-022b's recovery route is buildable as designed. Record as **R6-VERIFIED / R6-REFUTED**.
- [ ] T003 **[SPIKE S4]** Prove `fetchAuthSession({ forceRefresh: true })` inside a **Server Action** rewrites the Amplify cookie, so a name change reaches the header greeting (FR-008). Local only. If it fails, take the R11 fallback (header reads the record) and record the cost. Record as **R11-VERIFIED / R11-FALLBACK**.
- [ ] T004 🧑‍💻 **[SPIKE - Google, non-blocking]** Confirm the customer app client's `AllowedOAuthScopes` will include `aws.cognito.signin.user.admin` when Google is un-parked. Without it, `ChangePassword`/`UpdateUserAttributes`/`GlobalSignOut` **silently fail for the Google cohort only** (research R12). Google is parked, so this does not block - but record the finding against 011's **T052** so it cannot be forgotten on un-parking day.

**Checkpoint**: T001 green → the password design is real, not hoped-for.

---

## Phase 1: Setup (shared contracts & infrastructure)

- [X] T005 [P] Extend `CustomerDTO` with `hasPassword: boolean` and `passwordUpdatedAt: string | null` in `packages/shared-types/src/customer.ts`. Add `SetPasswordDTO`, `ChangePasswordDTO`, `ResetConfirmDTO`, `PasswordChallengeResultDTO` per [contracts](./contracts/customer-account.contract.md). **One definition, both sides** (Principle II).
- [X] T006 [P] Create `packages/edge-shared/src/password/policy.ts` - the length check (**≥ 12**, no composition rules). Pure, dependency-free.
- [X] T007 [P] Create `packages/edge-shared/src/password/breach.ts` - the **k-anonymity** breach check: SHA-1 the password, send only the **first 5 hex chars**, match suffixes locally, send `Add-Padding: true`. **The password never leaves the process.** Uses only `crypto.subtle` + `fetch` so it runs in Node 22 **and** the browser (research R9). **Fails closed** on service error (FR-022a).
- [X] T008 Add the `./password` subpath export to `packages/edge-shared/package.json` and **verify it drags in no Node built-ins or `pg`** - it is imported by the Next.js recovery page. If it cannot be kept clean, fall back to a standalone package and record why (research R9 risk).
- [X] T009 [P] Unit-test the policy + breach modules in `packages/edge-shared/src/password/*.test.ts`: under-length rejected · known-breached password rejected (fixture, not a live call) · **breach-service outage ⇒ rejected (fail-closed)** · the password is never included in any outbound request.

---

## Phase 2: Foundational (BLOCKING - all stories depend on these)

- [X] T010 🧑‍💻 Write migration `db/migrations/20260714__customer_password_state.sql` - add `has_password boolean NOT NULL DEFAULT false` and `password_updated_at timestamptz NULL` to `public.customer`, with the column comments from [data-model.md](./data-model.md) recording that both are **platform-owned** (never written from token data). Forward-only, additive, no backfill, no index.
- [X] T011 Extend `apis/edge-api/customer/src/customer/model.ts` - `CustomerRow` gains both columns; `toDTO()` maps them. `cognito_sub` stays **out** of the DTO.
- [X] T012 Extend `apis/edge-api/customer/src/customer/repo.ts` - read the new columns; add `setPasswordState(cognitoSub, { hasPassword, passwordUpdatedAt })` and `setPasswordStateByEmail(...)` (the recovery route has no `sub` - it is unauthenticated).
- [X] T013 Seed `has_password` on the **creating** upsert only, from the optional `?route=` hint (`GET /customer/v1/me`). Ignored on every later call. Add the comment explaining **why an untrusted hint is safe here** - lying in either direction grants no capability the inbox-holder did not already have ([data-model.md](./data-model.md)). It is a **UX hint, never an authorization input**.
- [X] T014 Extend `apps/customer-web/lib/dal.ts` - `getSession()` must also surface the **access token** (`session.tokens.accessToken`), not just the ID token.
- [X] T015 Extend `apps/customer-web/lib/api/edge.ts` and `@effy/api-client` so a privileged call can carry the access token on the `X-Effy-Access-Token` header alongside the `Authorization: Bearer <idToken>` the gateway authorizes.
- [X] T016 **[SECURITY - non-negotiable]** Create `apis/edge-api/customer/src/password/identity.ts`: resolve the caller's `sub` from the **gateway-verified** authorizer claims, decode the access token, and **reject with 401 if the two `sub`s differ** (research R12). Without this, a victim's ID token paired with an attacker's access token corrupts the victim's record. Unit-test the mismatch refusal.
- [X] T017 Create `apis/edge-api/customer/src/password/cognito.ts` - thin, token-authorized wrappers: `getEmailVerificationCode`, `verifyEmailCode`, `changePassword` (with **and without** `PreviousPassword`), `globalSignOut`, `updateUserAttributes`, `confirmForgotPassword`. **No new IAM** - these are authorized by the customer's token, not by the Lambda's role (research R4).
- [X] T018 [P] Create `apis/edge-api/customer/src/password/notify.ts` - the post-change notification (FR-025). **MUST contain no reset link** (a link there is itself a phishing primitive) - only a route to contact support.
- [X] T019 Add `ses:SendEmail` to the customer service IAM in `apis/edge-api/customer/serverless.yml`. **This is the only new permission in the entire slice** - say so in the comment, next to the existing note explaining why the Cognito calls need none.

**Checkpoint**: contracts, data, identity guard, and the Cognito surface exist. Stories can proceed.

---

## Phase 3: User Story 1 - See who I am (P1) 🎯 MVP

**Goal**: A signed-in customer opens `/account` and sees, with no interaction, exactly who Effy thinks they are: name, email, initials avatar.

**Independent test**: Sign in as a customer **with** a name → see name, email, "JM" avatar. Sign in as one with **no** name (an OTP signup that never gave one) → the page is still correct and complete, with a neutral glyph, not a blank circle.

- [X] T020 [P] [US1] Create `apps/customer-web/lib/initials.ts` - at most **two** initials; a one-word name yields **one**, never two letters from one word; leading **grapheme** via `Intl.Segmenter` (**not** `str[0]`, which splits surrogate pairs); `toLocaleUpperCase()`; **neutral fallback** for empty / non-letter / emoji / non-Latin (research R10). **Never guess a letter from the email.**
- [X] T021 [P] [US1] Unit-test `lib/initials.test.ts` against the names that actually break this: `"Janith Madarasinghe"` → JM · `"Cher"` → C · `""` → fallback · `"李"` → fallback · `"👨‍👩‍👧 Smith"` → fallback (**not** half an emoji) · Turkish `"ırmak"` → İ, not I · a combining-mark name. This is SC-010.
- [X] T022 [US1] Create `apps/customer-web/components/Avatar.tsx` on `@effy/design-system/ui`'s existing `avatar` primitive. **One** brand-token colour pair for everyone - no hashed palette (a customer only ever sees their own avatar; per-user hues buy nothing and cost contrast). A11y: `aria-hidden` beside a visible name; `role="img"` + `aria-label="<name>"` standalone, and **never** the word "avatar" in the label.
- [X] T023 [US1] Create `apps/customer-web/app/(account)/account/IdentityStrip.tsx` - server component: avatar + name + email, read from the **platform record** (never the token's claims).
- [X] T024 [US1] Rebuild `apps/customer-web/app/(account)/account/page.tsx` as the sectioned-card layout: identity strip → Profile → Password → Sessions. Every personalized read stays **inside a `<Suspense>` boundary** (`cacheComponents` makes a request-time read outside one a **build error**). Keep `robots: noindex` (FR-036).
- [X] T025 [US1] Empty-name state: the page invites the customer to add their name, and presents having none as **normal** - never an error or an incomplete profile.
- [X] T026 [P] [US1] E2E `apps/customer-web/e2e/account.spec.ts`: signed-out visitor → redirected to sign-in and **returned to `/account`** afterwards; **barred** customer → refused while holding a valid credential (SC-009).

**Checkpoint**: US1 ships alone and already answers the commonest account-page question - *"am I in the right account?"*

---

## Phase 4: User Story 3 - Change or set my password (P1) ⚠️ THE CORE

**Goal**: Two customers, two journeys, one control that knows which is which - and a first password that **cannot** be set from a bare session.

**⚠️ BLOCKED ON T001.** Do not start until the spike is green.

**Independent test**: Run it twice - a password customer and an OTP-only customer. Each is offered the correct journey, neither can reach the other's, and the OTP customer **cannot** set a password without a fresh emailed code.

### Backend - the security core

- [X] T027 [US3] Create `apis/edge-api/customer/src/password/service.ts` - the decisions: mode gating (`set` requires `has_password = false`; `change` requires `true`; the wrong mode is a **409**, FR-014), policy + breach check **before Cognito is touched**, and the barred refusal (FR-034).
- [X] T028 [US3] `POST /customer/v1/password/challenge` in `apis/edge-api/customer/src/functions/customer-password-v1-challenge.ts` - sends the step-up code. **It grants nothing**; it only puts a code in the inbox. Returns a **masked** destination (`j•••@example.com`) - never the full address, never the code. `409` if the account already has a password.
- [X] T029 [US3] `PUT /customer/v1/password` in `apis/edge-api/customer/src/functions/customer-password-v1-put.ts`, `mode: "set"` - **the atomic sequence, and the order is load-bearing**: policy+breach → `VerifyUserAttribute` (**consumes the code, proves the inbox**) → `ChangePassword` **with `PreviousPassword` omitted** → `GlobalSignOut` → `has_password = true` → notify. A session that cannot produce a valid code **never reaches the password write**. **There is no stored grant** - FR-019 is satisfied by construction (research R1).
- [X] T030 [US3] Same route, `mode: "change"` - policy+breach → `ChangePassword` **with** `PreviousPassword` (Cognito verifies the current password itself) → `GlobalSignOut` → `password_updated_at` → notify. A wrong current password is a **401 that names the field** (FR-016/FR-027).
- [X] T031 [US3] Map every Cognito error to something a shopper can **act on** (`CodeMismatch`/`ExpiredCode` → 400; `NotAuthorized` on change → 401; `LimitExceeded` → 429). Never surface a raw exception to a member of the public.
- [X] T032 [US3] **Log discipline**: structured logs on every path, and **never** the password, the code, or either token (FR-039 / SC-013).
- [X] T033 [P] [US3] Unit-test `apis/edge-api/customer/src/password/service.test.ts`: wrong-mode → 409 (**both directions**) · under-length → 400 · breached → 400 · **breach-service outage → 400 (fail-closed)** · barred → 403 · bad code → 400 · wrong current password → 401 · **`sub` mismatch → 401** (T016).

### Recovery - closing the bypass (FR-022b)

- [X] T034 [US3] `POST /customer/v1/password/reset-confirm` in `apis/edge-api/customer/src/functions/customer-password-reset-confirm.ts` - **PUBLIC, no authorizer** (the caller has no session; that is the point of recovery). Policy+breach → `ConfirmForgotPassword` → `has_password = true` (by email) → notify. **MUST NOT** disclose whether an email is registered (the pool runs `prevent_user_existence_errors`; do not undo it here).
- [X] T035 [US3] Wire `apps/customer-web/app/(auth)/reset-password/` through this route instead of calling Amplify's `confirmResetPassword` directly. **Two defects, one fix**: it closes the breach-screening bypass, and it stops recovery from leaving `has_password` **permanently wrong** (research R6).

### Frontend

- [X] T036 [US3] Password Server Actions in `apps/customer-web/app/(account)/account/actions.ts` - re-verify the session **in the action** (a Server Action **is** a public endpoint), derive identity from the token, **never** from the body (FR-035).
- [X] T037 [US3] `PasswordCard.tsx` - branches on **`hasPassword`**, never on "how did you sign in" (a Google-**linked** customer is a native user and **can** hold a password - research R5). Shows "Last changed …" or, for the OTP customer, presents having no password as a **legitimate, complete state** with an optional convenience on offer. **No nag, no warning, no incomplete-profile badge** (FR-015).
- [X] T038 [US3] `SetPasswordDialog.tsx` - request code → then **one** submit carrying code + new password. Single password field: **paste allowed**, reveal toggle, `autocomplete="new-password"`, and **no confirm-password field** (GOV.UK removed theirs once they shipped the reveal toggle - a second field helps nobody).
- [X] T039 [US3] `ChangePasswordDialog.tsx` - current + new password, `autocomplete="current-password"` / `"new-password"`, same rules.
- [X] T040 [US3] On success: the storefront **clears the Amplify cookies and routes to sign-in** with a plain message - *"Password updated. We signed you out on every device. Sign in with your new password."* (FR-024, amended). This is not a downgrade; it is the only thing Cognito can actually do, and it proves the new password immediately.
- [X] T041 [US3] Errors render **in the form**, next to what went wrong, `role="alert"`, focus moved to the failure - **never** a toast that evaporates (FR-027).
- [X] T042 [P] [US3] **E2E - SC-004, the adversarial proof.** A valid session **without inbox access** attempts to set a first password: guessed code, absent code, expired code, already-used code, and a **sign-in OTP replayed as the step-up code** - **every one refused**. Plus the bypasses: wrong mode → 409 both ways; victim ID token + attacker access token → 401. **This test is the feature.**
- [X] T043 [P] [US3] **E2E - SC-005**: a valid session with the **wrong current password** cannot change it.

**Checkpoint**: the account-takeover primitive is closed, and proven closed by a test that tries to use it.

---

## Phase 5: User Story 2 - Change my name (P2)

**Goal**: The name changes, and it changes **everywhere the platform greets them** - not just where they typed it.

**Independent test**: Change the name, then browse to the storefront: the **header greeting** shows the new name **without** signing out and back in.

- [X] T044 [US2] Extend `updateProfile` in `apps/customer-web/app/(account)/account/actions.ts` - write the record **and** the Cognito attributes (`given_name`/`family_name`, token-authorized), then `fetchAuthSession({ forceRefresh: true })` to rewrite the ID-token cookie, then `revalidatePath("/")`. **Why**: the header greeting reads `given_name` from the **token**, not the record - a name changed only in the database would not appear there for up to **60 minutes** (research R11). Per **T003**, take the fallback if the forced refresh does not persist.
- [X] T045 [US2] Backend: `PATCH /customer/v1/me` also calls `UpdateUserAttributes` so the record and the claims cannot drift (FR-012).
- [X] T046 [US2] Rework `ProfileForm.tsx`: **dirty-guard** (Save inert until something actually changed - FR-011), inline confirmation at the point of action, **no optimistic update** (this is a server-validated write against a record that also gates the barred refusal; a flash-then-revert is worse than 300 ms of a pending button), typed input **preserved** on failure (FR-010).
- [X] T047 [US2] Enforce the name-length limit **at the platform**, not only in the page (FR-009).
- [X] T048 [P] [US2] E2E: change name → persists across reload **and** appears in the header greeting without re-authenticating (SC-002) · empty name accepted, avatar falls back · failed save keeps the typed input.

---

## Phase 6: User Story 4 - Sign out (P2)

**Goal**: End the session deliberately, from anywhere - the thing the storefront cannot do at all today.

**Independent test**: Sign out → session gone (reload and Back do **not** restore it) → other tabs stop showing the customer as signed in.

- [X] T049 [US4] Sign-out Server Action in `apps/customer-web/app/(account)/account/actions.ts`: call Cognito `GlobalSignOut`/`RevokeToken`, then **delete every `CognitoIdentityServiceProvider.<clientId>.*` cookie** from the jar, then redirect to a **public** page. **Server-side, because `aws-amplify/auth/server` has no `signOut`** - and the client one would put the auth SDK in the shared chunk and break the quarantine (research R3). Guests keep downloading **zero** bytes of auth SDK.
- [X] T050 [US4] `DELETE /customer/v1/sessions` in `apis/edge-api/customer/src/functions/customer-sessions-v1-delete.ts` - "sign out on all devices" (FR-032). `GlobalSignOut`, token-authorized, no IAM.
- [X] T051 [US4] `SessionCard.tsx` - **Sign out** and, as a distinct deliberate action, **Sign out on all devices**. Neither styled as destructive (red is reserved for account deletion, which this slice does not have).
- [X] T052 [US4] Add sign-out to `components/header/UserIsland.tsx` so it is reachable from **every page** (FR-028), not just the account page.
- [X] T053 [US4] Post-sign-out: land on a public page, header shows a guest, say so plainly. The destination **MUST NOT** come from an untrusted parameter - the storefront's existing open-redirect refusals apply here unchanged (FR-031).
- [X] T054 [US4] Cross-tab (FR-030): a minimal `BroadcastChannel` listener inside the **authenticated** island so a second tab stops presenting the customer as signed in. **No Amplify.** Keep it tiny and re-measure the guest budget after adding it.
- [X] T055 [P] [US4] E2E: sign out → reload does not restore the session · **Back button** does not restore it and serves no personalized content from cache (FR-029) · a second tab drops the signed-in state · a signed-out customer can still do everything a guest could (FR-033).

---

## Phase 7: Infrastructure 🧑‍💻

- [X] T056 Change the customer pool's password policy in `infra/envs/dev/auth-customer.tf`: `minimum_length 8 → 12`; `require_lowercase` / `require_uppercase` / `require_numbers` → **false**. Comment **why** this is a loosening *toward* current NIST guidance (composition rules are now considered harmful) and that the strength it gives up is picked up for real by the breach screening the pool cannot do (research R8).
- [X] T057 Fix the now-false error string in `apps/customer-web/app/(auth)/_lib/auth-actions.ts` - it currently promises *"at least 8 characters with upper and lower case letters and a number"*, which becomes a **lie** the moment T056 applies. Same commit.
- [X] T058 [P] Apply the ≥12 rule to the **sign-up** form too, so every path that establishes a password agrees (FR-022b).
- [ ] T059 🧑‍💻 `make plan ENV=dev` → **READ IT** → `make apply ENV=dev`. **⚠ If the customer pool shows `-/+` or "must be replaced", ABORT** - a replaced pool destroys every account on the platform (every customer, the 006 first admin, the 009 shop users). `password_policy` is an in-place update; a replacement means something else changed.
- [ ] T060 🧑‍💻 Commit the migration (the 003 commit-guard requires it), then `make db-status ENV=dev` → `make db-up ENV=dev`.
- [ ] T061 🧑‍💻 `make edge-deploy SERVICE=customer ENV=dev`.
- [ ] T062 🧑‍💻 **Verify SES actually sends** (`make mail-verify ENV=dev`). **⚠ Hard dependency on 010, whose SES operator steps are still open. Until mail sends, `mode: "set"` does not work at all** - the customer never receives the code - and the change-notification (the one control that catches a *successful* silent takeover) silently never arrives.

---

## Phase 8: Polish & cross-cutting

- [X] T063 [P] A11y sweep (FR-038 / SC-012): keyboard-only completion of every flow · errors announced and associated with their field · focus moved to the failure · pending states **named**, not just spun · contrast in **both** light and dark. WCAG 2.2 **3.3.8** in particular - do not block paste, do not block password managers.
- [X] T064 [P] PostHog events for the account journeys, keyed on the auth subject id **only**. No PII, no credentials.
- [X] T065 **Secret/PII sweep** - assert no password, code, or token reaches any log, telemetry event, or analytics payload (SC-013). By sweep, not by inspection.
- [X] T066 `pnpm --filter @effy/customer-web size` - the **160 KB guest budget** must still pass (SC-011). A guest who never signs in must download **no more** than before this slice.
- [X] T067 `pnpm --filter @effy/customer-web depcruise` - the **Amplify quarantine** must still pass. Then **break it on purpose**: import `aws-amplify` into a component the account page uses, confirm `depcruise` **fails**, revert. *Break a guard the way it will actually break* - 011's D11 lesson, learned when a direct-import rule reported clean while Amplify was live on the home page.
- [X] T068 Full workspace green: `pnpm typecheck` · `pnpm -r test` · `turbo build` · `terraform validate` + `fmt`.
- [ ] T069 🧑‍💻 **Live SC sign-off** (SC-001 … SC-014) per [quickstart.md](./quickstart.md) § The proofs that matter. **Measure and record** the SC-006 residual revocation window - a revoked session's token still opens the API until it **expires** (up to **60 min**). FR-024a demands the number be *stated*, and a product claiming "signed out everywhere, instantly" while a token works for another hour is lying to its customers.
- [ ] T070 **Correct `docs/audiences/customer-capabilities.md`** (SC-014). **Row 10 currently claims sign-out is delivered (✅) on `customer-web`. It was never built.** This slice makes the claim true - the register must stop asserting it before it is. Then add rows for: initials avatar · name edit · set password · change password · sign out · sign out everywhere - each with its **mobile** cell **stated** (outstanding, by design), never left blank. *A parity register that overstates is worse than none: it is a lie the team trusts.*

---

## Dependencies

```
Phase 0 (SPIKES) ──► T001 BLOCKS Phase 4 (the entire password story)
                     T002 informs T034/T035 (recovery)
                     T003 decides T044's mechanism

Phase 1 (Setup) ──► Phase 2 (Foundational) ──► ALL user stories

Phase 3 (US1) ──┐
Phase 4 (US3) ──┤   US3 needs T016 (the sub-match guard) + T017 (Cognito wrappers)
Phase 5 (US2) ──┼─► independent of each other once Phase 2 lands
Phase 6 (US4) ──┘

Phase 7 (Infra) - T056/T057/T058 land together (T056 makes T057's text false)
Phase 8 (Polish) - last
```

**Story independence**: US1, US2 and US4 are genuinely independent - any one can ship alone. **US3 is the only one with a hard external gate** (T001), and it is deliberately the one that matters most.

---

## Parallel opportunities

- **Phase 1**: T005 · T006 · T007 · T009 - four different files, no shared state.
- **Phase 3**: T020 + T021 (initials, pure) run alongside T026 (E2E scaffolding).
- **Phase 4**: T033 (unit) ∥ T042 + T043 (the adversarial E2E) - different files.
- **Across stories** once Phase 2 lands: US1, US2 and US4 can be built by three people at once. US3 should not be split - its steps are one security argument and the ordering *is* the safety.

---

## MVP scope

**US1 alone** (Phase 0 spikes → Phase 1 → Phase 2 → Phase 3, T001–T026) is a shippable increment: a customer can see exactly who Effy thinks they are.

But the **honest MVP is US1 + US3**. US3 is the reason this slice exists - it is the one that closes the account-takeover primitive, and it is the only part that can lose a customer their account if built the obvious way. US2 and US4 are valuable and easy; they are not why we are here.

**Total: 70 tasks** - US1: 7 · US3: 17 · US2: 5 · US4: 7 · spikes: 4 · setup/foundational: 15 · infra: 7 · polish: 8.

---

## Implementation notes - where reality differed from the plan (2026-07-14)

Recorded rather than quietly absorbed. Each of these changed *how* a task was done, and each was a
correction the build forced.

### T006–T008 - the breach check is **backend-only** (research **R9 CORRECTED**)

The plan put the policy check *and* the breach check in one shared module imported by both the Lambda
and the browser. That was wrong twice over:

- **The browser never needed it.** T035 routes recovery *through the backend* precisely so the screening
  cannot be bypassed - which leaves the Lambda as the only consumer.
- **`@effy/edge-shared` lives at `apis/edge-api/shared` and depends on `pg` and `pino`.** Importing it
  from Next.js would have coupled the public storefront to the cold path's database library.

**As built**: the **length rule** (`PASSWORD_MIN_LENGTH` + `checkPasswordPolicy`) is in
`@effy/shared-types` - one definition, shared with the browser for instant feedback. The **breach check**
is in `@effy/edge-shared` and **never ships to a browser**. Strictly safer: a check that runs only on the
server *cannot be skipped by a hostile client*. Principle II holds - each rule still has exactly one
definition; they simply live where they are enforced.

### T049–T054 - sign-out is a **route handler + plain HTML form**, not a Server Action (research **R3**)

The plan had the header call a `signOut` Server Action. **The quarantine gate caught it.** Importing the
action gave `components/header/` a module path to `lib/dal.ts` → `aws-amplify`. Next would have erased it
at the `"use server"` boundary and not actually shipped the SDK - but `depcruise` (correctly) refuses to
reason about that, and its `reachable: true` rule fired. **The guard was right and the plan was wrong.**

**As built**: `POST /sign-out` (`app/(auth)/sign-out/route.ts`), reached by
`<form action="/sign-out" method="post">`. A form posts to a **URL**, not an import, so no module edge
exists. The header's `AccountMenu` became a **server component** using `<details>` for the disclosure.

**Consequences, all good**: sign-out costs **zero** client JS and works with JavaScript disabled; and the
guest bundle *fell* from **159.6 KB → 149.9 KB** - the correct architecture was also ~10 KB cheaper. The
budget headroom went from 0.4 KB to 10 KB.

**T054 (FR-030, cross-tab)** could then no longer use `BroadcastChannel` - there is no JS in the
signing-out tab to broadcast *with*. Replaced by `components/header/AuthSync.tsx`: the **stale** tab
re-checks on `visibilitychange` / `pageshow` (i.e. the moment the customer looks at it) and refreshes to a
guest header. Mounted for signed-in customers only; **0.2 KB**; imports nothing but React and the router.

### T042–T043 - the adversarial proofs are **unit + live**, not Playwright

The first draft of `e2e/account.spec.ts` fired crafted requests at `PUT /api/customer/v1/password` and
asserted "not 200". **There is no such route in the app** - the password API is the external edge-api
gateway, reached from Server Actions. Every request hit Next's **404**, every assertion passed, and the
file would have certified the account-takeover primitive as closed **while testing nothing at all.**

**As built**: SC-004 / SC-005 are proven in `apis/edge-api/customer/src/password/service.test.ts` (code
verified *before* the password is written; nothing written when the code is refused; each mode refused on
the wrong account state) and `identity.test.ts` (the mismatched-token attack). They are then proven
**live and adversarially** in [quickstart.md](./quickstart.md) § "The proofs that matter" - an operator
step, because it needs a real inbox and a real Cognito user. Playwright asserts only what a browser can
honestly reach.

*A green test that cannot fail is worse than no test: it is a false statement with a tick next to it.*
