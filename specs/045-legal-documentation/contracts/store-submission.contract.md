# Contract: Store-submission collateral

The operator-facing artifacts under `docs/store-submission/` and the guarantees they must meet so both
mobile apps submit without a legal/privacy/deletion rejection. Not customer-facing.

## `app-privacy-mapping.md` (Apple App Privacy details)

- One row per `DataTypeDisclosure` (data-model): data type → collected? → linked to identity? → used
  for tracking? → purpose(s) → sub-processor(s).
- Covers the app **and its third-party SDKs** (Stripe, PostHog, Crashlytics, FCM/APNs, Google
  sign-in) — the questionnaire asks about SDK collection too.
- Notes the **Privacy Manifest** obligation (`PrivacyInfo.xcprivacy`) and ATT posture (expected: no
  cross-app tracking → no ATT prompt).
- **MUST agree with the Privacy Policy** (same data types, purposes, sharing) — SC-004.

## `data-safety-mapping.md` (Google Play Data safety)

- Same data-type spine as Apple's (SC-004), in Google's shape: collected vs shared, purpose, security
  practices (encryption in transit/at rest), retention, and the **deletion** answers.
- States the **in-app** deletion path (Account → Privacy & data → Delete) and the **web** deletion URL.
- ⚠ The web deletion URL entered here **MUST equal** the URL cited in the Privacy Policy (FR-026,
  SC-008) — both are `https://<canonical-host>/delete-account`.

## `submission-checklist.md` (the itemised gate — `StoreSubmissionItem`s)

Each row: requirement · store · state (`satisfied` / `blocked-dependency` / `operator-action`) ·
evidence. MUST include at least:

| Requirement | Store | Expected state |
|---|---|---|
| In-app privacy policy link, easily accessible | both | satisfied (Account + mobile screens) |
| Public, non-geofenced privacy policy URL | both | satisfied (`/legal/privacy-policy`) |
| In-app account deletion (initiate) | apple | satisfied (034 flow) |
| In-app + web deletion, URL matches policy | google | satisfied (`/delete-account`) |
| App Privacy details completed | apple | operator-action (mapping provided) |
| Data safety form completed | google | operator-action (mapping provided) |
| EULA posture configured (Standard EULA) | both | operator-action (R9 recorded) |
| Reviewer notes: throwaway account for deletion test | apple | satisfied (`review-notes.md`) |
| Permanent erasure matches policy claim | both | **blocked-dependency** (erasure worker, R11) |
| Real-world identifiers resolved | both | **operator-action** (FR-009 placeholders) |

## `review-notes.md`

- Instructs the reviewer to **register a throwaway account before testing deletion** (so the demo
  account is not destroyed → next-submission login-bug rejection). No special-cased account in code
  (FR-027).
- Names the in-app deletion path and the demo credentials location.

## Consistency guarantee

The Privacy Policy (`@effy/legal-content`), `app-privacy-mapping.md`, and `data-safety-mapping.md` are
authored from **one** `DataTypeDisclosure`/`SubProcessor` inventory (research R10). A data type or
sub-processor added to one MUST be added to all three; a review step (and, where feasible, a test that
cross-checks the enumerated set) enforces SC-004.
