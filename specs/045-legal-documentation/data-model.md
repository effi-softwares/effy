# Data Model: Legal & Informational Documentation

⚠ **This is a content model, not a database schema.** There is no PostgreSQL table and no Goose
migration in this slice (Principle III / plan §Storage). The "entities" below describe the shape of the
committed content in `@effy/legal-content` and the operator collateral. State lives in git, not a DB.

## LegalDocument

The unit a customer reads. One per document type.

| Field | Type | Notes |
|---|---|---|
| `slug` | string (kebab) | Stable URL/route key: `privacy-policy`, `terms-of-service`, `refunds-returns`, `cookies-tracking`, `acceptable-use`, `eula`, `acknowledgements`, `about`. Also the web `[type]` param. |
| `title` | string | Display title (e.g. "Privacy Policy"). |
| `currentVersion` | string | e.g. `v1`; names the active `DocumentVersion`. |
| `effectiveDate` | ISO date | The active version's effective date; shown in the meta row. |
| `category` | enum | `legal` (agreement/notice) or `info` (about/acknowledgements) — drives grouping on the `/legal` index and footer. |
| `order` | int | Presentation order in the index/footer. |
| `body` | Markdown | The constrained-subset Markdown content of the current version (source of truth). |
| `linkedFrom` | string[] | The entry points that MUST link here (used by the link-integrity test): e.g. `footer`, `signup-consent`, `checkout`, `newsletter`, `account-privacy`, `mobile-about`, `delete-account`, `legal-index`. |

**Validation / rules**
- Every `slug` in `manifest.ts` MUST have a matching document directory and a current-version file.
- `body` MUST render under both the web and mobile renderers (constrained subset only — R2/R3).
- Every factual claim in `body` MUST trace to a real platform behaviour/provider (SC-002; see
  `DataTypeDisclosure`, `SubProcessor`).
- No unresolved real-world-identifier placeholder may remain at publish (enforced by `legal:check`).

## DocumentVersion

A revision of a `LegalDocument`.

| Field | Type | Notes |
|---|---|---|
| `version` | string | `v1`, `v2`, … monotonically. |
| `effectiveDate` | ISO date | When this version takes/took effect. |
| `status` | enum | `current` \| `superseded`. Exactly one `current` per document. |
| `body` | Markdown | The version's content. |

**Rules**
- The `/legal/[type]/versions` view lists all versions, marks `current`, and — at first publish, when
  only `v1` exists — states "This is the first version" rather than showing an empty list.
- History is the committed file set; nothing is mutated in place (a change is a new version).

## DataTypeDisclosure

The bridge row that keeps the Privacy Policy prose and the two store forms mutually consistent (SC-004).
Lives in the store-collateral docs and is derived from research R10.

| Field | Type | Notes |
|---|---|---|
| `dataType` | enum | e.g. Name, Email, Delivery address, Purchase history, Payment info, Device/push token, Product-interaction, Crash data, Approximate/precise location (only if actually collected). |
| `purpose` | string[] | App functionality, Analytics, Account management, etc. — must match actual use. |
| `linkedToIdentity` | bool | Apple: "linked to you" vs "not linked to you". |
| `usedForTracking` | bool | Apple ATT / Google "shared for advertising" — expected **false** platform-wide. |
| `subProcessors` | ref[] | The `SubProcessor`(s) that receive it. |
| `retention` | string | Retention statement; for post-deletion, one of the R10 retained categories or "deleted". |

## SubProcessor

An external party that receives personal information. Enumerated from the built stack (R10) — a party
not actually integrated MUST NOT appear.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Stripe, AWS (Cognito/RDS/S3/SES), PostHog, Firebase (Crashlytics/FCM), Apple (APNs), Google (federated sign-in). |
| `purpose` | string | Why it receives data. |
| `dataCategories` | string[] | What it receives. |
| `overseasDisclosure` | bool | APP 8 — true where the party processes data outside Australia (disclosed in the Privacy Policy). |

## RealWorldIdentifiers

Operator-supplied values referenced across the documents. **Fail-loud placeholders until supplied.**

| Field | Placeholder | Notes |
|---|---|---|
| `legalEntityName` | `[LEGAL_ENTITY_NAME]` | The operating company. |
| `abn` | `[ABN]` | Australian Business Number (and/or ACN). |
| `registeredAddress` | `[REGISTERED_ADDRESS]` | Postal/registered address. |
| `governingLawState` | `[GOVERNING_LAW_STATE]` | e.g. NSW — for Terms jurisdiction. |
| `privacyContactEmail` | approved mailbox | `hello@`/`workspace-admin@effyshopping.com`, or operator-confirmed `support@effyshopping.com`. Never invented. |

**Rule**: `legal:check` scans the generated web + mobile output for any remaining `[…]` placeholder and
fails the build, blocking publish (constitution "fail loudly").

## StoreSubmissionItem

A single row of the submission checklist (`docs/store-submission/submission-checklist.md`).

| Field | Type | Notes |
|---|---|---|
| `requirement` | string | e.g. "In-app privacy policy link (Apple 5.1.1(i))". |
| `store` | enum | `apple` \| `google` \| `both`. |
| `state` | enum | `satisfied` \| `blocked-dependency` \| `operator-action`. |
| `evidence` | string | Where it is satisfied (route, screen, mapping doc) or the blocking dependency. |

## Relationships

- `LegalDocument` **1—N** `DocumentVersion` (one `current`).
- `LegalDocument` (privacy) **references** the `DataTypeDisclosure` set, which **references**
  `SubProcessor`s — the same set feeds the Apple and Google mappings (one spine → three consistent
  outputs, SC-004).
- Documents **reference** `RealWorldIdentifiers` by token.
- `StoreSubmissionItem`s **reference** documents/routes as their evidence.
