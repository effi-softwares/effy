# Contract: Customer Account Centre

**Feature**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) ·
**Data model**: [../data-model.md](../data-model.md)

All routes are **cold path**, on the existing `apis/edge-api/customer` service behind the customer
authorizer, following the established `/customer/v1/...` scheme. **No new IAM** — every Cognito call is
token-authorized (research R3).

---

## Changed: `GET /customer/v1/me` · `PATCH /customer/v1/me`

`CustomerDTO` gains two fields:

```ts
interface CustomerDTO {
  id: string
  email: string
  givenName: string | null
  familyName: string | null
  phone: string | null            // NEW — self-asserted, NEVER verified (FR-060a)
  status: "active" | "barred"
  closureState: "open" | "closing" // NEW — read-only here; written only by the closure routes
  hasPassword: boolean
  passwordUpdatedAt: string | null
  createdAt: string
}
```

`UpdateCustomerDTO` gains `phone` **only**:

```ts
interface UpdateCustomerDTO {
  givenName?: string
  familyName?: string
  phone?: string                  // NEW. "" clears it to NULL — see below
}
```

**⚠ `closureState` MUST NOT be added to `UpdateCustomerDTO`.** That type's documented purpose is to list
what a customer may change about themselves; closure is written by the closure endpoint after a
verification code, never by a profile patch.

**⚠ Clearing uses `""`, not `null`.** The mobile client serialises with `explicitNulls = false`, which
drops nulls from the payload entirely — a `null` phone would be indistinguishable from "field not sent"
and the clear would silently no-op. `customer-me-v1-patch.ts:111-119` already maps `""` → `NULL` for the
name parts; `phone` follows the identical path.

**Refusals** are unchanged in shape: `403` for a barred customer, and now also for a `closing` one, with
the same uniform body that does not disclose which condition applied.

---

## New: `GET /customer/v1/closure`

Everything the shopper must be shown **before** any irreversible step (FR-040), plus whatever blocks
them (FR-042). Read-only and side-effect free — it may be called as often as the flow needs.

```ts
interface ClosurePreviewDTO {
  /** Blocking obligations. Empty ⇒ closure may proceed. */
  blockers: ClosureBlockerDTO[]
  /** Categories retained after erasure, with the reason for each (FR-045). */
  retained: RetainedCategoryDTO[]
  /** ISO date closure would become irreversible if requested now. Advisory until requested. */
  eraseAfterIfRequestedNow: string
  /** Present only when a request is already live. */
  activeRequest: { requestedAt: string; eraseAfter: string } | null
}

interface ClosureBlockerDTO {
  kind: "order_awaiting_payment" | "order_in_transit"
  /** Shopper-facing reference, e.g. "EFY-HVX2AE". */
  reference: string
  /** Where the shopper goes to act on it — FR-042's "direct route". */
  href: string
  /** Closed vocabulary for mobile, which has no URL router. */
  target: { kind: "order"; id: string }
  /** When this blocker stops blocking. NEVER null — FR-042 forbids a block with no stated end. */
  clearsAt: string
  /** Whether the shopper can act on it, or only wait. */
  resolvableByShopper: boolean
}

interface RetainedCategoryDTO {
  category: string   // e.g. "completed orders"
  reason: string     // e.g. "required for tax and accounting records"
}
```

**⚠ `clearsAt` is non-nullable by design.** FR-042 requires every block to state when it clears, and
research R1 found that the original design had **no exit at all** — an order's only terminal state is
unreachable in production. Making the field non-nullable means a blocker that cannot say when it ends is
**unrepresentable**, rather than merely discouraged.

**⚠ `blockers` MUST only contain modelled conditions** (FR-042a). The platform models no balance and no
refund; emitting such a blocker would be a refusal the shopper could never act on.

`href` **and** `target` are both set from the same order id, and a test pins that they agree — the same
web-routes-on-`href` / mobile-routes-on-`target` split feature 029 established.

---

## New: `POST /customer/v1/closure/challenge`

Issues the freshly-issued verification code FR-043 requires. Reuses feature 012's token-authorized
primitive (`GetUserAttributeVerificationCodeCommand`), so it needs **no new IAM**.

```ts
// Request: empty
interface ClosureChallengeResultDTO {
  maskedDestination: string   // e.g. "j•••@gmail.com"
}
```

**⚠ Keyed on the verified email attribute, not on a password.** This is the whole reason the flow works
for a Google-only shopper: a password re-auth prompt would be an unresolvable dead end for them, and the
research flagged that as *"exactly the kind of path that ships untested"*.

