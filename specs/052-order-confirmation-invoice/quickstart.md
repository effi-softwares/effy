# Quickstart: 052 — Order Confirmation & Emailed Receipt

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) ·
**Contract**: [contracts/receipt.contract.md](./contracts/receipt.contract.md)

How to run and prove this feature. Operator steps are marked 🧑‍💻 — Claude does not run them
(CLAUDE.md § Mode of work).

---

## Baseline (recorded 2026-08-26, before any 052 code)

Captured by T001/T002 so every later count is compared against a known-good number, not a memory.

**Hot path** — `go build` / `go vet` clean. `go test ./...`: every package `ok` EXCEPT
`internal/features/saveditems` and `internal/platform/delivery`, which are **container-backed and
unrunnable here — Docker is not running on this machine**. Not a code failure, and not something this
slice can verify. `features/orders` and `features/checkout` — the two packages 052 touches — pass.

**Workspace** — `pnpm -r typecheck`: **17/17 Done**. `pnpm -r test`: **17/17 Done**.

| Package | Tests |
|---|---|
| edge-api/shared | 61 |
| edge-api/auth | 151 |
| edge-api/admin | 199 (+5 skipped) |
| edge-api/customer | 160 (+23 skipped) |
| edge-api/shop | 172 |
| edge-api/driver | 9 |
| edge-api/notifications | 9 |
| email-kit | 61 |
| web-kit | 51 |
| shared-types | 7 |
| legal-content | 9 |
| brand | 111 (node:test) |
| customer-web | 418 |
| shop-web | 139 |
| back-office | 79 |

**Gates** — `tokens:check` **10 generated files match**; `mobile-assets:check` **84 copies across 3
apps**; `banner-template:check` matches; `email-check` **10 templates clean**; `brand-check` **57
assets match**.

### ⚠ TWO PRE-EXISTING RED GATES WERE FOUND AND FIXED. NEITHER IS 052's.

Both were invisible because each aborted `pnpm -r test` before most of the workspace ran — the run
reported **4** packages Done, not 17. This is exactly the failure mode T001 exists to catch, and
exactly 029's lesson (count the reporting packages, do not trust the exit code alone).

1. **`packages/brand` — `brand-check` FAILED on two orphaned files.** 048 added a disallow-all
   `robots.txt` to `apps/shop-web/public/` and `apps/back-office/public/` (the internal consoles must
   not be indexed) and never exempted them, so the brand drift check reported both as orphaned brand
   assets. Fixed by adding `robots.txt` to `MANAGED_DIR_EXEMPT` in `packages/brand/src/targets.mjs` —
   the same treatment 039's hero photograph got, and for the same reason: a file the brand generator
   neither writes nor could have an opinion about.

2. **`apps/customer-web` — `MethodList.test.tsx` FAILED, and had been asserting nothing.** 051's
   styling commit `5a540f4` moved the row container from `rounded-[14px]` to `rounded-xl` (the SAME
   14px — 041 pins `--radius-xl: 0.875rem`) and moved `border-foreground` from the container onto the
   radio indicator. The test still queried the arbitrary-value class, so its selector matched **zero
   elements**; `expect(rows.length).toBeGreaterThan(0)` is the only reason the staleness surfaced at
   all. Fixed to query the token class and to assert the marker where it now lives, keeping both
   halves of the test's intent (marked, and not filled).

⚠ **One observation raised, deliberately NOT fixed** — it is 051's call, not this slice's: the
selected row's container is `border` and the unselected one is `border border-input`, which resolve to
**the same `#e5e5e5` in light mode**. The comment above it says selection "reads as a doubled border",
and there is no doubling. Selection is still unambiguous because the radio indicator carries it, so
this is a stale comment and a redundant branch rather than a usability defect.

---

## 0. Prerequisites

| | Why |
|---|---|
| A seeded catalogue with product images | The receipt shows line imagery |
| A served postcode with an active fee plan (047) | Checkout needs a delivery quote |
| SES able to send in the target env (037) | The receipt email |
| Stripe test keys + a webhook forward (`scripts/stripe-listen.sh`) | Payment must actually reach `paid` |

---

## 1. 🧑‍💻 Migration

```bash
make db-status ENV=dev
make db-up ENV=dev          # ⚠ commit the migration first — the 003 commit-guard refuses otherwise
```

Confirm:

```sql
\d public.receipt_dispatch
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'payment' AND column_name LIKE 'method_%';   -- 3 rows
```

⚠ **No backfill runs, and that is deliberate** (data-model §5). Orders paid before this deploy get no
`receipt_dispatch` row and are not mailed. They stay reachable through the resend action.

---

## 2. 🧑‍💻 Deploy

```bash
make core-run                                    # or the deployed core-api
make edge-deploy SERVICE=customer ENV=dev        # the resend route
make edge-deploy SERVICE=notifications ENV=dev   # the receipt drain
```

⚠ **Deploy `core-api` before `customer-web`.** 047 recorded that reversing this briefly broke dev
checkout: the web surface starts reading fields the API is not yet returning.

