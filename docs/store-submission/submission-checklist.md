# Store Submission Checklist — customer-mobile (iOS + Android)

The itemised legal/privacy/deletion gate for submitting customer-mobile. States for each row:
`satisfied` · `operator-action` (built; the operator must enter it in the console) ·
`blocked-dependency` (needs work outside this feature). Feature 045.

Supersedes `specs/034-customer-account-center/SUBMISSION-BLOCKERS.md` Blocker 2 (privacy/terms did not
exist — they now do) and keeps its other blockers honest.

| # | Requirement | Store | State | Evidence / note |
| --- | --- | --- | --- | --- |
| 1 | In-app privacy policy link, easily accessible | Both | satisfied | Account → Privacy & data (web built; **mobile screen wiring pending**, see row 12) |
| 2 | Public, non-geofenced privacy policy URL | Both | satisfied | `https://effyshopping.com/legal/privacy-policy` (static route, 045) |
| 3 | In-app account deletion (initiate) | Apple 5.1.1(v) | satisfied | 034 closure flow (emailed code → immediate closure) |
| 4 | In-app **and** web deletion; URL matches policy | Google | satisfied | `https://effyshopping.com/delete-account`; cited identically in the Privacy Policy (SC-008) |
| 5 | App Privacy details questionnaire | Apple | operator-action | Mapping in [app-privacy-mapping.md](./app-privacy-mapping.md) |
| 6 | Data safety form | Google | operator-action | Mapping in [data-safety-mapping.md](./data-safety-mapping.md) |
| 7 | Privacy Manifest (`PrivacyInfo.xcprivacy`) + SDK manifests | Apple | **blocked-dependency** | iOS/mobile task — produce and verify the manifest (not built in 045) |
| 8 | EULA posture configured | Both | operator-action | Apple **Standard EULA** (no custom); see [eula](../../packages/legal-content/src/documents/eula/v1.md) |
| 9 | Reviewer notes: throwaway account for deletion test | Apple | satisfied | [review-notes.md](./review-notes.md) |
| 10 | Permanent erasure matches the deletion claim | Both | **blocked-dependency** | Erasure worker not built (034 Blocker 1). Policy is written to CURRENT behaviour (immediate closure + stated retention), so no untrue claim ships — but the stronger "permanently erased" wording is unlocked only when the worker + its Cognito `AdminDeleteUser` IAM + restore-safety land |
| 11 | Real-world identifiers resolved | Both | **operator-action** | Entity name, ABN, registered address, governing-law state are fail-loud placeholders in `packages/legal-content/src/identifiers.json`; `legal:check --release` blocks a release until supplied and lawyer-reviewed |
| 12 | Documents rendered/linked inside the mobile app | Both | **blocked-dependency** | Web is built + verified; the customer-mobile screens (render generated `LegalContent.kt`, fix Terms→Privacy, About screen, nav) need a Gradle/device build (045 mobile phase) |

## Summary

- **Web + document content + store mappings + reviewer notes**: done and machine-verified.
- **Operator actions** (rows 5, 6, 8, 11): enter mappings/EULA/URLs in the consoles; supply and
  lawyer-review the legal identifiers.
- **Blocked dependencies** (rows 7, 10, 12): the iOS Privacy Manifest, the background erasure worker,
  and the mobile in-app document screens. None require an inaccurate statement to proceed.
