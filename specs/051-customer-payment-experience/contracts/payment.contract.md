# Contract: Customer Payment (051)

**Date**: 2026-08-25 · All routes are **hot path** (`apis/core-api`), customer pool, bearer **access**
token. Rationale for the path: [research.md](../research.md) § R9.

⚠ **Two-token reminder (027 R12a)**: `core-api` requires `token_use == "access"`. The mobile client must
send the access token here, not the id token. This is the defect that made every mobile cart write fail
in 019 and it will recur silently if the new mobile calls are added to the wrong bearer.

---

## 1. `POST /v1/checkout/intent` — CHANGED (additive)

The existing endpoint. Same request. **Response gains two fields; nothing is removed or renamed.**

**Request** (unchanged):
```
{ "addressId": "uuid", "billingAddressId": "uuid?", "deliveryMethod": "standard|same_day?" }
```

**Response** (added fields marked ✚):
```
{
  "orderId":            "uuid",
  "orderNumber":        "EFY-XXXXXX",
  "clientSecret":       "…",
  "publishableKey":     "pk_…",
  "grandTotalAmount":   "14.60",
  "currency":           "AUD",
✚ "customerSessionSecret": "…|null",     // MOBILE ONLY (spike S2) — null for web, which
                                          // renders saved cards itself and confirms by id
✚ "billingDetails": {                     // what Effy supplies at confirmation — FR-015/FR-016
     "name":  "Jane Smith",
     "email": "jane@example.com",
     "address": { "line1": "…", "line2": "…?", "city": "…", "state": "…", "postalCode": "…", "country": "AU" }
   }
}
```

**Rules**

- `customerSessionSecret` is **short-lived and single-customer**. It is minted server-side for the
  authenticated subject; the client never names a customer and cannot ask for another one's.
- ⚠ **It is minted only when the caller needs it** (mobile). Spike S2 established that the web card route
  renders saved cards from § 2 and confirms with a payment-method id, so a session there would be an
  unused provider round trip on a latency-sensitive path. Keyed off the request, not off the surface's
  say-so: the field is `null` unless the intent is for a client that renders a provider-owned method list.
- The server performs a **get-or-create** of the provider customer inside the same transaction that
  upserts the pending order, and persists the reference to `customer.stripe_customer_id`. Idempotent: a
  retried intent for the same order must not create a second provider customer.
- `billingDetails` is **derived, never accepted**. A `billingDetails` key in the *request* MUST be
  ignored if present — accepting one would let a client contradict the address it just confirmed.
- The server MUST NOT set `setup_future_usage` on the intent. Whether the card is kept is the shopper's
  choice, expressed through the save checkbox the customer session enables (research R5). Setting both
  is an integration error and would keep a card the shopper declined — FR-020.
- ⚠ **`stripe_customer_id` reaches the client ONLY beside a session secret, and only for mobile.** Both
  mobile SDKs require the id alongside the secret to attach a customer session (`createWithCustomerSession(id,
  clientSecret)`), so `customerId` ships in the same response as `customerSessionSecret` and is `null`
  whenever that is. It is absent from the web response entirely, never logged, never in telemetry, and
  never accepted as request input. See data-model § 1 (amended 2026-08-25).

---

## 2. `GET /v1/payment-methods` — NEW

The shopper's kept cards. Backs the account screen (US6) and the inline removal affordance.

**Response** `200`:
```
{ "paymentMethods": [
    { "id": "pm_…", "brand": "visa", "last4": "4242",
      "expMonth": 4, "expYear": 2028,
      "isDefault": true, "usable": true, "unusableReason": null }
] }
```

**Rules**

- Scoped to the authenticated subject. There is no customer parameter and no admin form of this route.
- A customer with no provider record returns `{"paymentMethods": []}` — not an error. Having never paid
  is not a failure state.
- `usable` and `unusableReason` are **server-computed** (FR-023). The client must not infer usability
  from the expiry: the rules for what counts as expired belong in one place.
- ⚠ A provider outage MUST return an error, never an empty list. "You have no cards" and "we could not
  ask" are different facts and conflating them is the FR-036 failure mode (data-model § 2).
- Only the fields above. No fingerprint, no cardholder name, no raw provider object (FR-025).

---

## 3. `DELETE /v1/payment-methods/{id}` — NEW

**Response** `204`, or:

| Status | When |
|---|---|
| `403` | The payment method is not attached to this shopper's provider customer. ⚠ Verify ownership server-side before detaching — the id is client-supplied, and a detach that trusts it is a cross-customer write. |
| `404` | Already removed. Idempotent from the shopper's point of view. |

**Rules**

- The card stops being offered on **every** surface immediately (FR-024) — which follows from there being
  no local mirror to invalidate.
- Removing the default leaves another kept card as default where one exists (FR-024b).
- ⚠ Removal MUST NOT be permitted to cascade into anything else. A card is not an order: a paid order
  keeps its payment record and its receipt after the card behind it is gone.

---

## 4. `POST /v1/checkout/confirm` — UNCHANGED

Still the idempotent fallback that finalises an order when the webhook lags. It is what makes FR-039 and
FR-040 true on the return-from-redirect path, which now carries far more traffic (Klarna, Zip, Afterpay,
and 3DS). Not modified — but **exercised much harder** by this feature, so its idempotency deserves a
test rather than an assumption.

---

## 5. `POST /v1/stripe/webhook` — UNCHANGED

The authoritative finaliser. ⚠ `IgnoreAPIVersionMismatch: true` must remain (research R10): the account's
API version is ahead of the pinned SDK, and removing it 400s every webhook and strands every paid order
at `pending_payment`. Any SDK bump in this feature must re-verify it.

---

## 6. Client-side contract (both surfaces)

Not an HTTP contract, but binding, because these are the settings the whole feature rests on.

| Setting | Web | Mobile | Requirement |
|---|---|---|---|
| Billing address collection | `fields.billingDetails.address: 'never'` — ⚠ **on the redirect-method Payment Element only**; the split card elements have no billing field to suppress (S2) | `BillingDetailsCollectionConfiguration(address = Never)` | FR-015 |
| Name collection | `fields.billingDetails.name: 'never'` — same scope | `name = Never` | FR-014 |
| Billing details supplied at confirm | `confirmParams.payment_method_data.billing_details` from § 1 | `defaultBillingDetails` + `attachDefaultsToPaymentMethod = true` | FR-016, FR-017 |
| Saved cards | ⚠ **Effy's own list** from § 2, confirmed with `payment_method: '<pm_id>'` — no customer session (S2) | customer session on the element configuration | FR-018 |
| Save consent | ⚠ **Effy's own checkbox** → `setup_future_usage: 'off_session'` + `allow_redisplay: 'always'` at confirm | the element's save checkbox, via the customer session | FR-020 |
| Appearance | Appearance API driven from `tokens.css`, both appearances | `PaymentSheet.Appearance` with `colorsLight` **and** `colorsDark` | FR-029, FR-030 |
| Typeface | Appearance `fonts` → General Sans | `typography.fontResId` → ⚠ needs the face added to `androidApp/src/main/res/font/` (research R8) | FR-029 |
| Wallets | Express Checkout Element above the Payment Element | Embedded element renders them | FR-008 |
| Card fields | Split `CardNumber` / `CardExpiry` / `CardCvc` in Effy shells | Embedded element's card form | FR-028 |

⚠ **`never` is a promise, not a preference.** With billing collection disabled, the confirmation call
**must** carry the details from § 1 or the payment is rejected outright. The two halves ship together or
neither ships.
