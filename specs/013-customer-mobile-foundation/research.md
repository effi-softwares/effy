# Research — 013 Customer Mobile Foundation

**Date**: 2026-07-14 · **Feeds**: [plan.md](plan.md) · **Inputs**: [spec.md](spec.md),
[planning-inputs.md](planning-inputs.md), [ARCHITECTURE.md](../../ARCHITECTURE.md)

Every decision below is `Dnn`. Findings that **changed the spec** or that **contradict the operator's stated
stack** are marked **⚠** — those are the ones worth reading if you read nothing else.

---

## Part A — What the platform already gives this app

### D1 — The backend for this slice is **already written**. This app is its second client.

`apis/edge-api/customer` exists and implements every account capability 012 specified. The mobile app **calls
it**; it does not reimplement it.

| # | Route | Auth | Body → Response |
|---|---|---|---|
| 1 | `GET /customer/healthz` · `GET /customer/readyz` | public | liveness / DB probe |
| 2 | `GET /customer/v1/me?route=password` | JWT | — → `CustomerDTO` |
| 3 | `PATCH /customer/v1/me` | JWT | `UpdateCustomerDTO` → `CustomerDTO` |
| 4 | `POST /customer/v1/password/challenge` | JWT **+ access token** | `{}` → **202** `PasswordChallengeResultDTO` |
| 5 | `PUT /customer/v1/password` | JWT **+ access token** | `PasswordWriteDTO` → `PasswordWriteResultDTO` |
| 6 | `DELETE /customer/v1/sessions` | JWT **+ access token** | — → **204** |
| 7 | `POST /customer/v1/password/reset-confirm` | **public** | `ResetConfirmDTO` → `{ok:true}` |

Base URL: SSM `/effy/<env>/edge/api_endpoint` → `https://edge-api.dev.effyshopping.com`.

### D2 — ⚠ The **two-token protocol**. Get this wrong and every account route 401s.

The single most important integration fact, and the one a second surface is most likely to reimplement wrong.

```
Authorization:       Bearer <ID token>       ← the gateway JWT authorizer verifies THIS
X-Effy-Access-Token: <access token>          ← the Lambda relays THIS to Cognito
```

**Why both.** The gateway authorizer's `audience` is the app client id — that is the **ID token's** shape, so the
ID token must be the bearer. But Cognito's `ChangePassword` / `GlobalSignOut` /
`GetUserAttributeVerificationCode` / `VerifyUserAttribute` are **access-token-authorized**, and the Lambda holds
**no IAM permission** for them — it relays *the customer's own authority*. Hence a second header.

**And the backend checks they match**: `requireCaller` decodes the access token's `sub` and **401s if it differs
from the gateway-verified `sub`** — the mismatched-pair attack is already closed. The header name is
`x-effy-access-token` (lowercase on the wire).

`GET /customer/v1/me` additionally **fails closed with 401 if the token carries no `email` claim** — which is
another way of saying: **the ID token, not the access token, goes in `Authorization`.** A client that sends the
access token as the bearer will fail identity reads with a confusing 401.

### D3 — ⚠ The customer pool is **already configured for everything this app needs**. One value changes.

Read from `infra/modules/cognito-user-pool/main.tf` + `infra/envs/dev/auth-customer.tf`:

| Setting | Value today | Verdict |
|---|---|---|
| `generate_secret` | **`false`** | ✅ correct for a public client (D18) |
| `explicit_auth_flows` | `ALLOW_USER_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_SRP_AUTH` | ✅ exactly what mobile needs |
| `sign_in_policy.allowed_first_auth_factors` | `["EMAIL_OTP", "PASSWORD"]` | ✅ both routes, no change |
| `self_signup_enabled` | `true` | ✅ the only pool open to the public |
| `password_policy.minimum_length` | **12**, no composition rules | ✅ matches `PASSWORD_MIN_LENGTH` |
| `mfa_configuration` | `OFF` | ✅ **and it must stay off** (D9) |
| `user_pool_tier` | **`ESSENTIALS`** | ✅ required — `ALLOW_USER_AUTH` needs Essentials+ |
| `access_token_validity` / `id_token_validity` | 60 min | ✅ |
| **`refresh_token_validity`** (web client) | **30 days** | ✅ **stays 30** — mobile gets its own client at 90 (D3a) |
| `callback_urls` | already includes **`effy-customer://auth/callback`** | ✅ a mobile scheme is pre-allowlisted (inert until Google un-parks) |
| `lifecycle` | `prevent_destroy = true` | ✅ seatbelt |

