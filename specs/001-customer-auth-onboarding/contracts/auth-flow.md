# Auth Flow Contract: Passwordless EMAIL_OTP (Customer Pool)

This is the contract between the **KMP app** and **Cognito**, and between the **Go service** and
the **token**. It is not an HTTP API we own — Cognito owns the IdP endpoints — but the sequence
and claim assertions below are a contract the implementation MUST honor (Principle IV).

All Cognito calls are unauthenticated JSON POSTs to
`https://cognito-idp.{region}.amazonaws.com/` with headers:
`Content-Type: application/x-amz-json-1.1` and
`X-Amz-Target: AWSCognitoIdentityProviderService.<Action>`. The app client is **public (no
secret)**, so **no SigV4** signing is required.

> For the **effy dev** environment, `{region}` = **`ap-southeast-1`** (read from config/SSM,
> never hardcoded — it appears in the issuer URL, the JWKS endpoint, and the SES endpoint). The
> existing `ef` platform is in `ap-southeast-2`; reverting later is a single config change.

---

## 1. Sign-up / sign-in (unified) sequence

```text
App                         Cognito (customer pool)              Lambda triggers        SES
 │  enter email                                                                          
 │  InitiateAuth(CUSTOM_AUTH, USERNAME=email) ─────────────────>│ DefineAuthChallenge   
 │                                                               │  → CUSTOM_CHALLENGE   
 │     (if UserNotFoundException)                                                         
 │  SignUp(USERNAME=email, PASSWORD=<random,discarded>) ────────>│ PreSignUp             
 │                                                               │  auto-confirm+verify  
 │  InitiateAuth(CUSTOM_AUTH, USERNAME=email) ─────────────────>│ CreateAuthChallenge   
 │                                                               │  gen OTP, set expiry ─────> email OTP
 │  <─────────── Session + CUSTOM_CHALLENGE ─────────────────────                         
 │  enter code                                                                            
 │  RespondToAuthChallenge(CUSTOM_CHALLENGE, ANSWER=code,Session)>│ VerifyAuthChallenge  
 │                                                               │  answerCorrect?       
 │                                                               │ DefineAuthChallenge   
 │                                                               │  → issueTokens / fail 
 │  <───────── AuthenticationResult {Access,Id,Refresh} ─────────  (on success)          
 │  persist tokens → secure storage                                                       
```

### Request/response shape (key fields)

- **InitiateAuth** → req `{ AuthFlow: "CUSTOM_AUTH", ClientId, AuthParameters: { USERNAME } }`;
  resp `{ ChallengeName: "CUSTOM_CHALLENGE", Session, ChallengeParameters }`.
- **SignUp** (first-time only) → req `{ ClientId, Username, Password, UserAttributes:[{email}] }`;
  on existing user → `UsernameExistsException` (treated as "proceed to sign-in").
- **RespondToAuthChallenge** → req `{ ChallengeName: "CUSTOM_CHALLENGE", ClientId, Session,
  ChallengeResponses: { USERNAME, ANSWER } }`; success resp
  `{ AuthenticationResult: { AccessToken, IdToken, RefreshToken, ExpiresIn, TokenType } }`;
  wrong-but-retryable → another `CUSTOM_CHALLENGE` + new `Session`; exhausted → `NotAuthorizedException`.

### Trigger behavior contract

| Trigger | MUST do |
|---------|---------|
| `PreSignUp` | Set `autoConfirmUser=true`, `autoVerifyEmail=true`. No password is ever used by the customer. |
| `DefineAuthChallenge` | If no challenge yet → `CUSTOM_CHALLENGE`. If last answer correct → `issueTokens=true`. After 3 wrong answers → `failAuthentication=true`. |
| `CreateAuthChallenge` | Generate 6-digit OTP; put it in `privateChallengeParameters.answer` + `expiresAt`; **never** in `publicChallengeParameters`; send via SES. |
| `VerifyAuthChallengeResponse` | `answerCorrect = (submitted == private OTP) AND now < expiresAt`. |

### Resend / expiry / errors → UI states (FR-010/011/012/014)

| Condition | Cognito signal | UI message |
|-----------|----------------|-----------|
| Wrong code (retryable) | new `CUSTOM_CHALLENGE` | "That code isn't right — try again." |
| Code expired | `answerCorrect=false` (expiry) | "This code has expired. Request a new one." |
| Too many attempts | `NotAuthorizedException` after fail | "Too many attempts. Request a new code." |
| Resend | client re-runs `InitiateAuth` (≥30 s since last) | "We sent a new code." (prior code invalid) |
| Invalid email format | client-side, pre-call | "Enter a valid email address." |

---

## 2. Session refresh (app launch / token expiry) — FR-007, US3

```text
App launch → read refresh token from secure storage
   ├─ none → SIGNED_OUT
   └─ present → InitiateAuth(REFRESH_TOKEN_AUTH, REFRESH_TOKEN) 
        ├─ AuthenticationResult → SIGNED_IN (fresh access token)
        └─ NotAuthorizedException → clear storage → SIGNED_OUT (graceful)
```

## 3. Sign out — FR-008, FR-009

Clear the token set from secure storage (and optionally call `GlobalSignOut` with the access
token to revoke server-side). App returns to SIGNED_OUT; any protected call now lacks a token.

---

## 4. Token → backend contract (what the Go service asserts)

The app sends `Authorization: Bearer <AccessToken>` to `GET /v1/profile`. The service MUST:

1. Verify RS256 signature against the **customer pool** JWKS (`.../{poolId}/.well-known/jwks.json`,
   cached + auto-refreshing).
2. Assert claims:
   - `iss` == `https://cognito-idp.{region}.amazonaws.com/{customerPoolId}`
   - `token_use` == `access`
   - `client_id` == the **customer** app client id
   - `exp` / `nbf` valid (with small clock skew leeway)
3. Extract `sub` → `cognito_sub`, and the customer's email (from the access token's `username`
   /linked id token claim as available; email is also persisted on first lazy-create).
4. On any failure → **401** (`{code:"unauthorized"}`); never leak which check failed.

**Isolation guarantee**: a token minted by the driver/store/admin pools fails step 2 (`iss` /
`client_id` mismatch) → 401. No cross-pool acceptance, no proxy.