⚠ The notifications service needs `ses:SendEmail` and the `MAIL_*` variables. A config-contract test
asserts the real `serverless.yml` declares every key in `MAIL_ENV_KEYS` — that guard exists because
035 shipped four undeclared env vars, sent no email at all, and **100 passing tests missed it**
because they set the variables themselves.

---

## 3. Machine verification (Claude runs these)

```bash
# Hot path
cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...

# Cold path + web
pnpm -r typecheck
pnpm -r test
make email-check                       # drift, both size budgets, contrast ×3, text part, placeholders

# Mobile
cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest \
  :shared:compileKotlinIosSimulatorArm64 :shared:compileTestKotlinIosSimulatorArm64
make cm-guard && make cm-contract-check

# Design-system invariants — MUST be unchanged by this slice
pnpm --filter @effy/design-system tokens:check
make cm-tokens-check
```

⚠ `pnpm -r test` does **not** run `tsc` — 029 shipped with a green test run and a failing typecheck.
Run both, and check the reporting package **count**, not just the exit code.

---

## 4. Success-criteria walk

Each row states what to do and what proves it. 🧑‍💻 = operator.

| SC | How to prove it |
|---|---|
| **SC-001** | 🧑‍💻 Five observers land on the confirmation and answer "what did I buy, for how much, how did I pay, when does it arrive?" without navigating. 5/5. |
| **SC-002** | Order **with** a discount and a delivery fee, and one **without** either. On both: line totals sum to the subtotal; subtotal − discount + delivery = grand total = the amount charged in Stripe. |
| **SC-003** | Field-by-field diff of the web page against the mobile screen. Zero fields on one and not the other. |
| **SC-004** | Pay once. Confirm exactly one email. Then **re-deliver the webhook** (`stripe events resend <id>`) and confirm `SELECT count(*) FROM receipt_dispatch WHERE order_id=… AND reason='order_paid'` is still **1**. |
| **SC-005** | 🧑‍💻 Open the email in Gmail, Outlook (the Word engine — nothing open-source substitutes for it), Apple Mail; light and dark; images blocked; and as plain text. |
| **SC-006** | Render with a ≥25-item basket; `make email-check` passes the size budget; no client truncates it. |
| **SC-007** | Resend from web and from mobile; both arrive. Then exceed the limit and confirm a `429` **and no new `receipt_dispatch` row**. |
| **SC-008** | `POST /customer/v1/orders/{someone-elses-id}/receipt` and `.../{random-uuid}/receipt`. Both `404`, **byte-identical bodies**. |
| **SC-009** | 🧑‍💻 Both surfaces: dark mode, largest system text, screen reader end-to-end with every figure announced against its label. |
| **SC-010** | `tokens:check` passes **unchanged**; `grep` finds the status palette in exactly one file per surface and in no token file; deleting that one constant compiles. |
| **SC-011** | Adversarial read of the rendered page, the email source, **and the raw JSON**: no shop name, id, count, distance or ring. |
| **SC-012** | With identifiers unsupplied: no ABN, no GST amount, no "tax invoice" wording anywhere on page or email — **absent, not blank, not placeholder**. |
| **SC-013** | Abandon at a redirect provider. Confirm the not-completed state, **no receipt**, and **a basket still holding the items**. |
| **SC-014** | Pay; advance a portion in shop-web; re-open the order from history. The stage has moved. |
| **SC-015** | Point `MAIL_SENDER` at an invalid identity, pay, and confirm: the order is still `paid`, the confirmation page is unchanged, and `receipt_dispatch.status` reaches `failed` with `last_error` set. |

### The negative proofs worth doing deliberately

- **Break the exactly-once index** — drop `receipt_dispatch_auto_uq`, re-deliver the webhook, watch a
  second email arrive, restore it. That is the only way to know the index is what is protecting you
  rather than the code path happening not to run twice.
- **Break the stage rollup** — set one portion of a two-shop order to `delivered` and leave the other
  `picking`. The receipt must say **packing**, not delivered (research R5).
- **Break the rate limit atomically** — fire two resends concurrently at the limit boundary and
  confirm only one row lands. Check-then-write passes this test serially and fails it here.

---

## 5. Triage: "the customer says no receipt arrived"

One query answers it:

```sql
SELECT reason, status, attempts, last_error, message_id, created_at, processed_at
  FROM public.receipt_dispatch WHERE order_id = $1 ORDER BY created_at DESC;
```

| What you see | What it means |
|---|---|
| no row | The order never reached `paid`, or it predates this feature |
| `pending`, `attempts` 0, and old | The drain is not running — check the schedule and `MAIL_*` |
| `skipped` | No address on the account |
| `failed` + `last_error` | SES refused — read the error |
| `sent` + `message_id` | It left the platform. Join `message_id` to `public.email_delivery_event` (037) for the bounce/complaint outcome |

---

## 6. Known limits to state, not discover

- **No PDF and no print stylesheet** (spec, Out of Scope). The keepable copy is the email.
- **No tax invoice.** Two prerequisites, neither engineering work in this slice — research R13.
- **The promise is a DATE, never a time** (research R4). A time window is a delivery-tracking
  capability.
- **The payment-method line is absent on pre-052 orders**, and on any order where the post-commit
  capture failed (data-model §1).
