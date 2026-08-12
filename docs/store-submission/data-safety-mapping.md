# Google Play Data Safety — Mapping (customer-mobile, Android)

**Purpose**: fill the Play Console *Data safety* form so answers match the
[Privacy Policy](../../packages/legal-content/src/documents/privacy-policy/v1.md) and the
[Apple App Privacy mapping](./app-privacy-mapping.md) (SC-004). Derived from
`packages/legal-content/src/inventory.ts`. Inconsistent answers trigger review flags — keep all three
in sync.

## Data collected & shared

| Play data type | Collected | Shared | Purpose | Processor |
| --- | --- | --- | --- | --- |
| Name | Yes | Yes (service providers) | Account management, App functionality | Cognito |
| Email address | Yes | Yes | Account management, App functionality | Cognito, Google sign-in |
| Address | Yes | Yes | App functionality (delivery) | AWS |
| Purchase history | Yes | Yes | App functionality, Legal | AWS |
| Payment info | Yes | Yes | App functionality (payment) | Stripe |
| App interactions / usage | Yes | Yes | Analytics, App functionality | PostHog |
| Crash logs / diagnostics | Yes | Yes | Analytics (stability) | Firebase Crashlytics |
| Device or other IDs (push token) | Yes | Yes | App functionality (notifications) | FCM |
| Support messages | Yes | Yes | Customer support | AWS |
| Location | **No** | — | — | — |

- **Shared for advertising / cross-app tracking**: **No** for every row.
- **Data sold**: **No**.

## Security practices (Data safety form)

- **Encrypted in transit**: Yes.
- **Users can request data deletion**: Yes — see below.
- **Committed to Play Families policy / follows Play policy**: confirm at submission.

## Account & data deletion (User Data policy)

- **In-app**: Account → Privacy & data → Delete account (built in 034; sessions end, access refused).
- **Web (required by Google, reachable without the app)**:
  **`https://effyshopping.com/delete-account`**
- ⚠ The deletion URL entered in the Data safety **deletion section MUST equal** the URL cited in the
  Privacy Policy (SC-008). Both are `https://effyshopping.com/delete-account`. The
  [Privacy Policy](../../packages/legal-content/src/documents/privacy-policy/v1.md) links to exactly
  this URL.
- **What is deleted vs retained**: account, saved items, addresses, personal details are removed;
  completed orders, payment records and fraud/security signals are retained (tax/accounting/fraud) —
  stated identically in the Privacy Policy.

## Play Console fields

- **Privacy Policy URL**: `https://effyshopping.com/legal/privacy-policy`.
- **Account deletion URL**: `https://effyshopping.com/delete-account`.
