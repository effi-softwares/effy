# Planning inputs — 014-shop-mobile-foundation

**Status**: Binding input to `/plan`. **Not** part of `spec.md`.

## Why this file exists

The feature request carries technology and infrastructure directives. Principle I keeps them out of the
spec; `/plan` is the artifact allowed to hold HOW. They live here, unedited, and `/plan` MUST treat this
file as input alongside `spec.md`, `ARCHITECTURE.md`, the constitution, and — heavily — the **013 plan**.

## 1. Verbatim: the request's directives

> bootstrap the shop mobile app (we have already a basic kmp app in apps/shop-mobile). like in the customer
> mobile app, same tech same architecture (clean + mvvm). then we should implement the amplify sdks in native
> way to authenticate. but important thing is that shop users can not self register and only login method is
> email-otp, just like shop-web app. so first of all understand customer mobile for tech and architecture and
> shop web for authentication method. we should use shop cognito pool that we use for shop webapp, but need to
> create new client for mobile app.

## 2. The through-line: this is 013, minus, for a different audience

**Reuse the 013 (customer-mobile) stack and architecture wholesale** — it is the platform's proven mobile
foundation and the constitution's standard:

- KMP + Compose Multiplatform (Kotlin 2.4.0, CMP 1.11.1, AGP 9.0.1); Clean Architecture; **MVVM** (a
  `ViewModel` exposing an immutable `StateFlow<UiState>` + action functions — constitution **v1.8.0**, the
  amended standard; **not** the retired State/Intent/Effect MVI).
- Amplify **native** SDKs (Amplify Android on Android; Amplify **Swift** on iOS via the bridge pattern — an
  `IosAuthBridge` Kotlin interface implemented in Swift, wrapped by `IosAuthDriver`; Kotlin/Native cannot call
  Amplify Swift). The `AuthDriver` interface's deliberate absences carry over.
- Ktor client; **BuildKonfig** for build-time config (fail loud on a missing key); **no
  `amplifyconfiguration.json`** — configure Amplify from an in-code string.
- **Generated, committed, drift-guarded** contracts + theme (the 013 D15/D16 pipelines): the shop DTOs from
  `packages/shared-types/src/shop.ts` → Kotlin; the Compose theme from `tokens.css`.
- The `remember→viewModel{}` lifecycle, `BackHandler`, safe-area insets, and the `mobile-guard` build check —
  all as fixed/established in 013 (post-review).

**Read [specs/013-customer-mobile-foundation/](../013-customer-mobile-foundation/) end to end before
planning.** The plan should be "013 for the shop audience," reusing its research (D-notes) where identical and
only re-deciding what the shop audience changes.

## 3. What the shop audience CHANGES from 013 (the real content of this plan)

| Area | 013 (customer) | 014 (shop) |
|---|---|---|
| Credential routes | email+password **and** email OTP | **EMAIL_OTP only** — no password, no SRP, one route |
| Self-registration | open (public) | **none** — admin-provisioned (009); no sign-up/recovery/password screens |
| Entry model | **guest-first** (browse, defer sign-in) | **login-first** — no guest state; opens to sign-in |
| Token to the backend | **two-token** (ID token bearer + `X-Effy-Access-Token`) | **single access token** as `Authorization: Bearer` (⚠ see §4) |
| RBAC | none (customer pool defines no groups) | `shop_manager` / `shop_staff`; **role-aware UI + manager gate** |
| Account features | name, set/change password, sign-out-everywhere | **none** — identity read + gate only (bootstrap, like 007) |
| Backend | `edge-api/customer` (deploy pending) | `edge-api/shop` — **already serves both surfaces, no change** |
| App client | `customer_mobile` on customer pool | **new `shop_mobile` client on the shop pool** (see §5) |

## 4. ⚠ Correction to the request's premise: shop is SINGLE-TOKEN, not two-token

The request said "ID token in Authorization + X-Effy-Access-Token." **That is the CUSTOMER protocol, and it
does not apply to shop.** Verified in the codebase:

- shop-web sends the **access token** as the bearer (`apps/shop-web/src/lib/api.ts` — *"The ACCESS token
  (never the ID token) is the bearer"*); `getAccessToken()` returns `session.tokens.accessToken`.
- `edge-api/shop` reads identity **only** from the gateway-verified JWT claims (`subject`, `groups`); there is
  **no `X-Effy-Access-Token`** anywhere in `apis/edge-api/shop/src`.
- The two-token protocol exists **only** for customer *password-mutation* endpoints, which relay an access
  token to Cognito's access-token-authorized APIs. **Shop never calls Cognito from the backend**, so it needs
  no second token.

**Plan: `Authorization: Bearer <shop-pool access token>` to `/shop/v1/*`. One token. No second header.** The
Ktor auth plugin from 013 is *simpler* here (no ID-token/access-token split).

## 5. The infra change — a dedicated `shop_mobile` app client (mirror the 013 D3a pattern)

The shop pool (`infra/envs/dev/auth-shop.tf`) has one module-owned client (web). Add a **second standalone
client** for mobile, mirroring `aws_cognito_user_pool_client.customer_mobile` (`infra/envs/dev/auth-customer.tf`),
with the shop audience's differences:

- `explicit_auth_flows = ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]` — **drop `ALLOW_USER_SRP_AUTH`**
  (shop is passwordless; there is no password challenge).
- `generate_secret = false`; `prevent_user_existence_errors = "ENABLED"`.
- Token validity: 60-min access/id; **90-day refresh** (the per-client reason for a separate client, as in 013
  FR-019a — a phone kept signed in). *Confirm the desired refresh with the operator during planning; the shop
  web client is 30 days.*
- Native callback/logout scheme (e.g. `effy-shop://…`).
- **SSM param** `/effy/<env>/auth/shop/mobile_app_client_id` (the app reads THIS, not the web `app_client_id`).
- **Authorizer audience**: add the new client id to `extra_client_ids` for `shop` in
  `infra/envs/dev/edge-gateway.tf` (currently `[]`) — **or every mobile call 401s.**

Identity is per-**pool**, not per-client — one operator, one `sub`, one record across web + mobile. Both
changes are additive; the shop pool and web client are untouched. **No backend/service change.**

## 6. Open questions for `/plan`

1. **Refresh-token lifetime** for the shop mobile client — 90 days (matching 013's phone-session reasoning) or
   30 (matching shop-web)? An employee device in a warehouse is a different threat model than a personal phone.
2. **Principle II for the shop contracts** — reuse the 013 codegen pipeline pointed at `shop.ts`. Confirm the
   `ShopStaffRecordDTO` discriminated/nullable shapes (`email: string|null`, `shop: ShopSummary|null`,
   `roles: string[]`) generate cleanly, and that `toShopRoles` tolerant narrowing is reproduced in Kotlin
   (domain layer), not in the generated DTO.
3. **The manager gate is device-verifiable only in its negative half today** (007 deferral) — the positive
   half needs shop data (009). Plan the live sign-off as partial, exactly as 007.
4. **iOS HIG vs Material** — inherit 013's recorded Principle V deviation (Material 3 both platforms), or
   revisit for the shop surface? Recommend inherit (consistency across the mobile apps).
5. **Telemetry deferral** — a Principle VII deviation to carry in Complexity Tracking with a named closing
   slice, AND the shop parity register row 9 reconciled to "deferred."
</content>
