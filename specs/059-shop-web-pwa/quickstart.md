# Quickstart — 059 Shop Console as an Installable, Notifying Production App

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

This is the validation guide, not an implementation guide. ⚠ **Almost every step here needs a real
iPad and a real order.** The platform's own record is that 039 shipped four live defects behind a
fully green suite, and that 057 and 058 have never been looked at by a person — so a green suite is
the *entry* condition for this document, not evidence of anything it asserts.

---

## §0 — ⚠ Prerequisites the operator owns (BEFORE anything below)

### 0a. Drain the deploy backlog

Walking a console whose backend is four slices behind measures the wrong thing. From `CLAUDE.md`'s
open-items lists, in this order:

```bash
# Schema first — every service below expects it
make db-up ENV=dev                      # 054, 055, 057, 058 (incl. 058's SECOND migration)

# Infrastructure before the services that fail closed without it
make apply ENV=dev                      # 055/057: core-api needs AUTH_SHOP_*/back-office pool
                                        # or it FAILS CLOSED AT BOOT

make core-image-push && make core-deploy ENV=dev     # 055 refunds, 057 shop verifier

make edge-deploy SERVICE=fleet     ENV=dev   # ⚠ 056: BEFORE admin, or driver mgmt answers nothing
make edge-deploy SERVICE=admin     ENV=dev
make edge-deploy SERVICE=shop      ENV=dev   # 057 + 058 (carries 058's product-rollup fix)
make edge-deploy SERVICE=inventory ENV=dev
make edge-deploy SERVICE=orders    ENV=dev
make edge-deploy SERVICE=driver    ENV=dev
make edge-deploy SERVICE=customer  ENV=dev
make edge-deploy SERVICE=notifications ENV=dev
```

**Gate**: sign in to `https://shop.dev.effyshopping.com`, open Today and Insights, confirm both
answer. If they do not, stop — nothing below is meaningful.

### 0b. Operator-supplied secrets ⚠ never inferred

Per the constitution's real-world-identifier rule, these must be **supplied**, and the build must
**fail loudly** without them:

| Value | Where from | Where it goes |
|---|---|---|
| Firebase **Web Push certificate** (VAPID public key) | Firebase console → Project settings → Cloud Messaging → Web configuration | `VITE_VAPID_PUBLIC_KEY` (public, build-inlined) |
| Firebase **web app config** (apiKey, projectId, appId, messagingSenderId) | Firebase console → Project settings → Your apps → Web | `VITE_FIREBASE_*` (public, build-inlined) |
| FCM **service account** | already seeded for 050 | unchanged — the worker already has it |

⚠ The `VITE_FIREBASE_*` values are **public by design** (they identify, they do not authorise) and
are safe to inline exactly like the Cognito pool ids the console already carries. The **service
account** is the secret, it stays in Secrets Manager, and it is never in the console.

**Gate**: `make apply ENV=dev`, then confirm the built console fails to start with a named error if
`VITE_VAPID_PUBLIC_KEY` is absent — *prove it by removing it*.

---

## §1 — Installability (US2)

**Prerequisites**: §0 complete; Phase 1 deployed to `dev`.

### 1a. ⚠ The manifest actually resolves

The single highest-value check in this document, because failing it looks like nothing at all.

```bash
curl -sI https://shop.dev.effyshopping.com/manifest.webmanifest | head -5
curl -s  https://shop.dev.effyshopping.com/manifest.webmanifest | head -3
```

**Expect**: `content-type: application/manifest+json` and JSON.
⚠ **If you get `text/html` with a `200`**, the SPA rewrite swallowed it — `webmanifest` is missing
from the allow-list in `infra/envs/dev/amplify-consoles.tf` (research R10). The console will simply
not be installable, with no error in any console, log or test.

```bash
curl -sI https://shop.dev.effyshopping.com/sw.js | grep -i 'content-type\|cache-control'
```
**Expect**: `application/javascript`, and a `no-cache`-family `Cache-Control`.

### 1b. Install on an iPad — **SC-003**

1. Safari → `https://shop.dev.effyshopping.com` → sign in with an email code.
2. Confirm the console shows **iOS install instructions** (Safari fires no `beforeinstallprompt`).
3. Share → Add to Home Screen. Confirm the icon is the **Effy shop mark**, not a screenshot.
4. Launch from the home screen. **Time it.**

**Expect**: standalone window, **no address bar**, **still signed in**, lands on Today,
**under 60 seconds** from step 1. Confirm the install instructions are now **gone**.

### 1c. Sign-in inside the installed window — **FR-005**

Sign out, then sign in **from the home-screen app**: leave to Mail for the code, come back, paste.

⚠ **Expect the session to survive the app switch.** This is the most likely place for a
standalone-window session defect, and it is unreachable from a desktop browser.

### 1d. Install on Android Chrome

**Expect** a native install prompt (not instructions), and dismissal remembered across a reload
(FR-006).

### 1e. Update reaches an installed device — **SC-009**

Deploy any visible change. On a device installed with the **previous** build, without reinstalling:

**Expect** the "new version ready" prompt, and the change after accepting. ⚠ Then repeat **without
touching the app for an hour** — the console must find the update on its own via the focus/interval
check (R13). A console open all shift never navigates, which is the case that fails silently.

---

## §2 — Offline (US5)

With the console installed and Today loaded, enable airplane mode.

| # | Action | Expect | FR |
|---|---|---|---|
| 2a | Read the screen | Data still shown, **marked "last updated …"** | FR-035 |
| 2b | Navigate to Orders, Catalog | Renders; no blank page, no browser error | FR-033, SC-007 |
| 2c | Try to pick a line | **Refused** with a clear offline message | FR-036 |
| 2d | Force-quit; relaunch from the home screen **still offline** | ⚠ The console's **own** offline state, not Safari's error page | FR-034 |
| 2e | Restore the network | Recovers **without a manual reload** | FR-037 |

⚠ **2c is the one to be adversarial about.** "Told it cannot be done right now" and "appeared to
work and quietly did nothing" look identical for about two seconds. Verify against the database that
nothing was written.

---

## §3 — ⚠ A new order reaches a closed console (US1) — SC-001, SC-002

**This is the first moment anything in this slice is proven.** Everything before it is inference.

### 3a. Enable notifications

In the installed console: Settings → Notifications. **Expect a priming explanation before any
browser prompt** (FR-023). Accept.

```sql
-- Confirm the registration landed
SELECT platform, audience, left(fcm_token, 12) AS tok, muted_types, last_seen_at
  FROM public.device_token WHERE audience = 'shop' ORDER BY last_seen_at DESC LIMIT 5;
```
**Expect** a row with `platform = 'web'`. ⚠ If registration 400s, the migration has not run.

⚠ **Known iOS behaviour** (research R12): the token may not be obtainable until Safari is closed and
reopened after granting. If `getToken` returns nothing, do that before concluding anything is broken.

### 3b. The actual test

1. **Close the console entirely** and lock the iPad.
2. Place a paid test order on `customer-web` containing items this shop fulfils (Stripe test card).
3. **Start a timer at payment.**

**Expect**: a notification within **30 seconds** (SC-001), reading "New order to pick", carrying a
count — and **no customer name, address or total** (FR-013, FR-031).

4. Tap it. **Expect** the console opens **on that order**, in **one action** (SC-002).

⚠ Repeat **20 times** for SC-001's 19/20. The binding constraint is the notification worker's
schedule interval — if it misses, that interval is the cause, not the browser.

### 3c. Already looking — FR-030

