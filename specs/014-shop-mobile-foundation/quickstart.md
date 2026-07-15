# Quickstart — 014 Shop Mobile Foundation

**Audience**: the operator, running everything that touches live AWS or a real device. Claude writes the code;
this is the run/validate guide.

**Definition of done** (spec § Clarifications): builds and runs on an Android device/emulator **and** an iOS
device/simulator — **led by a large-screen tablet in landscape, the primary form factor (FR-003a)** — and
completes every flow against the **real dev shop pool**. No store enrolment or distribution.

---

## 0. Prerequisites

The backend for this app — `edge-api/shop` — **already serves shop-web**, so no deploy is required if it is up.

```bash
# The shop pool + service already exist. This slice adds ONE infra change (the mobile client):
make apply ENV=dev                 # adds the shop_mobile app client (30-day refresh, no SRP) + its SSM param
                                   #   + the shop authorizer audience (D3s). ⚠ ABORT if the pool or web client
                                   #   shows as -/+ / "must be replaced" — both changes are additive.
make output ENV=dev                # prints the shop pool id + the NEW mobile client id

# edge-api/shop reachable — deployed (shop-web), or local:
make edge-offline SERVICE=shop ENV=dev &      # serverless-offline on :3000
make cm-ngrok-edge NGROK_STATIC_DOMAIN=<you>.ngrok-free.app   # (reuse the 013 ngrok target) if testing on a device
curl -s http://localhost:3000/shop/healthz    # → {"status":"ok","service":"shop"}
```

You also need: a JDK 17+, Xcode 26 / iOS 26 SDK, an Android SDK, and **provisioned test operators** in the shop
pool (see § 5).

---

## 1. Configuration — no secrets in the tree

```bash
cd apps/shop-mobile
cp secrets.properties.example secrets.properties        # git-ignored
```

Fill from `make output` (SSM `/effy/dev/auth/shop/*` + `/effy/dev/edge/api_endpoint`):

```properties
COGNITO_USER_POOL_ID=ap-southeast-2_xxxxxxxxx
# ⚠ the SHOP MOBILE client — output `shop_mobile_app_client_id` / SSM .../auth/shop/mobile_app_client_id.
# NOT the web `app_client_id`.
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=ap-southeast-2
SHOP_API_BASE_URL=https://edge-api.dev.effyshopping.com   # or your ngrok URL
```

**Prove FR-035** — blank a key, `./gradlew :shared:assemble` → build fails at configuration time naming it.

---

## 2. The generated contract — regenerate and confirm no drift (Principle II)

```bash
pnpm --filter @effy/shared-types shop-contract:gen        # shop.ts → contract/ShopDto.kt (+ schema)
pnpm --filter @effy/design-system tokens:gen              # tokens.css → EffyTokens.kt (reused as-is)
git diff --exit-code packages/shared-types/contract packages/design-system/compose   # EXPECT clean
```

The Kotlin cannot be stale and green — CI runs the same with `--exit-code`.

---

## 3. Build, run, and the guard

```bash
make shop-android-run ENV=dev     # or Android Studio
make shop-ios-run ENV=dev         # or Xcode (add Amplify Swift SPM as in 013)
make mobile-guard                 # reused — escape-hatch ban + no secret-shaped keys
```

---

## 4. Automated tests (no device)

```bash
make shop-mobile-test ENV=dev
# commonTest: toShopRoles narrowing (unknown role → dropped), DTO↔domain mappers (email null / shop null =
# expected states), the config builder, and CONTRACT tests (fixtures decoded with ignoreUnknownKeys = false).
```

---

## 5. Provision test operators (§ O4) 🧑‍💻

The gate needs three shapes. Via the 009 back-office, or directly:

| Operator | Role | Shop | Proves |
|---|---|---|---|
| A | `shop_manager` | assigned to an **active** shop | gate **Granted** (positive half — needs 009 shop data) |
| B | `shop_manager` | **none** | gate **Denied** despite the role (negative half — provable now) |
| C | `shop_staff` | any | manager controls **hidden**; gate **Denied** |
| D | (no role) | none | role-less **expected state**; gate **Denied** |

---

## 6. The device matrix — the part that can't be faked

**Lead with a large-screen tablet in landscape** — the shop app's **primary** device (FR-003a). Run **every**
flow on an **Android tablet AND an iPad, in landscape**, then repeat on a **phone** (the compact case) to prove
the reflow. "Two SDKs behave identically" and "tablet-first" are both claims until seen on real hardware.

| Flow | Pass |
|---|---|
| Sign in (email → code) | Signed in; **no** password field / sign-up / guest anywhere (SC-002) |
| Unknown email | Same response as a real operator — **no** existence disclosure (SC-003) |
| Session persists | Force-quit → reopen → still signed in, zero interaction (SC-004) |
| Identity read | Name/email/role/shop from the **record**; operator D shows an **expected unassigned state**, not an error (SC-010) |
| Role-aware UI | Operator C/D see **zero** manager controls (SC-005) |
| **Manager gate** | Operator A → **Granted**; B/C/D → **Denied**, and the denial is **uniform** (SC-006/SC-007) |
| Sign out | No usable session credential remains on the device (SC-009) |
| Cross-pool | Present the shop token to another audience's service → structural refusal (SC-008) |
| **Tablet-first layout (S4s)** | On tablet-landscape every screen **uses the space** — **no** stretched phone-width column — and reflows cleanly to phone / split-screen with nothing cut off (**FR-003a / SC-014a**) |

---

## 7. The adversarial proof (SC-006/SC-007)

**Demonstrated, not asserted.** Sign in as operator **B** (a `shop_manager` with **no assigned shop**). Confirm
the manager capability is **refused** — the manager role alone is not enough — and that the refusal is **uniform**
(it does not reveal that the *shop scope* term is what failed). This is the shop-scope term of the gate doing
real work, exactly as 007 proved on web.

---

## 8. Sign-off (partial by design — 007)

- [ ] O1 — `make apply`: the shop_mobile client + authorizer audience, **additive** (abort if replace).
- [ ] Every § 6 row passes on **both** platforms.
- [ ] The § 7 adversarial proof passes.
- [ ] **Partial**: the gate's **positive** half (operator A **Granted**) + inactive-shop / disabled-operator
      denials are signed off against **009** shop data; the **negative** half is signed off now.
- [ ] `docs/audiences/shop-capabilities.md` mobile column filled; **telemetry row marked deferred** (FR-038).
- [ ] The two recorded deviations (Principle V iOS chrome; Principle VII telemetry) hold, each with its named
      closing slice.
</content>
