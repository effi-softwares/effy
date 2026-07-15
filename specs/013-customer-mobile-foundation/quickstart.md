# Quickstart — 013 Customer Mobile Foundation

**Audience**: the operator, running everything that touches live AWS or a real device. Claude writes all the code;
this is the run/validate guide, not an implementation guide.

**Definition of done** (spec § Clarifications): the app **builds and runs on an Android device/emulator and an iOS
device/simulator**, and completes every flow **against the real dev environment**. No store enrolment, no signing
identities, no TestFlight/Play distribution.

---

## 0. Prerequisites — a reachable backend (deployed OR local)

This app has no backend of its own; it calls `edge-api/customer` (011/012). That backend can be **deployed** or
**run locally** — a physical phone reaches either. **Local is the recommended dev path** and mirrors how `core-api`
already works (local-Docker-only by decision).

**What is genuinely required, regardless of path:**
- The **customer Cognito pool** — this is real dev AWS and already exists (the app authenticates directly against
  Cognito; there is no local substitute). Pool id / client id from `make output ENV=dev`.
- The **customer table + `has_password` migration** applied to whatever DB the edge-api points at.
- A working **email inbox** for OTP + the step-up code. *(The built-in Cognito sender is fine for dev volume; SES
  production access / `mail-verify` is a go-live concern, not a dev blocker — ignore it until you choose to.)*

### Path A — local edge-api + ngrok (recommended for dev)

```bash
make db-up ENV=dev                              # apply the 011/012 migrations to your dev/local DB
make edge-offline SERVICE=customer ENV=dev &    # serverless-offline — the customer routes, locally
ngrok http 3001                                 # public https URL the phone can reach (match edge-offline's port)
curl -s http://localhost:3001/customer/healthz  # → {"status":"ok","service":"customer"}
```

Put the **ngrok https URL** in `secrets.properties` as `EDGE_API_BASE_URL` (§ 1). ⚠ A free ngrok URL changes each
session — and `EDGE_API_BASE_URL` is **build-time** (BuildKonfig), so a new URL means a rebuild. A reserved/paid
ngrok domain avoids the churn.

### Path B — deployed edge-api (for a shared/QA environment)

```bash
make apply ENV=dev                              # incl. THIS slice's refresh_token_validity 30→90 (in-place)
make db-up ENV=dev
make edge-deploy SERVICE=customer ENV=dev
curl -s https://edge-api.dev.effyshopping.com/customer/healthz   # → {"status":"ok","service":"customer"}
```

**Toolchain (both paths):** a **JDK 17+**, **Xcode 26 / iOS 26 SDK** (iOS deployment target ≥ 14), an Android SDK.

---

## 1. Configuration — no secrets in the tree

```bash
cd apps/customer-mobile
cp secrets.properties.example secrets.properties        # git-ignored; the example is committed
make output ENV=dev                                     # prints the pool id, client id, endpoint
```

Fill `secrets.properties` from `make output` (values also in SSM `/effy/dev/auth/customer/*` and
`/effy/dev/edge/api_endpoint`):

```properties
COGNITO_USER_POOL_ID=ap-southeast-2_xxxxxxxxx
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=ap-southeast-2
EDGE_API_BASE_URL=https://edge-api.dev.effyshopping.com
CORE_API_BASE_URL=http://localhost:8080          # commerce; nothing to call yet
```

**None of these is a secret** — they are *names*. The app client has **no client secret** (`generate_secret =
false`), which is why there is nothing here an attacker could use (data-model § 7).

**Prove FR-041** — a missing key fails the build, loudly:

```bash
# temporarily blank COGNITO_APP_CLIENT_ID, then:
./gradlew :shared:assemble
# EXPECT: build fails at configuration time —
#   "Missing required build configuration: COGNITO_APP_CLIENT_ID …"
# NOT a compiled app that misbehaves at runtime.
```

---

## 2. The generated artifacts — regenerate and confirm no drift (Principle II)

```bash
pnpm --filter @effy/shared-types contract:gen      # shared-types → contract/schema.json + Dto.kt
pnpm --filter @effy/design-system tokens:gen       # tokens.css   → compose/EffyTokens.kt
git diff --exit-code packages/shared-types/contract packages/design-system/compose
# EXPECT: clean. A non-empty diff means the Kotlin drifted from its TS/CSS source — commit the regenerated files.
```

This is the whole of the Principle II guarantee: **the Kotlin cannot be stale and green.** CI runs the same two
commands with `--exit-code`.

---

## 3. Build and run

