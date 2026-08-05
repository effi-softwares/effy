# Store Submission Blockers — 034 Customer Account Centre

**Status**: 🔴 **DO NOT SUBMIT TO THE APP STORE OR GOOGLE PLAY**

This file exists because feature 034 builds the *half* of account deletion that a store reviewer can
see, and deliberately does not build the half that makes its promise true. Both must land before
either mobile app is submitted. Referenced by spec FR-041 / FR-052a and SC-011.

---

## 🔴 BLOCKER 1 — Permanent erasure is not built

**What ships in 034**: a customer can request deletion in-app, prove control with a freshly emailed
code, and have their account closed immediately. Every session ends, and both the cold path
(`edge-api/customer`) and the hot path (`core-api`'s `customeridentity`) refuse them thereafter.

**What does NOT ship**: the scheduled job that permanently erases the record at `erase_after`.

**Why that blocks submission, specifically**: the pre-deletion disclosure tells the customer *"your
data will be permanently deleted after 30 days"* (FR-040), and **SC-010 requires every claim in that
disclosure to be true of the built system**. Today, on day 31, the row is still there. That is not a
missing nicety — it is the platform making a promise it cannot keep, to a person exercising a data
right, in a screen written to satisfy a store policy.

**What is needed**: a scheduled worker selecting on
`public.customer_closure_request.erase_after WHERE cancelled_at IS NULL`, deleting the customer row
(cascading the closure request) and calling Cognito `AdminDeleteUser`.

⚠ **That last call needs a NEW IAM statement** on the customer pool — `apis/edge-api/customer/serverless.yml`
currently grants only `ListUsers` / `AdminCreateUser` / `AdminLinkProviderForUser`. Nothing in 034
required new IAM; the erasure slice is the first thing that does.

⚠ **And a deletion index / restore-safety story is needed too.** The EDPB's 2025 coordinated
enforcement action on the right to erasure (report adopted February 2026, 9 DPAs opening formal
enforcement) found **backup erasure to be the single widest area of non-compliance**, with controllers
lacking any process to stop deleted data being resurrected when a backup is restored. A `DELETE` alone
is not erasure if the next restore brings the row back.

---

## 🔴 BLOCKER 2 — There is no privacy policy and no terms of service

**What ships in 034**: nothing yet — the routes are specified (FR-052, FR-052a) but the pages are not
built, and **the content is not Claude's to write**.

**Why it blocks**: an in-app privacy policy link is required by **both** stores — Apple 5.1.1(i)
demands one *"within the app in an easily accessible manner"*, and Google requires a privacy policy
link or text *in the app itself* backed by an active, publicly accessible, non-geofenced URL.

**Why placeholder text would be worse than nothing**: FR-045 requires the retained-data disclosure to
be accurate, and Apple has demonstrably demanded that developers **cite the specific law** behind a
retention claim. Generated legal text would put an unverified claim in front of a reviewer and a
customer at the same time.

**Operator action**: supply legally reviewed privacy policy and terms content, and confirm the
retained-category list currently hardcoded in `apis/edge-api/customer/src/closure/service.ts`
(`RETAINED`) — completed orders, payment records, fraud signals.

---

## 🟡 BLOCKER 3 — The Google-required web deletion route is not built

Google Play requires deletion to be initiable **outside** the app as well as inside it — a public URL,
declared in the Play Console **Data safety** form, usable by someone who has uninstalled the app.
Apple does not require this, which is exactly why it gets skipped; a missing or invalid deletion link
is the most-reported Play rejection in this area.

**Needed**: `apps/customer-web/app/delete-account/page.tsx` (FR-050), added to `GUEST_PAGES` in
`apps/customer-web/scripts/bundle-budget.mjs` **in the same commit** (FR-058c), then declared in Play
Console.

---

## 🟡 BLOCKER 4 — The reviewer will delete the demo account

A documented, repeatedly reported trap: the reviewer tests deletion using the demo credentials from
App Store Connect, the account is destroyed, and the **next** submission is rejected as a login bug.

**Needed**: review notes instructing the reviewer to register a throwaway account before testing
deletion (FR-051). ⚠ **Not** a special-cased account in code — that would be an authorization carve-out
of exactly the kind this platform's own doctrine rejects, and it would be a second, weaker path
through the deletion gate.

---

## Verified and NOT blocking

- **No new IAM was required by 034.** Every Cognito call in the closure flow
  (`GetUserAttributeVerificationCode`, `VerifyUserAttribute`, `GlobalSignOut`) is token-authorized.
- **The closure gate holds on both paths** — cold (`customer/service.ts`) and hot
  (`customeridentity.go`), the latter covered by a container-backed Go test.
- **Federated revocation (FR-047) is a genuine no-op today**: the obligation attaches to Sign in with
  Apple, which this platform does not offer. It becomes real work the day it does.