**The pool is untouched; the slice adds a dedicated mobile client (D3a).** Only `generate_secret` / `user_pool_id`
force replacement (verified in 011 research D13), and we touch neither. We still `terraform plan` and grep for
`must be replaced` before applying.

### D3a — ⚠ A **dedicated `customer-mobile` app client** (decided during implementation, 2026-07-14)

The plan first assumed the mobile app would **reuse the web app client** and simply bump its `refresh_token_validity`
30 → 90 in-place. **That was wrong, and a live-security regression:** `refresh_token_validity` is a **per-client**
setting, so bumping the shared client to 90 days would extend the **web** session to 90 days too — and a browser,
possibly on a shared computer, is exactly the session you do **not** want long-lived.

**Decision: a second, standalone public app client on the same customer pool**, for mobile only.

| | Web client (existing) | **Mobile client (new)** |
|---|---|---|
| refresh | **30 days** (unchanged) | **90 days** (FR-019a) |
| `generate_secret` | false | false |
| auth flows | `USER_AUTH` + `REFRESH_TOKEN_AUTH` + `USER_SRP_AUTH` | **identical** |
| `prevent_user_existence_errors` | ENABLED | ENABLED |
| callbacks | web + mobile scheme | **mobile scheme only** |

Why this is safe and correct:
- **Identity is per-POOL, not per-client.** `sub` is unaffected, so *one person → one sub → one `public.customer`
  row* holds across both clients: a customer who registered on web signs in on mobile and lands on the **same
  record**. App clients do not fork identity.
- **The only real coupling is the edge authorizer's audience.** It pins `audience = [web_client_id]`
  (`edge-gateway.tf:59`); a mobile token carries the **mobile** client's id as `aud`, so **the audience must become
  a list including both**, or every mobile call 401s. Done via an `extra_client_ids` field on the `edge_pools`
  local (every entry carries it — empty for the single-client pools — so the map stays one object type).
- Bonus: independent lifecycle (rotate/disable one surface without the other) and per-surface attribution (the
  `client_id` claim distinguishes mobile from web traffic).

**Changes (both additive, pool untouched):** a new `aws_cognito_user_pool_client.customer_mobile` +
`/effy/<env>/auth/customer/mobile_app_client_id` SSM param in `auth-customer.tf`; the customer authorizer audience
in `edge-gateway.tf`. **Verified: `terraform fmt` clean, `terraform validate` → Success.** The app's
`COGNITO_APP_CLIENT_ID` reads the **mobile** SSM param, not the web `app_client_id`.

Supersedes the "one value, in-place bump" framing in D3/D10 above.

### D4 — ⚠ `apps/customer-web/lib/amplify-config.ts` declares a **stale password policy**. Do not copy it.

It still says `minLength: 8, requireLowercase, requireUppercase, requireNumbers`. The **real** policy is Terraform's
and `shared-types`': **12 characters, no composition rules.** The web file is a client-side *hint* only (the
backend enforces), so it is cosmetically wrong rather than exploitable — but a mobile app that copied it would
show customers rules that don't exist. **Copy from `shared-types`, never from the web app.** (Raised, not fixed
here — it is 011/012's file.)

---

## Part B — Authentication: the SDK question

### D5 — ⚠ Amplify Swift **cannot be called from `iosMain`**. The naive plan does not compile.

Kotlin/Native interops with **Objective-C and C**. Amplify Swift is **Swift-only** (no ObjC surface). So an
`iosMain` Kotlin file **cannot import or call Amplify Swift at all**. This invalidates the obvious reading of the
operator's directive ("use the Swift SDK from `iosMain`") — not the directive itself, but the mechanism.

**And it kills `expect class` as the pattern**, which is fortunate, because Kotlin's own docs already steer away:
expect/actual **classes are Beta**, the compiler **warns** without `-Xexpect-actual-classes`, and the docs
recommend *"interfaces and factory functions"* instead.

**The pattern that works** (and is the one `ARCHITECTURE.md` § *Platform drivers* already describes, read
correctly):

```
commonMain:  interface AuthDriver { suspend fun signInWithOtp(...): AuthStep; ... }   // pure Kotlin
androidMain: class AmplifyAuthDriver(...) : AuthDriver    // Amplify Android (Kotlin/JVM) — direct
iosApp/:     class SwiftAuthDriver: AuthDriver  (written in SWIFT)                    // Amplify Swift
             → passed INTO the shared module at startup
```