**Refused** if `blockers` is non-empty — the code is not issued for a request that cannot succeed.

---

## New: `POST /customer/v1/closure`

Verifies the code and closes the account. **One transaction.**

```ts
interface ClosureRequestDTO {
  code: string
}

interface ClosureResultDTO {
  eraseAfter: string          // the date the shopper is now owed (FR-040)
  allSessionsRevoked: true
}
```

Server-side, in order, and **all or nothing**:

1. Re-evaluate `blockers` **inside the transaction**. They are re-checked rather than trusted from the
   preview, because an order can be placed between the preview and the confirmation.
2. Verify the code (`VerifyUserAttributeCommand`).
3. Insert `customer_closure_request` with a **stored** `erase_after`.
4. Set `closure_state = 'closing'`.
5. `GlobalSignOutCommand` — FR-041's "all sessions end".

**Failure modes**, each distinguishable because they imply different actions:

| Condition | Status | Why it is its own answer |
|---|---|---|
| Code wrong or expired | `400` | Retry with a new code |
| Blockers appeared since the preview | `409` | The body carries the new blockers |
| Already `closing` | `409` | Not an error the shopper caused |
| Barred | **allowed** | FR-049 — a sanction must not override a data right |

**⚠ No Cognito user state changes here.** The user stays enabled through the grace window because the
restore path requires them to be able to authenticate (research R4). Refusal comes from the record,
which is the platform's existing and authoritative mechanism.

---

## New: `POST /customer/v1/closure/restore`

Cancels a live closure request during the grace window (FR-041a).

```ts
// Request: empty. Authorized by the customer's own token.
interface ClosureRestoreResultDTO {
  restoredAt: string
}
```

**⚠ Restore is an EXPLICIT call, not a side effect of signing in.** An earlier draft made it implicit —
"it happens inside the existing sign-in path, which already loads the customer record" — and that is
unimplementable as stated: the refusal and the restore run through **the same** `getOrCreateCustomer`,
so the gate would refuse the very request meant to restore. It is also unsafe: a token used by anyone
other than the account holder during the window would silently un-delete the account.

The client calls this **after** presenting the shopper with what is happening and getting a deliberate
confirmation. Signing in surfaces the choice; it does not silently make it.

**⚠ `closure_state` MUST NOT enter `ON CONFLICT DO UPDATE`**, for the same reason `status` must not:
`customer/repo.ts:17-39` records that allowing it would let a customer undo a platform decision merely by
authenticating. Restore sets `cancelled_at` and returns `closure_state` to `'open'` as an explicit,
auditable write.

**Refusals**: `409` if there is no live closure request; `404`-equivalent uniform refusal if the record
has already been erased.

---

## Route summary

| Route | Purpose |
|---|---|
| `GET /customer/v1/closure` | Blockers + disclosure |
| `POST /customer/v1/closure/challenge` | Issue the verification code |
| `POST /customer/v1/closure` | Verify + close |
| `POST /customer/v1/closure/restore` | Cancel during the grace window |

Four new cold-path routes. `GET`/`PATCH /customer/v1/me` change shape but are not new.

---

## New: web-only public route (FR-050)

A public page on `customer-web` from which deletion can be **requested without the app installed**.

- **Public and crawlable-safe**, identifying Effy by name, with the request path prominently placed and
  loading without error — Google's three stated criteria (functional · relevant in scope · references
  the app or developer name).
- **May require sign-in**, which is acceptable **because a customer can sign in on the web without the
  app**. The failure mode to avoid is a page whose only route to deletion needs something the app alone
  can provide.
- **⚠ Must join `GUEST_PAGES` in `bundle-budget.mjs` in the same commit** (FR-058c). It is publicly
  reachable, and the gate's own comments record a public route that sat 58.8 KB over budget for two
  features because it was never listed.
- **Its URL is declared in the Play Console Data safety form** — an operator step, and the most-missed
  half of the Play requirement.

---

## Not in this contract

- **Permanent erasure.** Out of scope (FR-041); a later slice owns it, and will need `AdminDeleteUser`
  and a **new IAM statement**.
- **Phone verification.** FR-060a explicitly bars a verified indicator; there is no challenge route for
  a phone, and no `phone_verified` field for one to write to.
- **A data-only deletion option.** Google's language is permissive, not mandatory (spec Assumptions).
- **Guest deletion (FR-046).** Entirely client-side — an Effy guest has no server record, so there is no
  endpoint to call (research R14).