```bash
make android-run ENV=dev        # or open in Android Studio; installs to the connected device/emulator
make ios-run ENV=dev            # or open iosApp/ in Xcode; runs on the simulator/device
```

**Prove the escape-hatch guard works — by breaking it** (the 011 lesson, D8):

```bash
# add a reference to `getEscapeHatch()` somewhere in shared/, then:
make mobile-guard
# EXPECT: build FAILS naming the offending file. Then remove it and confirm the guard passes.
# A guard you never saw fail is a guard you cannot trust.
```

---

## 4. Automated tests (no device needed)

```bash
make mobile-test ENV=dev
# runs commonTest: reducers/ViewModels, DTO↔domain mappers, the initials function (every name case),
# the config builder, and the CONTRACT tests (fixtures decoded with ignoreUnknownKeys = false).
```

Refresh the fixtures from the live backend when the contract changes:

```bash
make mobile-fixtures ENV=dev    # hits dev /customer/v1/me etc.; both TS and Kotlin suites assert against these files
```

---

## 5. The device matrix — the part that cannot be faked (SC-001)

**"Two SDKs behave identically" is a claim until you exercise it.** Run **every** flow on **both** an Android device
and an iOS device.

| Flow | Steps | Pass |
|---|---|---|
| Guest home | fresh install → open | Usable, no sign-in prompt; honest empty state; **zero** fake products; dark mode follows the device (SC-002) |
| Deferred sign-in | as guest, tap **Account** | Sign-in demand raised **here and nowhere else**; on success → Account; on decline → browsing, nothing lost (FR-002b) |
| Register (password) | name + email + password | Signed in **immediately**, one record (SC-003) |
| Register (OTP) | name + email, code route | Signed in immediately; **never** asked to set a password (SC-004) |
| Session persistence | sign in → force-quit → reopen | **Still signed in, zero interactions** (SC-005) |
| One record across surfaces | sign in on phone with a customer who exists on web | **One** record, not two (SC-010) |
| Name + avatar | change name; check avatar for two/one/no name, non-Latin, emoji | Greeting updates without re-login; **zero** blank/mangled/email-derived initials (SC-013) |
| Sign out | from any screen | ≤ 2 interactions; afterwards **no usable token on the device** — verify by inspection (SC-012) |

---

## 6. The adversarial proofs — demonstrated, not asserted (SC-006, SC-007)

These are the reason the slice exists. **Perform them, do not reason about them.**

- **SC-006 — cannot set a password from a bare session.** Sign in as an OTP-only customer. Hand the unlocked,
  signed-in phone to a second person **who does not have the account's email**. They attempt to set a password.
  **It must be impossible** — the emailed code is required, verified server-side in the same request, with no stored
  grant to capture (FR-024). If they can complete it, the slice has failed its one job.
- **SC-007 — cannot change a password without the current one.** As a password customer, attempt a change without
  the current password. **Refused**, even holding a valid session (FR-025).
- **SC-019 — password write signs out this device.** Set or change a password. **The app returns to sign-in**, and
  the same customer signs in with the password they just chose. Confirm the email arrived and contains **no link**.

---

## 7. The spikes — settle before sign-off (research § The spikes)

| # | Prove |
|---|---|
| **S1** | On our pool, `ChangePassword`-without-previous **actually** behaves as the API docs say (FR-024's premise). |
| **S2** | What "Forgot password?" does **today** for a passwordless customer (that path is live now). |
| **S3** | Nav3 polymorphic routes + the auth-stack swap + edge-swipe **on a real iPhone** — green on Android proves nothing. |
| **S4** | Whether Amplify's refresh is rotation-compatible (`GetTokensFromRefreshToken`) — until settled, **rotation stays OFF**. |
| **S5** | Amplify `updatePassword` with an **empty-string** old password: dropped (→ the attack) or `InvalidParameterException`? |
| **S6** | The exact Amplify shared-prefs filenames to exclude from Android Auto Backup (FR-020). |

---

## 8. Sign-off

- [ ] O1 — `make apply ENV=dev`: `refresh_token_validity` 30→90 applied **in-place** (aborted if replace).
- [ ] O2 — 011/012 backend deployed; `/customer/healthz` green; **SES sends**.
- [ ] Every § 5 row passes on **both** platforms.
- [ ] Every § 6 adversarial proof passes.
- [ ] All six spikes settled; none changed the design (or, if one did, the spec/plan were updated first — Principle I).
- [ ] `docs/audiences/customer-capabilities.md` mobile column filled; **no unstated cell** (FR-044, SC-018).
- [ ] The two recorded deviations (Principle V iOS chrome; Principle VII telemetry) still hold, each with its named
      closing slice.
</content>
