# Quickstart: Customer Feedback (046)

Validation guide — how to prove the slice works end to end. Implementation detail lives in `tasks.md`
and the code; this is the run/verify script. Contracts: [feedback-api](contracts/feedback-api.contract.md),
[feedback-email](contracts/feedback-email.contract.md). Data: [data-model.md](data-model.md).

## Prerequisites

- `AWS_PROFILE=ef` for anything touching live AWS (account 724289623101).
- The migration committed, then `make db-up ENV=dev` (003 commit-guard).
- `make edge-deploy SERVICE=customer ENV=dev` and `make edge-deploy SERVICE=admin ENV=dev`.
- SES sender + configuration set already live (037); `email-kit` env keys present in both services'
  `serverless.yml` (verified by the config-contract tests).
- A back-office admin/manager account and a csa account (006/009) for the console walk; a customer
  account and a guest browser session for the storefront walk.

## Machine-verifiable gates (run before any live walk)

```bash
pnpm -r typecheck
pnpm -r test                         # edge-customer + edge-admin feedback suites, email-kit, web
make email-check                     # both new templates: drift/size/text/contrast/no-3p-asset
# edge repos: container-backed repo tests for feedback (submission/reply/note)
# customer-web: bundle budget still green (/feedback within the 174 KB guest gate)
# customer-mobile: :shared:testAndroidHostTest + :shared:iosSimulatorArm64Test + assembleDebug
```

## US1 — a shopper sends feedback and is thanked

1. **Guest, web**: open `/feedback` (and confirm the checkout header's "Give us feedback" link lands
   there — SC-004). Pick a category, type a message, enter an email, submit → success confirmation
   with a `FB-XXXXXX` reference; a `feedback-received` email arrives (SC-001/003).
2. **Signed-in, web**: open `/feedback` → name/email pre-filled from profile; submit → the stored row
   has `customer_id` set and `email_verified=true`.
3. **Mobile**: submit from the app's feedback screen → identical stored submission, `platform='ios'`
   or `'android'` (SC-002).
4. **No message** → refused inline, nothing stored. **No email** → stored + on-screen confirmation, no
   email sent. **Invalid email** → refused inline, typed message preserved.
5. **From checkout** → the stored row records `source='checkout'`.
6. **Rate limit** (SC-010): submit repeatedly from one source past the window → `429 rate_limited`
   with no threshold disclosed.
7. **Inert text** (SC-009): submit `<script>alert(1)</script>` → later shown as literal text in the
   console and in the email.

## US2 — staff read, search, triage

1. Sign in to back office; open **Feedback** in the nav (visible to csa too). List loads newest-first
   with category/status/rating/submitter/preview/time.
2. Search a message word and a submitter email → list narrows (FR-019). Apply category + status +
   rating + date-range filters → count reflects the intersection (FR-020).
3. Open a submission → full message + context (customer vs guest, source, platform, timestamps).
4. Change status (e.g. `in_review` → `resolved`) → persists, reflected in list/filters.
5. Add an internal note → saved with author + time; confirm it appears in **no** email and on **no**
   submitter-facing surface (SC-007).

## US3 — staff reply, submitter emailed

1. As **admin/manager**, open a submission with an email → compose a reply → send → submitter receives
   a `feedback-reply` email containing the staff message + a reference to their original (SC-006); the
   submission becomes `replied`; the reply is listed in its history.
2. Open a submission **without** an email → the reply action is unavailable/disabled with the reason
   shown (FR-028).
3. As **csa**, open any submission → the reply action is not available (D7/FR-033), but reading works.
4. Force a send failure (e.g. SES simulator bounce address) → staff told it was not delivered; the
   submission is **not** marked replied and no reply row exists (FR-030).

## Non-functional checks

- **No PII in logs** (SC-008): grep the submission + reply Lambda logs — no `submitter_email` value
  appears; only operational facts (the newsletter posture).
- **Emails render** in a light and a dark client, both have a plain-text part, neither fetches a
  third-party asset (SC / `make email-check` already proves the last two mechanically).
- **Console responsiveness** (SC-005): with a large seeded set, list + search + filter stay responsive
  (indexed, paginated).

## Operator steps (out-of-code, hand to the user)

1. Commit the migration; `make db-up ENV=dev`.
2. `make edge-deploy SERVICE=customer ENV=dev` and `SERVICE=admin ENV=dev`.
3. Live SC walk (US1–US3 above) across web, mobile, and the console; the send-failure and rate-limit
   negative proofs; the PII-log sweep.
4. ⚠ Note the known carry-forward: PostHog is not yet initialised on customer-web (039), so the web
   `feedback_submitted` event is wired but a no-op until that lands — record, don't hide.
