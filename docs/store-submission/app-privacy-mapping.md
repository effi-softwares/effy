# Apple App Privacy Details — Mapping (customer-mobile, iOS)

**Purpose**: fill the App Store Connect *App Privacy* questionnaire so the labels match the
[Privacy Policy](../../packages/legal-content/src/documents/privacy-policy/v1.md). Derived from the
single inventory in `packages/legal-content/src/inventory.ts` (feature 045). Keep this, the
[Google Data safety mapping](./data-safety-mapping.md) and the Privacy Policy mutually consistent
(SC-004): a change to one is a change to all three.

**Tracking posture**: Effy does **not** track users across other companies' apps or websites for
advertising. No data type is "Used to Track You"; there is **no ATT prompt**. `usedForTrackingAnywhere`
in the inventory is `false` — if that ever becomes true, this section and the app's ATT handling change.

## Data types collected (App Privacy categories)

| Apple data type | Collected | Linked to identity | Used for tracking | Purpose | Handled by |
| --- | --- | --- | --- | --- | --- |
| Name | Yes | Yes | No | App Functionality, Account Management | Cognito |
| Email Address | Yes | Yes | No | App Functionality, Account Management | Cognito, Google sign-in |
| Physical Address (delivery) | Yes | Yes | No | App Functionality (delivery) | AWS |
| Purchase History | Yes | Yes | No | App Functionality, Legal/accounting | AWS |
| Payment Info | Yes | Yes | No | App Functionality (payment) | Stripe (card data entered into Stripe; Effy never stores card numbers) |
| Product Interaction / Usage Data | Yes | Yes | No | Analytics, App Functionality | PostHog |
| Crash Data / Diagnostics | Yes | No | No | Analytics (stability) | Firebase Crashlytics |
| Device ID / Push Token | Yes | Yes | No | App Functionality (notifications) | FCM, APNs |
| Customer Support content | Yes | Yes | No | Customer Support | AWS |
| Precise/Coarse Location | **No** | — | — | — | — |

## Privacy Manifest (`PrivacyInfo.xcprivacy`) — required

Apple strictly enforces Privacy Manifests (2024+). The iOS app and its third-party SDKs must declare:

- **Collected data types** consistent with the table above.
- **Required-reason API** usage (e.g. file timestamp, user defaults, disk space, system boot time)
  with an approved reason code.
- **Third-party SDK manifests** for SDKs that provide them (Stripe, Firebase, PostHog). Verify each
  bundled SDK ships its own `PrivacyInfo.xcprivacy` and that ours aggregates correctly.

⚠ This is an **operator/mobile task** (not built in 045): produce `PrivacyInfo.xcprivacy` in the iOS
app and confirm it matches this mapping before submission.

## App Store Connect fields

- **Privacy Policy URL**: `https://effyshopping.com/legal/privacy-policy` (see
  [submission-checklist](./submission-checklist.md)).
- **Data collection**: enter each "Yes" row above.
- **EULA**: use Apple's **Standard EULA** (no custom EULA) — see the
  [EULA document](../../packages/legal-content/src/documents/eula/v1.md).