The Kotlin interface is exported to Objective-C, **Swift implements it**, and the iOS entry point injects it. The
dependency arrow points *into* Kotlin, which is the only direction that works. **This is not a style preference;
it is the difference between a working iOS build and fighting the ObjC bridge.**

### D6 — ⚠ Research recommended dropping Amplify entirely. **Rejected — and here is why, concretely.**

The contract-research agent argued: Cognito's user-pool APIs are unsigned JSON-over-HTTPS, so call them from Ktor
in `commonMain`, get one implementation, no `expect`/`actual`, no Swift bridge. It is a genuinely appealing
argument and it is **wrong for this pool**, for two independent reasons:

1. **SRP.** The app client's flows are `ALLOW_USER_AUTH` / `ALLOW_REFRESH_TOKEN_AUTH` / `ALLOW_USER_SRP_AUTH` —
   **`ALLOW_USER_PASSWORD_AUTH` is deliberately absent**, so the password never goes on the wire. Password sign-in
   **must** therefore use **Secure Remote Password**. Going Ktor-direct means **hand-rolling SRP** — a cryptographic
   protocol, with a big-integer group, a hashed verifier, and a HKDF — in the first slice of the first mobile app.
   That is not a library we are declining to use; it is **cryptography we would be writing ourselves**. The
   alternative (adding `ALLOW_USER_PASSWORD_AUTH`) *puts the customer's password on the wire* and undoes a
   deliberate infrastructure decision. Both branches are worse than a dependency.
2. **The simplification is an illusion.** FR-020 requires tokens in **protected credential storage** — Keychain on
   iOS, Keystore-backed on Android. That is a platform driver **no matter which HTTP client we use**. So the
   `expect`/`actual` boundary does **not** disappear with Ktor-direct; we would merely *also* own token refresh,
   refresh-token rotation semantics, and SRP. We'd trade one boundary we must have for three responsibilities we
   don't want.

The reference the agent found (`Liftric/cognito-idp`, 40 stars) proves it is *possible*, not that it is *wise*.

**Decision: Amplify native SDKs, behind a `commonMain` interface, per D5.** The operator's directive stands — now
for a stated reason rather than by convention.

### D7 — The capability matrix. Both SDKs can do everything, with three asymmetries.

Confirmed against AWS docs and the SDK sources. Passwordless landed in **Amplify Android 2.25.0** and **Amplify
Swift 2.45.0** (both Nov 2024).

| Capability | Android | Swift |
|---|---|---|
| Sign-up **with** password → confirm → auto-sign-in | ✅ | ✅ |
| **Sign-up with NO password, ever** | ✅ `signUp(username, null, options)` | ✅ password omitted |
| **EMAIL_OTP sign-in** | ✅ `AuthFlowType.USER_AUTH` + `preferredFirstFactor(EMAIL_OTP)` | ✅ `.userAuth(preferredFirstFactor: .emailOTP)` |
| `fetchAuthSession(forceRefresh)` | ✅ | ✅ |
| `signOut(global)` | ✅ | ✅ |
| `resetPassword` (start) | ✅ | ✅ |
| `updatePassword` | ✅ | ✅ — **but we must NOT use it** (D8) |

**Passwordless sign-up is first-class at the service level** — Cognito's `SignUp` API: *"To create a user with no
password, omit this parameter."* No throwaway-password hack, on either platform. (Same finding 011 made for web.)

**The three asymmetries the driver interface must absorb:**

1. **Android needs an `Activity`** in the sign-in options (`callingActivity`); iOS has no analogue. → the driver
   takes an opaque `PlatformContext`, supplied per target, even though we ship no passkeys.
2. **Options shapes differ**: Android is a builder with a separate `preferredFirstFactor` setter; Swift puts the
   factor as an **associated value on the enum case** (`.userAuth(preferredFirstFactor: .emailOTP)`). The *flow* is
   identical; only the construction differs. Absorbed inside each implementation — `commonMain` never sees it.
3. **Token-at-rest differs, and this one is a security task** — see D11.

**Always pass the preferred factor.** Omit it and Cognito returns a *factor-selection* step
(`continueSignInWithFirstFactorSelection`), forcing a second `confirmSignIn` round-trip. Web hit this exact thing
(011). Stating the factor skips it.

### D8 — ⚠ `updatePassword` MUST NOT be in the driver — and the escape hatch must be **banned by the build**.

This is the feature's whole reason for existing (spec FR-024), and the mobile surface is where it would be
re-opened.

**Confirmed at the service level**, verbatim from AWS's `ChangePassword` API reference:

