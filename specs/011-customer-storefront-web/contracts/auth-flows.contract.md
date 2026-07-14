# Contract — The three credential routes, and account linking

**Binding.** Governed by constitution **v1.7.0** Principle IV (amended by this slice). All three routes
converge on **one Cognito profile → one `sub` → one `public.customer` row**.

## Pool configuration (customer pool only)

| Setting | Value | Note |
|---|---|---|
| `sign_in_policy.allowed_first_auth_factors` | `["EMAIL_OTP", "PASSWORD"]` | **Already the case today** — the module appends `PASSWORD` because the CreateUserPool API refuses to omit it, and per AWS that entry "includes both the plain-password and SRP flow options". **No change needed.** |
| app client `explicit_auth_flows` | `["ALLOW_USER_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]` | Adds SRP. **In-place update.** |
| `supported_identity_providers` | `["COGNITO", "Google"]` | In-place. |
| `allowed_oauth_flows` | `["code"]` (PKCE, public client) | |
| `allowed_oauth_scopes` | `["openid", "email", "profile"]` | |
| `admin_create_user_config.allow_admin_create_user_only` | `false` | Self-signup — customer only. |
| RBAC groups | **none** | Principle IV; also a cookie-size safety measure (**D21**). |
| `write_attributes` | **must exclude `email`** | Or a signed-in user could change their email to a victim's — the adjacent Cognito takeover. |
| `lifecycle` | `prevent_destroy = true` | Seatbelt: a replaced pool destroys every account. |

**Driver / shop / admin pools are untouched** — strictly `EMAIL_OTP`, no password flow, no IdP, no
self-signup. Their app clients keep `ALLOW_USER_AUTH` only.

## Route (a) — Email + password

```ts
// sign-up
await signUp({ username: email, password, options: { userAttributes: { email } } })
await confirmSignUp({ username: email, confirmationCode })   // code to the verified email
// sign-in — SRP: the password never goes on the wire
await signIn({ username: email, password, options: { authFlowType: 'USER_SRP_AUTH' } })
```

Recovery (FR-014): `resetPassword` → code to the verified email → `confirmResetPassword`.

## Route (b) — Email OTP, no password ever set

**`SignUp` legitimately omits `Password`** — this is documented Cognito behaviour, not a workaround
(research **D14**). It works **only from our own SDK-driven form**; Cognito's hosted sign-up page always
requires a password. We build our own form regardless.

```ts
await signUp({ username: email,
  options: { userAttributes: { email }, autoSignIn: { authFlowType: 'USER_AUTH' } } })
await confirmSignUp({ username: email, confirmationCode })   // → COMPLETE_AUTO_SIGN_IN
await autoSignIn()                                           // register + verify + sign in: ONE code
```

Sign-in:

```ts
const { nextStep } = await signIn({ username: email,
  options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } })
// nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'
await confirmSignIn({ challengeResponse: code })             // → DONE
```

Omitting `preferredChallenge` returns `CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION` with
`availableChallenges` — the basis of a "how would you like to sign in?" screen. Note the **double
`confirmSignIn`** in that path: once to *select the factor*, once to *submit the code*.

Requires `aws-amplify >= 6.10.0`; we pin `^6.18.0`.

## Route (c) — Google

**Requires a Cognito domain.** There is no pure-SDK federation path — it is an OAuth redirect
(`/oauth2/authorize` → Google → `/oauth2/idpresponse`). **Dev uses a prefix domain**
(`<prefix>.auth.ap-southeast-2.amazoncognito.com`), which needs no certificate; a *custom* domain is
CloudFront-fronted and would require an **ACM certificate in `us-east-1`** — the carve-out CLAUDE.md
already documents for 010.

The customer never sees a Cognito-branded page: we deep-link `identity_provider=Google` so "Continue
with Google" goes **straight to Google's consent screen**.

```ts
await signInWithRedirect({ provider: 'Google' })
// on /callback:  import 'aws-amplify/auth/enable-oauth-listener'  ← or nothing happens
```

**Attribute mapping is mandatory and security-critical:**

