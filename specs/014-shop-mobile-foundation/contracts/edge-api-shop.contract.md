# Contract — `edge-api/shop`, as consumed by `shop-mobile`

**This contract is not new.** `apis/edge-api/shop` was built by 007 and already serves **both** shop surfaces.
This document records it **as the mobile app must consume it**, so the second client cannot drift from the first.

**Base URL**: SSM `/effy/<env>/edge/api_endpoint` → dev: `https://edge-api.dev.effyshopping.com`
**Media type**: `application/json`; **errors**: `application/problem+json` (RFC 9457)

---

## ⚠ The token protocol — a SINGLE access token (NOT two-token)

```http
Authorization: Bearer <shop-pool ACCESS token>
```

**One header.** Unlike `edge-api/customer` (which uses the two-token protocol for password mutations), the shop
service reads the caller's identity **only** from the gateway-verified JWT claims (`subject`, `groups`) — it
never calls Cognito, so there is no `X-Effy-Access-Token`. Send the **access token** (this is what shop-web
sends); the ID token is used only client-side for the display email.

The gateway's shop JWT authorizer verifies the token against the **shop pool** and the shop app-client audience
(the mobile client id must be in the authorizer's audience list — infra D3s — or every call 401s).

---

## Routes

### `GET /shop/v1/me` — record-backed identity + just-in-time record creation

```http
GET /shop/v1/me
Authorization: Bearer <access token>
→ 200 ShopStaffRecordDTO   { subject, email|null, roles[], status, shop|null, lastSeenAt }
```

- **Admits any authenticated shop-pool caller**, including **role-less** and **shop-unassigned** operators —
  that is a legitimate, in-progress state, not an error (FR-021). The handler's job is to **record** them.
- **Idempotent JIT upsert** (FR-020): first appearance creates the record (keyed on the Cognito `sub`); repeated
  calls read it. `status` and `shop_id` are **never** written from token data — they are platform-owned. `roles`
  are reconciled from the `cognito:groups` claim (the origin) into the record on each call.
- **`email` may be `null`** — resolved from the `email` claim, else an email-shaped `username`, else `null`
  (never a UUID). The app renders a graceful placeholder.
- **403** → the operator is **disabled** (or otherwise refused): the app goes to `Refused` (FR-030).

**Mobile MUST**: call this once per session start; render **everything** from the response (never from token
claims — FR-019); treat `roles: []` and `shop: null` as expected states.

### `GET /shop/v1/manager-ping` — the manager gate (the authorization decision)

```http
GET /shop/v1/manager-ping
Authorization: Bearer <access token>
→ 200 ShopManagerPingDTO   { audience:"shop", scope:"shop_manager", subject, message:"pong" }
→ 403 (uniform)            problem+json — does NOT say which term failed
```

**The gate, server-side (verbatim from 007):**

```sql
SELECT EXISTS (
  SELECT 1 FROM public.shop_staff ss
    JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
    JOIN public.shop            st  ON st.id = ss.shop_id
   WHERE ss.cognito_sub = $1
     AND ss.status      = 'active'      -- operator status
     AND st.status      = 'active'      -- assigned-shop scope (the JOIN also requires an assignment)
     AND ssr.role_key   = 'shop_manager' -- role
) AS ok
```

- **Three terms**: role **AND** operator status **AND** active-shop scope (the `JOIN public.shop` requires an
  assigned, active shop — an unassigned operator or an inactive shop drops out).
- The `cognito:groups` claim is **NOT** consulted here — the record decides (FR-027).
- **Fail-closed**: any error → `503`, never a grant (FR-026).
- **Uniform 403**: the body does **not** disclose which of the four terms failed (FR-025).

**Mobile MUST**: call this for the **actual authorization** whenever a manager capability is exercised — even
when the role is `shop_manager` (the role passing does not imply the gate passes). Render **one** denial message
for any 403. **Never** treat the hidden manager control as the authorization.

### Health — `GET /shop/healthz` · `GET /shop/readyz` (public) · `GET /shop/v1/ping` (shop JWT)

---

## Errors — `application/problem+json`, mapped to a small set of legible states (FR-031)

| Status | Means | The app shows |
|---|---|---|
| **401** | not signed in / token invalid | route back to sign-in (re-authenticate) |
| **403** on `/me` | **disabled** operator (or refused) | `Refused` — "this account can't be used", plainly |
| **403** on `manager-ping` | manager gate refused | **one uniform denial** — never which term failed |
| **429** | rate-limited | explain the wait; never loop |
| **503** | backend unavailable | **degraded + retry**; lose nothing entered |

**Never** surface `title`/`detail` verbatim if it would disclose internal detail or which check failed.

---

## What the mobile app must NEVER do

| Forbidden | Why |
|---|---|
| Send the **ID token** as bearer | The authorizer + handlers expect the **access token** (D2s) |
| Send `X-Effy-Access-Token` | Customer-only; the shop service ignores it and it signals a copied-from-013 mistake |
| Decide a manager capability from `isManagerByRole` or the `cognito:groups` claim | The **backend gate** decides; the hidden control is a courtesy (FR-023) |
| Call any non-`/shop/v1/*` service with the shop credential | Cross-pool isolation (FR-029) — a shop token is structurally refused elsewhere anyway |

## Cross-pool isolation (FR-028)

The app authenticates against the **shop pool only** and presents its credential to `/shop/v1/*` only. A shop
token carries the shop pool's issuer + the shop app-client audience, so every other audience's JWT authorizer
**structurally rejects** it — not by a check that could be forgotten.
</content>