> **PreviousPassword** — "The user's previous password. **Required if the user has a password. If the user has no
> password and only signs in with passwordless authentication options, you can omit this parameter.**" · Required: **No**
>
> "Authorize this action with a signed-in user's access token… **Amazon Cognito doesn't evaluate IAM policies**."

So an access token alone is sufficient to **plant a permanent password on a passwordless account**, and **IAM
cannot close it** — only the platform's own gate can. Exactly as 012 argued.

**Amplify's high-level API happens to block it**: both `updatePassword(existingPassword: String, …)` (Android) and
`update(oldPassword: String, to: String)` (Swift) take the old password as a **non-optional String**. But this is a
*type-level accident*, not a security guard — Amplify simply never modelled the passwordless case. **It is not
load-bearing and must not be treated as a defence.**

**The escape hatch is reachable**: `AWSCognitoAuthPlugin.escapeHatch` (Android) / `getEscapeHatch()` (Swift) both
hand you the raw `CognitoIdentityProviderClient`, from which `ChangePassword` **can** be called with
`PreviousPassword` absent.

**Decision.** The driver interface has **no `updatePassword` and no `globalSignOut`** — password writes and
sign-out-everywhere go to the **backend** (D1 routes 4/5/6), which owns the emailed step-up, the breach screening
and the `has_password` bookkeeping. And we add a **build guard** that fails on any reference to
`escapeHatch` / `getEscapeHatch` / a direct `cognitoidentityprovider` import outside the driver's allowlist.

**This is the KMP equivalent of 011's Amplify quarantine (FR-006), and it exists for the same reason: the
dangerous path is reachable, so touching it must be a build failure, not a code-review catch.** 011 also taught us
to *break the guard deliberately to prove it works* (research D11) — that is a task here, not a hope.

### D9 — MFA must stay OFF (it is), or passwordless breaks.

Cognito: *"Amazon Cognito does not support enabling both MFA and passwordless sign-in (including passkeys, SMS OTP,
and email OTP) for the same user."* The pool is `mfa_configuration = "OFF"`. **Recorded so a future "add MFA"
slice knows it is a trade, not an addition.** (Spec already lists MFA as out of scope.)

### D10 — ⚠ There is **no inactivity window**. The spec said something unbuildable; it has been fixed.

AWS, verbatim: *"the refresh token expires 30 days after your application user **signs into** your user pool."*
Validity is measured **from sign-in**, not from last use. **There is no sliding window in Cognito.** And rotation
does not help: with `RefreshTokenRotation` enabled, *"The new refresh token is valid for the **remaining duration
of the original** refresh token."*

So the spec's original **"30 days of inactivity"** was **not implementable**, and worse, the naive reading of it
would have signed out a **daily-active** customer on day 30 — the precise opposite of the intent.

**Decision**: **90 days from sign-in**, delivered on the **dedicated mobile app client** (D3a) — *not* by bumping
the shared web client, which would extend the web session too. Spec FR-019a, US3-2 and SC-020 say **"90 days from
sign-in"**, with the reasoning recorded inline.

**Rotation stays OFF.** Beyond not extending the window, enabling it **disables `REFRESH_TOKEN_AUTH`** in favour of
`GetTokensFromRefreshToken` — and **whether Amplify Android/Swift 2.x use the new API is UNCONFIRMED**. Turning
rotation on could silently break refresh on mobile. → **Spike (S4)**, not a guess.

### D11 — ⚠ Token storage: iOS is secure for free. **Android needs a task.**

FR-020 in one table.

| | Where tokens live | Backups | Verdict |
|---|---|---|---|
| **Amplify Swift** | iOS **Keychain**, data-protection keychain, `kSecAttrAccessibleAfterFirstUnlock`**`ThisDeviceOnly`** | **Excluded by construction** — `…ThisDeviceOnly` items never migrate to a new device and are not in iCloud/iTunes backups | ✅ **secure, zero config** |
| **Amplify Android** | `EncryptedSharedPreferences` (AES256-SIV/GCM) under an **Android Keystore** master key (`amplify_master_key`) | ⚠ **Auto Backup will copy the encrypted files off the device** unless excluded | ⚠ **ACTION REQUIRED** |

**Android task**: exclude Amplify's preference files via `android:dataExtractionRules` / `fullBackupContent`. The
Keystore key is destroyed on uninstall, so a restored blob is undecryptable — but "an attacker gets an encrypted
blob they probably can't read" is **not** what FR-020 says, and it is not a claim worth defending. Exclude them.

