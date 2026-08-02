# Quickstart: Customer Account Centre

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) ·
**Contract**: [contracts/account-center.contract.md](contracts/account-center.contract.md)

How to bring the feature up and prove it does what the spec claims. Operator-run steps are marked
**⚠ OPERATOR** — per `CLAUDE.md`, migrations, deploys and anything touching live AWS are run by hand.

---

## 0. Prerequisites

- The `dev` environment applied, with the customer pool and the shared HTTP gateway live.
- A customer account you can receive email for (the verification code goes to the account's email).
- `pnpm install` clean at the repo root.

---

## 1. Database

```bash
make db-status ENV=dev          # confirm where you are before changing anything
```

**⚠ OPERATOR** — the migration must be **committed first** (the 003 commit-guard), then:

```bash
make db-up ENV=dev
```

Verify the shape landed, rather than assuming it did:

```sql
\d public.customer                      -- expect: phone, closure_state
\d public.customer_closure_request      -- expect: the partial unique index
SELECT indexdef FROM pg_indexes
 WHERE tablename = 'customer_closure_request';
-- expect a UNIQUE index with: WHERE (cancelled_at IS NULL)
```

---

## 2. Backend

**⚠ OPERATOR**:

```bash
make edge-deploy SERVICE=customer ENV=dev
```

No Terraform, no new AWS resource and **no new IAM** — every Cognito call in this feature is
token-authorized (research R3). If a deploy asks for new permissions, something has drifted from the
plan; stop and reconcile.

Smoke the contract:

```bash
TOKEN=…   # a customer access token

curl -s -H "Authorization: Bearer $TOKEN" "$API/customer/v1/me"        | jq '{phone, closureState}'
curl -s -H "Authorization: Bearer $TOKEN" "$API/customer/v1/closure"   | jq
```

Expect `closureState: "open"`, and a `closure` payload whose `blockers` is `[]` for an account with no
recent orders.

---

## 3. Clients

```bash
pnpm --filter @effy/customer-web dev      # :3000
```

Mobile: open `apps/customer-mobile` in Android Studio / Xcode and run, per the existing app runbooks.

---

## 4. Proving the spec — the walks that matter

Machine checks are in §5. These are the things **only a person on a device can settle**, and each maps
to a success criterion.

### 4a. The editing model (US1 · SC-001 · SC-003)

1. Open Account. **Tap your own name.** Personal details opens — there is no "My details" row (FR-003).
2. Confirm the screen shows **label + value + chevron rows and no input fields** (FR-011).
3. Tap **Name**. The sheet opens **already focused with the keyboard up** (FR-013).
4. **⚠ The one that is easy to get wrong** — change the value, then try to dismiss **three ways**: swipe
   down, tap outside, system back. **Each must ask before discarding** (FR-018).
5. Reopen, change **nothing**, dismiss the same three ways. **None may prompt** (FR-019).
6. Repeat all of 4–5 on web, where the three routes are the close control, `Esc`, and a backdrop click,
   plus browser back.
7. Tap **Email**. It must **explain that it cannot be changed** — not silently do nothing (FR-022).

### 4b. The account root (US2 · SC-004 · SC-005)

- No sign-out control anywhere on the root (FR-007).
- Saved items and Notifications are **icon shortcuts with visible labels** (FR-004, FR-005).
- ⚠ Walk every destination that existed before and confirm **none is orphaned** (FR-008).
- ⚠ Push into each new sub-screen and confirm it has a back affordance — the bottom bar hides below a
  tab root, and a screen without an app bar **strands the shopper** (research R9).

### 4c. Security is credential-shaped (US4 · SC-006)

Sign in **three times**, once per credential route, and check the screen each time:

| Account | Must show | Must NOT show |
|---|---|---|
| email + password | Change password | Set a password |
| email OTP, never set a password | Set a password | Change password |
| Google | The linked Google account, marked as the provider's | Any editable Effy value for it |

### 4d. ⚠ Deletion — the blocker, which is the part most likely to be wrong

This is the walk that would have caught the defect research R1 found.

1. **With no recent orders**: `GET /customer/v1/closure` → `blockers: []`. The control is reachable at
   the **bottom of Privacy & data** (FR-039).
2. **Place an order and pay.** Re-check: an `order_in_transit` blocker appears, carrying a `reference`, a
   route, and a **`clearsAt` that is not null** (FR-042).
3. **⚠ Confirm the block can actually end.** Set that order's `created_at` back beyond **7 days** in the
   dev database and re-check — the blocker must disappear. **If it does not, the feature has a permanent
   dead end and must not ship** (SC-012).
3a. **⚠ Confirm a WEEKLY shopper can still delete.** Seed orders 7, 14 and 21 days back and confirm
   `blockers` is empty. This is the case a 30-day window would have failed: on a weekly-re-buy grocery
   platform the most active customers would have been permanently undeletable, which is the same dead
   end in a different disguise.
4. **Start a checkout without paying.** An `order_awaiting_payment` blocker appears and is marked
   `resolvableByShopper: true`.
5. **Confirm nothing unmodelled is ever named** — no "outstanding balance", no "pending refund"
   (FR-042a).

### 4e. Deletion end to end (US3 · SC-007 · SC-008 · SC-009)

1. With blockers clear, walk the flow. Before any irreversible step, confirm you are shown what is
   deleted, **what is retained and why**, and **the date** after which recovery is impossible (FR-040).
2. Confirm a **freshly emailed code** is required — a valid session alone must not be enough (FR-043).
3. **⚠ Do this on a Google-only account too.** If the gate ever asks for a password, it is a dead end for
   every federated shopper (FR-043, research R3).
4. Complete it. Confirm **immediately**: all sessions ended, and the credentials are refused on **both
   iOS, Android and the web storefront** (SC-008).
5. **⚠ Confirm the hot path also refuses.** Try to view the cart or place an order. The cold path and the
   hot path have **separate gates**; a closure enforced only on the cold path leaves a "deleted" shopper
   able to shop — the single easiest thing in this feature to get wrong (data-model § Enforcement).
6. Sign in again during the window. The account restores, and `closure_state` returns to `'open'`.
7. **Read every screen of the flow** and confirm the words "deactivate", "disable", "freeze" and "pause"
   appear **nowhere** (SC-009).

### 4f. Address book (US5 · SC-013)

- No floating action button; a **full-width button at the bottom** (FR-032).
- Scroll to the last address at the **largest supported text size** — the button must not cover it
  (FR-033).
- Tapping a row body opens the **same** drawer as Add (FR-035).

### 4g. The store-facing half — ⚠ OPERATOR, and the most-missed part

1. Open the **public web deletion route with no app installed and no app session**. It must load, name
   Effy, and put the request path where it is immediately findable (FR-050, FR-050a).
2. **Declare that URL in the Play Console Data safety form.** Apple does not require it and Google does,
   which is exactly why it gets skipped.
3. Write the **review note** telling a reviewer to register a throwaway account before testing deletion
   (FR-051). ⚠ Not a special-cased account in code.
4. **⚠ Confirm the privacy policy and terms carry real, legally reviewed content** (FR-052a). SC-010
   requires every claim in the retention disclosure to be true of the built system.

### 4h. Accessibility and appearance (SC-014 · SC-015)

- Every screen and editor in **light and dark**, at the **largest** text size, on **phone, tablet and
  desktop**.
- **⚠ Android specifically** — it has not been visually checked across features 028, 029 or 033, and each
  of those recorded the gap and asked that it not be repeated.
- With a screen reader: open an editor, change a value, save. Focus must **enter the editor**, the
  content behind must be **inert**, and focus must **return to the originating row** on close (FR-056).

---

## 5. Machine checks

```bash
pnpm -r typecheck                     # expect 12/12
pnpm -r test
pnpm --filter @effy/customer-web build
pnpm --filter @effy/customer-web size  # ⚠ guest budget — see below
pnpm --filter @effy/customer-web exec depcruise --config .dependency-cruiser.cjs .

cd apps/customer-mobile
./gradlew :shared:compileAndroidMain :shared:testAndroidHostTest
./gradlew :shared:compileKotlinIosSimulatorArm64 :shared:iosSimulatorArm64Test
./gradlew :androidApp:assembleDebug
cd - && ./scripts/mobile-guard.sh
```

Also:

```bash
node scripts/check-compose-theme.mjs   # must be UNCHANGED — this feature adds no token
```

### ⚠ Three checks that need care rather than a green tick

1. **The guest bundle.** `GUEST_LIMIT` is 174 KB and the last full measurement left **2.1–5.5 KB of
   slack**. Measure **before and after**, on the same six routes. Account screens are budgeted
   separately, so the real risk is a leak into the **shared chunk** — a passing gate on an unchanged
   route list proves nothing if the list is stale.
2. **The new public routes must be IN the list.** Privacy, terms and the web deletion route are publicly
   reachable and MUST appear in `GUEST_PAGES` (FR-058c). A gate that does not measure them is the exact
   blind spot that let a route sit 58.8 KB over budget for two features.
3. **iOS tests must actually compile.** Feature 033 found that `:shared:iosSimulatorArm64Test` had
   **never** compiled while the Android host suite was green — a backtick test name containing a comma
   is legal on the JVM and illegal in Kotlin/Native. Run the iOS **test** target, not just the main
   compile, and confirm the test count matches Android's.

---

## 6. ⚠ Do not submit to a store yet

The soft delete is only half of the compliance answer. Until the **erasure slice** ships, a shopper is
told *"permanently deleted after 30 days"* and on day 31 still has a row — a promise the platform cannot
keep (FR-041, SC-011).

The store-submission checklist must carry the erasure slice as an **unmet blocking dependency**, not a
footnote.