```hcl
attribute_mapping = {
  email          = "email"
  email_verified = "email_verified"   # ← WITHOUT THIS, THE WHOLE SCHEME IS UNSAFE
  username       = "sub"
  given_name     = "given_name"
  family_name    = "family_name"
}
```

## Account linking — the security control (FR-011, FR-012)

Cognito creates a **separate** `Google_<sub>` profile unless told otherwise. A **pre-sign-up Lambda
trigger** prevents that duplicate.

On `triggerSource === 'PreSignUp_ExternalProvider'`:

```
1. REFUSE unless event.request.userAttributes.email_verified === true.   ← the gate
2. ListUsers(filter: email = <that email>) → the native profile.
3. If found:      AdminLinkProviderForUser(
                     DestinationUser = { ProviderName: 'Cognito', ProviderAttributeValue: <native username> },
                     SourceUser      = { ProviderName: 'Google', ProviderAttributeName: 'Cognito_Subject',
                                         ProviderAttributeValue: <google sub> })
4. If not found:  AdminCreateUser (no password, suppress invite) → THEN link, as in 3.
5. autoConfirmUser / autoVerifyEmail as appropriate; return the event.
```

**The native profile is ALWAYS the `DestinationUser`.** This is what preserves the `sub` — and therefore
the `public.customer` join key — across every credential route. There is **no retroactive merge**:
linking requires that the federated user *not yet exist*, so if Cognito is ever allowed to auto-create
the `Google_…` profile first, that person is permanently two accounts.

### ⚠ The attack this prevents

Linking on an email match **alone** is a complete account-takeover primitive:

> An attacker registers `victim@effy-customer.com` at an IdP that does not verify email ownership,
> federates into our pool, the trigger matches the email and links the attacker's identity into the
> victim's profile — and the attacker now receives JWTs **carrying the victim's `sub`**. Full takeover:
> no password, no OTP, no trace.

AWS: *"it is critical that it only be used with external IdPs and provider attributes that have been
trusted by the application owner."*

**Therefore, all of the following, not some:**

1. **Link only when the IdP asserts `email_verified === true`.** (Hence the mapping above. Without it
   the merged profile also lands with `email_verified = false`, which separately locks the customer out
   of password recovery.)
2. **Link only into a native profile whose own email is verified** — guaranteed by construction here;
   assert it anyway.
3. **Google is the only federated provider.** Adding a generic OIDC IdP turns the email-match link into
   an ACL. This is why "other providers" is explicitly out of scope, and it is a security boundary, not
   a scoping convenience.
4. **`email` is not client-writable** (`write_attributes` excludes it).
5. **Key on `sub`, never on email.**

### ⚠ SPIKE — `AliasExistsException` (research D17)

Because `username_attributes = ["email"]`, the email is a sign-in alias and must be unique. Linking a
federated identity to an existing native profile with the same email is **widely reported to raise
`AliasExistsException` and fail the customer's *first* Google sign-in** — the link *is* created, and the
*second* attempt succeeds. **AWS documentation neither confirms nor refutes this.**

This is the highest-risk unknown in the slice and it lands squarely on FR-011. **It must be reproduced
in dev before the sign-in UI is finalized.** If it fires, fallbacks in order: (a) transparently retry
the redirect once on the callback; (b) move linking out of band (an explicit "connect Google" from an
already-authenticated session).

**Second spike**: whether a customer who **never had a password** can set one via the forgot-password
flow. Undocumented. If not, the supported path is an authorized `AdminSetUserPassword` after an
OTP-authenticated session — the same Cognito-first admin-write shape as 006/009.

## Abuse protection (FR-016)

Cognito's **per-user** throttles are the real brake and are not adjustable: `ResendConfirmationCode`
**5/user/hour**; `ConfirmSignUp` 15/user/hour; `ForgotPassword` 5–20/user/hour; **email OTP messages
5–20 per address per hour, per requester IP**. We add an **app-level cooldown** on "send me a code".

**Threat protection** (breached-password detection, adaptive auth) is **`PLUS`-tier only** — dev runs
`ESSENTIALS`. Since route (a) introduces **passwords to a public consumer pool for the first time**,
PLUS's compromised-credentials check should be priced before production. The tier change is an
**in-place** update, so it is a cost decision, not an architectural one.