**Known Android failure mode, to be designed for rather than discovered**: on devices with broken Keystore
implementations, Amplify throws (`master key … exists but is unusable`) and **recovers by recreating the key —
which silently signs the customer out**. The session state machine therefore needs an *unexpectedly signed out*
path. That is a real state, not an error to swallow.

### D12 — Configuration: **no `amplifyconfiguration.json` at all.** Better than the plan asked for.

The operator's directive was `secrets.properties` → generate `amplifyconfiguration.json` (git-ignored). **We can do
better: no file, on either platform.** Both SDKs accept the config as an in-memory value:

- **Android** — `AmplifyOutputs.fromString(json)` (public `@JvmStatic` factory) → `Amplify.configure(AmplifyOutputs(json), context)`
- **Swift** — `Amplify.configure(with: .data(Data(json.utf8)))`

Android takes a `String`, Swift takes `Data` — but **both take the same raw JSON**, so `commonMain` builds **one**
config string from BuildKonfig constants and hands it to both. One config path, two sinks, **nothing generated,
nothing shipped, nothing to git-ignore.**

(The typed Swift initializer is `internal` — so we do assemble a small JSON string rather than a struct. It is
*file-less*, not *type-safe*. Fine: it lives in one `AmplifyConfig.kt` and never changes.)

Keys needed (auth-only): `version`, `auth.aws_region`, `auth.user_pool_id`, `auth.user_pool_client_id`.

### D13 — BuildKonfig is not merely alive — on AGP 9 it is **the sanctioned answer**.

**AGP 9's KMP library plugin does not implement `BuildConfig`** (it is variant-agnostic — no build types or
flavors), and Google/JetBrains' own AGP-9 migration guidance names **BuildKonfig** as the replacement. Current:
**v0.22.0** (2026-06-24), requires Kotlin ≥ 2.1 — we are on 2.4.0. ✅

**One K2 trap, avoided by construction**: with `targetConfigs`, BuildKonfig emits `expect`/`actual`, and **K2
forbids `expect const val`**. Our config is **identical on both platforms**, so we use **`defaultConfigs` only** —
plain `const val` in common, no trap.

### D14 — ⚠ FR-041 (fail the build on missing config) is **entirely ours**. BuildKonfig will not do it.

BuildKonfig cheerfully bakes in `null` or `""`. The requirement is that a build with missing configuration **dies
at build time naming what is missing** — so the check goes **before** `buildConfigField`, at Gradle
**configuration** time:

```kotlin
val requiredKeys = listOf("COGNITO_USER_POOL_ID", "COGNITO_APP_CLIENT_ID", "COGNITO_REGION",
                          "EDGE_API_BASE_URL", "CORE_API_BASE_URL")
fun config(k: String) = (System.getenv(k) ?: props.getProperty(k))?.takeIf { it.isNotBlank() }
val missing = requiredKeys.filter { config(it) == null }
if (missing.isNotEmpty()) throw GradleException("Missing required build configuration: ${missing.joinToString()} …")
```

Three properties that matter: it throws **before a line compiles**; it names **every** missing key at once and says
where to get them; and `requiredKeys` is a **literal list** — greppable, matching Principle VI's explicit-wiring
rule. Env vars win over the file, so CI never needs a checked-in file. Ship a committed `secrets.properties.example`.

Plus a guard mirroring the repo's existing secret sweep: **assert no key in `requiredKeys` matches
`/SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL/i`** — so FR-042 is enforced by the build, not by memory.

---

## Part C — The two Principle II collisions

### D15 — The API contract: **generate the DTOs, snapshot the schema.** TS stays the source of truth.

`packages/shared-types` is 417 lines of hand-written TS, consumed by the web apps *and* the Node backend. A Kotlin
app cannot import it, and hand-copying it is **exactly the copy-paste Principle II prohibits**.

Options weighed: OpenAPI-as-SSOT (the official openapi-generator `multiplatform` target is pinned to **Ktor
1.6.7 / kotlinx 1.2.1** — ~4 years stale; the maintained alternative has 16 stars → **two generators to babysit**);
a neutral IDL (Smithy/protobuf → strictly worse here); hand-write + fixture test (**fails silently**: a golden-JSON
test still passes when the backend adds a field the Kotlin doesn't know about, unless `ignoreUnknownKeys = false`
*and* the fixtures are regenerated — two conventions a tired dev can break).

**Decision — a two-CLI pipeline whose output is committed:**