With the console **open and visible on the orders queue**, place another order.
**Expect**: the screen updates (058's SSE stream) and **no system notification**.
Then background the tab and repeat. **Expect**: a notification — the check is *visibility*, not
*existence*.

### 3d. Coalescing — SC-005

Place **20** orders within one minute with the console closed.
**Expect**: **at most 5** interruptions, and one banner reading "N new orders to pick".
⚠ If you see 20 stacked banners, `tag` is missing. If you see one silent replacement, `renotify` is.

### 3e. Two operators — FR-012

Two operators, two devices, one shop, one order. **Expect both notified.**

### 3f. Idempotency — FR-015

Re-deliver the Stripe webhook for a paid order. **Expect no second notification**, and
`notification_request` unchanged (the `UNIQUE dedupe_key`).

---

## §4 — Attention (US3)

For each kind: drive the condition, wait one evaluator interval, observe.

| # | Drive it | Expect | FR |
|---|---|---|---|
| 4a | Leave orders unpicked past the threshold | One notification; opens the queue | FR-017, FR-021 |
| 4b | Set a product's stock to 0 | One notification naming the count; opens that product | FR-017 |
| 4c | Set a product below its reorder point | One notification | FR-017 |
| 4d | Submit a refund proposal | Notification to a **`shop_manager` only**; a `shop_staff` device gets **nothing** | FR-022 |
| 4e | Wait through several intervals with 4b still true | ⚠ **No further notification** | FR-018 |
| 4f | Restock, then set to 0 again | ⚠ **Notifies again** | FR-019 |
| 4g | Drop **10+** products below threshold in one stock count | ⚠ **One** notification, "N products", not ten | FR-020, SC-005 |

⚠ **4e and 4f are the pair that matters.** 4e without 4f is a feature that notifies once and never
again — silently useless. 4f without 4e is a feature that notifies every few minutes forever, which
gets switched off in a day and takes new-order notifications with it.

⚠ **4g is the one a stock take will find in production if this walk does not.**

---

## §5 — Control (US4)

| # | Action | Expect | FR |
|---|---|---|---|
| 5a | Mute "Below reorder point" on device A only | Device A silent for that kind; **device B still notified**; new orders unaffected on both | FR-024, FR-025 |
| 5b | Turn notifications off entirely | Nothing arrives; the registration row is gone | FR-024 |
| 5c | Block notifications in browser settings, reopen the console | ⚠ A plain "blocked in your browser" statement and **no toggle** | FR-026 |
| 5d | Sign out | `device_token` row gone; nothing arrives afterwards | FR-027, SC-013 |
| 5e | Sign out, sign in as a **different** operator on the same tablet | No notifications for the first operator's shop; the persisted cache is empty | Shared-tablet edge case |
| 5f | Delete the registration in the database, then send | The send is recorded as skipped and the dead row pruned; **no crash** | FR-028 |
| 5g | A colleague who **never** enabled notifications uses the console for a day | **No behaviour change at all** | SC-012 |

---

## §6 — ⚠ The walk (US6) — SC-010, SC-011

**The most important section in this document, and the one with no commands.**

Open [`docs/audiences/shop-capabilities.md`](../../docs/audiences/shop-capabilities.md). For **every
row** claiming ✅ on `shop-web`, exercise it against live dev data and record what was **observed**.

Screens: sign-in · Today · Insights · Orders list · Order detail (picking, part-pick, Fulfil, cancel,
print pick list, CSV export, refund) · Catalog list · Product detail (all four tabs + Activity sheet)
· Add product wizard · Stock rules and movements · Sections · Team · Shop identity · Appearance.

Also walk, on the installed app on a tablet in **both** appearances:

- Every screen at **tablet width in landscape** — the primary device, and the one nobody has used.
- **Dark mode** on a shop floor under bright light.
- Keyboard-only navigation and focus visibility.

**Record**: one line per capability — `PASS`, or the defect. Every defect is fixed with a test that
fails without the fix (FR-039), or written down with a reason (SC-011). Then update the register with
the **observed** state, not the intended one.

⚠ **Expect to find things.** 039 found four live defects — an orphaned divider, a backwards phone
layout, a CTA that vanished in dark mode, a scrim bleaching the artwork — every one of them live with
a fully green suite, because layout, contrast and hierarchy are not properties a DOM assertion can
see. 024's launcher icon compiled, packaged and inflated to nothing. 058's stream would have died at
30 seconds while every test passed. Finding nothing here is the surprising outcome, not the expected
one.

---

## §7 — Machine gates (the entry condition, not the proof)

```bash
pnpm -r typecheck                                   # expect 19/19
pnpm -r test                                        # every package
pnpm --filter @effy/shop-web test
pnpm --filter @effy/edge-shop test                  # incl. container-backed
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test
pnpm --filter @effy/edge-notifications test
pnpm --filter @effy/design-system test              # check-tokens, component-shape, token-usage
pnpm --filter @effy/brand test

make tokens:check                                   # ⚠ MUST be UNCHANGED — proves no token moved
                                                    #   and no mobile Compose theme was touched
make brand-check
make check-no-emerald && make check-no-jade
terraform -chdir=infra/envs/dev validate && terraform -chdir=infra/envs/dev fmt -check
```

⚠ **Suites that must pass UNMODIFIED** — each is a proof, not a formality:

| Suite | Proves |
|---|---|
| `back-office` (190) | The Amplify module generalisation changed nothing (048's pattern) |
| `edge-customer`, `edge-driver` device tests | The `platform` widening changed nothing |
| `edge-notifications` mobile send tests | The sender branch changed nothing |
| `edge-shop` Today tests | The attention-derivation promotion changed nothing (Principle II) |

### Negative proofs — execute each by **breaking the thing**

| # | Break | Must fail |
|---|---|---|
| NP1 | Remove `webmanifest` from the rewrite allow-list | The manifest fetch returns HTML |
| NP2 | Add a `notification` block to the web sender branch | P1 |
| NP3 | Remove `tag` from `showNotification` | P8 |
| NP4 | Remove `renotify` | P8's audible half |
| NP5 | Make the push handler throw on a malformed payload | P5 |
| NP6 | Remove `includeUncontrolled` from `matchAll` | P9 |
| NP7 | Key `dedupe_key` on the product id instead of the occurrence id | A3 (the recurrence is swallowed) |
| NP8 | Make `subject_key` nullable and use `NULL` for `awaiting_pick` | A8 (notifies every run) |
| NP9 | Emit one intent per product instead of per kind | A4 |
| NP10 | Have the evaluator derive attention itself instead of calling `derive.ts` | A10 |
| NP11 | Register a second service worker | The single-registration test |
| NP12 | Change `webPath` for one type without changing its route | P3 |

⚠ Each of these is a defect this repo has shipped a version of before. NP7 and NP8 are the two most
likely to survive review, because both leave a fully green suite and a feature that looks like it
works.

---

## §8 — Sign-off

Not done until:

- [ ] §0 backlog drained; the console answers from current code
- [ ] §1b walked on a **real iPad**; SC-003 timed
- [ ] §3b walked **20 times**; SC-001 met 19/20
- [ ] §3d, §4e, §4f, §4g walked — the four that decide whether this stays switched on
- [ ] §5c walked (blocked permission) — the state that makes the feature look broken
- [ ] §6 complete: every register row observed, every defect fixed or written down
- [ ] §7 green, all four unmodified suites, all twelve negative proofs executed by breaking
- [ ] Parity register updated with **observed** state
- [ ] ⚠ The commit — the operator's, per `CLAUDE.md`
