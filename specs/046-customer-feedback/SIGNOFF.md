# Sign-off: 046-customer-feedback

**Status**: ✅ **CONCLUDED (PARTIAL BY DESIGN) — 2026-08-17.** Code-complete + fully machine-verified
across all six surfaces. Concluding closes the slice's build work; it does not make the open operator
items done — the deploy, the live SC walk, the on-device mobile walk, and the commit remain, and are
exactly the steps only the operator runs (migrations, `edge-deploy`, live AWS).

## What was built

The checkout header's "Give us feedback" link is now real, end to end.

- **Data** — one forward-only migration `20260816221653_customer_feedback.sql`: `public.feedback_submission`
  (immutable context + mutable status), `public.feedback_reply` (append-only, one row per successful
  send), `public.feedback_note` (staff-only). `pg_trgm` + `citext`; no cross-schema FK to `admin.staff`.
- **Shared** — `@effy/shared-types/feedback.ts`: category/status/source/platform unions, label maps,
  the length constants (message/reply 5000, note 2000 — one source for the DB CHECK, services, form,
  mobile), submit + admin DTOs.
- **Email** — two `@effy/email-kit` templates with OPPOSITE failure policies: `feedback-received`
  (swallow — the submission is already stored, FR-015) and `feedback-reply` (throw — a submission is
  never falsely marked replied, FR-030). MJML + text + fixtures + generated artifacts; `make email-check`
  green; a render test proves inert-text (FR-017) and whitelisted-vars-only (FR-038/G2).
- **Public submit** (US1) — `edge-api/customer/src/feedback/` (lib · repo · service) + two handlers:
  authenticated `/customer/v1/feedback` (links the verified sub, trusted email) and public
  `/customer/v1/feedback/public` (guest, unverified email, IP-keyed rate limit). Atomic rate-limited
  insert (count-inside-the-insert). Thank-you email on a stored submission.
- **Console** (US2/US3) — `edge-api/admin/src/feedback/` (types · authz · repository · service ·
  handler-support) + 5 handlers: list/search/filter, detail, status, notes (any active staff incl.
  csa), reply (admin/manager only; email first, write only on success). RBAC from `admin.staff`.
- **Storefront** — `/feedback` (PPR: static shell + Suspense form island; guest-first; session prefill;
  163.1 KB / 174 gate; registered in the bundle-budget list). Checkout header link carries
  `?from=checkout`; footer "Give feedback" link.
- **Back-office UI** — `features/feedback/` (list with combinable filters + detail with context,
  status control, internal notes, reply composer) + route + nav entry (no `requiredRole`, csa-visible).
- **Mobile** — `customer-mobile/features/feedback/` (Clean Arch + MVVM): domain + `HttpFeedbackRepository`
  (edge, route by session) + `FeedbackViewModel` + `FeedbackScreen`; reached from Account → "Give
  feedback"; `platformTag()` expect/actual. `feedback_submitted` telemetry declared (web dynamic-import
  wired; mobile deferred per D9).

## Machine-verified

- `pnpm -r typecheck` — 14/14.
- `pnpm -r test` — edge-customer **160** (+23 skipped container), edge-admin **161** (+5 skipped),
  customer-web **366**, back-office **79**, shop-web 139, web-kit 48, email-kit **61**.
- `make email-check` — 10 templates (drift/size/text/contrast·light·dark·invert/no-3p-asset).
- customer-mobile — `:shared:testAndroidHostTest` **265** (incl. 5 new FeedbackViewModel tests) ·
  `:shared:compileKotlinIosSimulatorArm64` · `:shared:compileTestKotlinIosSimulatorArm64` — all compile.
- `cm-guard` · `cm-tokens-check` (8 files) · `mobile-assets:check` — clean.
- customer-web `build` + bundle-budget — `/feedback` 163.1 KB / 174, all guest routes within budget.
- Config-contract tests (edge-customer + edge-admin) read the real `serverless.yml` and pin env +
  route wiring (the 035/038 guard).

## ⚠ Open (operator / device — NOT done)

1. **Commit** the slice (spec + plan + tasks + code). Per project convention the operator commits.
2. `make db-up ENV=dev` (the migration — commit-guarded by 003).
3. `make edge-deploy SERVICE=customer ENV=dev` **and** `SERVICE=admin ENV=dev`.
4. **Live SC walk** ([quickstart.md](quickstart.md)): US1–US3 across web, mobile, console;
   SC-001/003 (submit + thank-you), SC-004 (the checkout link resolves), SC-005 (responsive
   search/filter at volume), SC-006 (reply on success), SC-007 (notes never leak), SC-008 (no PII in
   logs), SC-009 (inert text, adversarial), SC-010 (rate-limit refusal).
5. **On-device mobile walk** — the screen has been compiled on Android + iOS but not run on a device.
6. Optional: set `/effy/dev/feedback/source_salt` (empty default is fine).
7. The reply send-failure **metric filter / alarm** (Prometheus/CloudWatch) is deferred like 038's
   telemetry — the service already logs `feedback.reply_send_failed` and `feedback.replied`.

## Notes / carry-forwards

- **Async hard-bounce** on a reply is out of scope (G1): only synchronous send failure is caught;
  `feedback_reply.delivery_ok` is a hook for a later reconciliation against the 037 deliverability path.
- **PostHog is not initialised on customer-web** (039), so `feedback_submitted` is wired but a no-op
  until that lands.
- **Immutability of context columns** is enforced by repository discipline (no UPDATE path), not a
  trigger (C1) — a `BEFORE UPDATE` guard is the escalation if it must be mechanical.
- A pre-existing drift was corrected in passing: `ScreenInventoryTest` asserted **30** customer routes
  while `ALL_CUSTOMER_ROUTES` already held 32 (a 045-era omission); it is now **33** with Feedback.