```
packages/shared-types/
  src/*.ts                  ← unchanged. STILL the single source of truth.
  contract/schema.json      ← COMMITTED. ts-json-schema-generator output.
  contract/Dto.kt           ← COMMITTED. quicktype output (kotlinx.serialization).
```

`pnpm contract:check` = regenerate + `git diff --exit-code`. **The day someone adds a field to the TS type and
forgets, CI goes red with the field named in the diff.** There is no state in which the Kotlin is stale and green.

**Why this and not "codegen rots":** the distinction that actually matters is **not** codegen-vs-hand-written, it is
**"is the generator load-bearing at build time, and can I read its output?"** Here there is **no Gradle plugin**,
nothing in the build graph — two CLIs invoked by pnpm, emitting **committed, readable, hand-editable files**. If
both tools vanished tomorrow we lose a script, not a codebase. And if quicktype mangles one union, we hand-fix
that one type and the schema snapshot keeps guarding it — **the escape hatch degrades to hand-written for one
type, not for the whole contract.**

Plus **one runtime guard**, because codegen proves *shape agreement*, not *reality agreement*: the app's production
`Json` uses `ignoreUnknownKeys = true` (be liberal), but the **test** `Json` uses `ignoreUnknownKeys = false`
against fixtures recorded from the live dev endpoint — so a backend field the contract doesn't know about **fails
the test**. Same fixtures, asserted by both the TS and Kotlin suites.

### D16 — Design tokens: **generate `EffyTokens.kt` from `tokens.css`.** No Style Dictionary.

`packages/design-system` has **no machine-readable token source** — tokens exist **only** as CSS custom properties
in `tokens.css` (`:root` + `.dark`, ~24 flat `--name: #hex` pairs, plus `--radius`). There is no `tokens.ts`, no
JSON, no `tailwind.config.*` (Tailwind v4 is CSS-first).

Style Dictionary is real, current (5.5.0), and **does** still ship a `compose/object` formatter — but adopting it
means **inverting the source of truth**: SD reads JSON/DTCG and *emits* CSS, so `tokens.css` (which three shipped
web surfaces depend on) would have to become a generated file. **For 122 lines of flat hex.** And its
`compose/object` format emits a flat `val` bag, **not** a Material 3 `ColorScheme` — we'd hand-write the two
schemes anyway. The advantage over a script is smaller than it looks.

**Decision — a ~60-line Node script parsing `tokens.css` → committed `EffyTokens.kt`** (a `Color` object + light
and dark `ColorScheme`). `tokens.css` stays the SSOT (zero migration; the web surfaces are untouched), and Compose
becomes a **derived artifact that cannot drift** because it is regenerated and `git diff --exit-code`-checked in
CI. Same discipline as D15.

The shadcn→M3 name mapping (`--card`→`surface`, `--border`→`outline`, `--destructive`→`error`) is a **fixed lookup
table in the script**. M3 slots the CSS has no answer for (`secondaryContainer`, `tertiary`) are **left at the M3
default in the script** — *never invented in Kotlin*, which would reintroduce the second source of truth we are
trying to kill.

**Two facts recorded so nobody "fixes" them later:**
- **`#047857`** (the "fill" token in CLAUDE.md and the brief) **does not exist in `tokens.css`** — Amendment D2
  removed every green-tinted surface. `grep -rn 047857` over source: **zero hits.** Jade `#0FB57E` is the live
  accent; `#047857` is a **documented-but-unused** brand token. The mobile theme uses what is real.
- **There is no spacing or type scale to consume.** The design system inherits Tailwind's defaults. Compose will
  therefore define its own spacing/type scale — **the one place this app legitimately cannot derive from the web**,
  and it is recorded as such rather than pretended away.

**When to switch to Style Dictionary**: a third consumer (SwiftUI-native tokens, an email template system), or
~200+ tokens, or Figma-driven tokens. Not today.

---

## Part D — Compose, iOS, and the honest claim

### D17 — ⚠ Shared Compose **cannot** deliver Apple HIG. We are shipping Material 3 anyway, and saying so.

The most uncomfortable finding, and the one most worth writing down.

**What CMP 1.11 genuinely gives iOS** (confirmed): native scroll physics and rubber-band overscroll, **native
back-swipe by default**, a real VoiceOver/accessibility bridge (`testTag` → `accessibilityIdentifier`), Dynamic
Type, concurrent rendering on by default, and — new in 1.11, experimental — **UIView-backed native text input**
(real caret, native selection handles, system context menu).

**What it does not give**: Apple's *design language*. Every Material 3 control (buttons, switches, sheets, alerts,
pickers, nav bars, toolbars), the Roboto-shaped type scale, Material ripple, Material motion — and, decisively,
**anything Liquid Glass**. iOS 26 paints Liquid Glass **only** for system-drawn `TabView` / `NavigationStack` /
toolbars. **A Compose-drawn tab bar is, by construction, a 2024-looking tab bar on a 2026 iPhone.**

JetBrains say so themselves. Their own guide — *"Liquid Glass in a Compose Multiplatform app"* — recommends
**SwiftUI owns the shell, Compose renders screen content**, because those effects *"are rendered by the system"*
and cannot be reproduced in Compose. **The vendor's answer to "how do I follow HIG" is: don't render your chrome
in Compose.**

**`compose-cupertino` is not the escape.** Last release **`0.1.0-alpha04`, April 2024** — pinned to **CMP 1.6.1 /
Kotlin 1.9.23** (we are on 1.11.1 / 2.4.0), its own docs warn all APIs may be dropped without deprecation. Taking
an alpha dependency two major versions behind, **for the entire visual identity of the public app**, is not a
trade worth making. **Rejected.**

**Decision (operator, 2026-07-14): pure shared Compose + Material 3 on both platforms**, and **no constitution
amendment**. This is a **knowing Principle V deviation**, recorded in the plan's Complexity Tracking with a named
closing slice. Two reasons it is a defensible *first* move rather than a defeat:

- **It is reversible for the price of the UI layer only.** ViewModels, use cases, repositories and the auth driver
  all live in `commonMain`. Retrofitting the SwiftUI shell later touches **presentation and nothing else** — which
  is precisely what Clean Architecture is *for*. Saying that out loud is what de-risks the decision.
- **The honest claim is not nothing**: *"iOS gets native scroll physics, native back-swipe, native text editing, and
  native accessibility. Screen content is Compose, themed with Effy's tokens. We do **not** claim HIG component
  parity, and iOS chrome is **not** Apple's."* That is true, verifiable, and unembarrassing. **"One shared Compose
  UI that follows Apple HIG" is a lie, and we will not write it.**

### D18 — Navigation 3: stable, CMP-ready, and it is the *right* tool for the auth-graph swap.

**Confirmed**: AndroidX Navigation 3 is **stable** (1.1.4); for CMP, JetBrains state *"Navigation 3 is
production-ready starting with Compose Multiplatform 1.10"* — `org.jetbrains.androidx.navigation3:navigation3-ui`.

The reason to take it here is not novelty: **in Nav3 the back stack IS your state** — a
`SnapshotStateList<NavKey>` you own. FR-002b's session-driven auth-graph ↔ protected-graph swap becomes
`backStack.clear(); backStack.add(Home)`. In Navigation 2.x this is `popUpTo`/`inclusive` gymnastics and the
classic *"Back returns you to the login screen after signing in"* bug. It composes with our unidirectional-state
rule instead of fighting it.

**⚠ The one trap that would ship green on Android and crash on iOS**: Android's **reflection-based** route
serialization **does not work on iOS**. Polymorphic serializers must be **registered explicitly** via
`SavedStateConfiguration`. Miss it → works on Android, crashes on iPhone. → **Spike (S3).**

### D19 — Version corrections to the scaffold.

| Pin | Today | Change | Why |
|---|---|---|---|
| `androidx-lifecycle` | **`2.11.0-beta01`** | → **`2.10.0`** | A **beta** lifecycle library under a stable Compose runtime is a bad trade; 2.10.0 is the version JetBrains document against CMP. |
| `material3` | `1.11.0-alpha07` | keep, **flagged** | The CMP-aligned Material 3 line is alpha by nature. Watch it. |
| iOS targets | `iosArm64`, `iosSimulatorArm64` | ✅ correct | CMP 1.11 **removed `iosX64`**. The scaffold is already right. |
| iOS deployment target | — | **≥ 14.0** | CMP 1.11 raised the floor 13.0 → 14.0. |
| Kotlin | 2.4.0 | ✅ | Clears BuildKonfig (≥2.1), SKIE, Nav3. |

### D20 — Ktor: two clients, and one gotcha that causes an infinite loop.

Two base URLs, because **the routing law (FR-036) has two backends**: `core-api` (commerce — *nothing to call yet*)
and `edge-api` (account). `ARCHITECTURE.md`: *"An app talking to more than one backend builds one client per base
URL."* We build the factory for both now and only wire `edge-api`, so the law is structural rather than a comment.

Gotchas, confirmed:
- **`expectSuccess = true`** — in Ktor 3.x a non-2xx does **not** throw by default. The #1 "why is my error handling
  never firing" bug.
- **`markAsRefreshTokenRequest()`** — without it, a 401 from the refresh call re-enters `refreshTokens` → **infinite
  loop**. Moot for us (D21) but recorded.
- **`sendWithoutRequest`** — without it, the first request of every session eats a wasted 401.
- **Logging**: never `LogLevel.BODY` in release (PII + tokens to logcat/Console), and `sanitizeHeader` the
  `Authorization` header even in debug. FR-038 is a build setting here, not a good intention.

### D21 — ⚠ Do **not** let Ktor refresh the token. Amplify owns the session.

Ktor's `Auth.bearer` plugin has a `refreshTokens` block, and the obvious move is to POST to Cognito from it. **Do
not.** Amplify already owns the refresh token and refreshes on `fetchAuthSession`. **Two independent refresh
mechanisms racing over one refresh token is a real and ugly bug class** — and with rotation it is worse.

**Decision**: `loadTokens` / `refreshTokens` **delegate to the `AuthDriver`** (→ `fetchAuthSession(forceRefresh)`),
never to raw HTTP. One owner of the session, and it is Amplify.

---

## Part E — Testing

### D22 — What can honestly be tested, and what needs a device.

- **Unit (`commonTest`)**: ViewModels (immutable-state transitions), DTO↔domain mappers, the config-string builder,
  password-policy length checks. Fast, real coverage of the state machine.
- **Contract (`commonTest`)**: decode the **recorded dev fixtures** with `ignoreUnknownKeys = false` (D15). This is
  the drift alarm.
- **What cannot be unit-tested and must not be pretended**: that Amplify Android and Amplify Swift **behave
  identically**. Two SDKs, two languages, one interface — "identical" is a claim, and it is only true if it is
  **exercised on both platforms**. Hence the device matrix in `quickstart.md`, and hence the spikes below.

---

## The spikes — settle these before / during implementation, do not guess

| # | Question | Why it can change the design |
|---|---|---|
| **S1** | **Inherited from 012 (T001).** Does `ChangePassword`-without-`PreviousPassword` actually succeed on *our* pool? | It is the premise of FR-024. Confirmed at the API-docs level (D8); **must be proven live.** |
| **S2** | **Inherited from 012 (T002).** What does "Forgot password?" do **today** for a passwordless customer? | That path is **live right now** and its behaviour is unknown. |
| **S3** | Nav3 on a **real iPhone**: polymorphic `NavKey` serialization + the auth-stack swap + the edge-swipe animation. | Reflection-based routes **crash on iOS** (D18). Green on Android proves nothing. |
| **S4** | Does Amplify Android/Swift 2.x refresh via `GetTokensFromRefreshToken` (rotation-compatible) or `REFRESH_TOKEN_AUTH`? | Determines whether refresh-token rotation can **ever** be enabled. Until settled: **rotation stays OFF.** |
| **S5** | Amplify `updatePassword` with an **empty-string** old password on a passwordless user: dropped (→ the attack) or `InvalidParameterException`? | Decides whether the vulnerability is reachable **from our own app**, which is exactly what D8's build guard is banning. One line to test. |
| **S6** | The exact Amplify shared-prefs filenames to exclude from Android Auto Backup. | FR-020. Amplify's docs say *"exclude"* and **do not name the files**. |

---

## Summary — the rules this slice is bound by

1. **The backend already exists.** This app is `edge-api/customer`'s second client (D1).
2. **Two tokens on account routes**: ID token in `Authorization`, access token in `X-Effy-Access-Token` (D2).
3. **Amplify native, behind a `commonMain` interface** — Swift implements it and is injected in (D5, D6). **Not**
   `expect class`. **Not** hand-rolled SRP.
4. **`updatePassword` and `globalSignOut` are not in the app.** They are the backend's, and the escape hatch is
   **banned by the build** (D8).
5. **No `amplifyconfiguration.json`.** One config string from BuildKonfig, two sinks (D12).
6. **A missing config key fails the build, naming itself** (D14).
7. **The Kotlin DTOs and the Compose theme are GENERATED and COMMITTED**, and CI fails on drift (D15, D16).
8. **iOS is Material 3, and we say so.** A recorded Principle V deviation, reversible at the price of the UI layer
   (D17).
9. **Session: 90 days from sign-in.** There is no inactivity window (D10).
10. **Amplify owns the session; Ktor never refreshes** (D21).
</content>
