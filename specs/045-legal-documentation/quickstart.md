# Quickstart: Validating Legal & Informational Documentation

How to prove this feature works end-to-end. References [contracts/](./contracts/) and
[data-model.md](./data-model.md); no implementation code here.

## Prerequisites

- Monorepo installed (`pnpm install`).
- `@effy/legal-content` built; `legal:gen` has run so the mobile content is committed.
- customer-web dev server; customer-mobile Android + iOS builds.

## A. Content exists and is honest (US1 · SC-001, SC-002)

1. `pnpm --filter @effy/legal-content build` then open each web route (below) — confirm **real prose**,
   a **version + effective date**, and **no "being prepared" placeholder** anywhere.
2. Spot-check the Privacy Policy against the built system: every data type, sub-processor, and retained
   category it names traces to research R10 / `apis/edge-api/customer/src/closure/service.ts` `RETAINED`.
   A claim with no backing behaviour is a defect.
3. Confirm the deletion language describes **current** behaviour (immediate closure + retained
   categories) and does **not** promise permanent erasure the platform doesn't perform (R11).

## B. Web routes render and are guest-bundle-safe (US1/US3/US4)

Visit and verify each renders the correct document (light appearance, sectioned typography, no cards):
- `/legal` (index — lists all documents)
- `/legal/privacy-policy`, `/legal/terms-of-service`, `/legal/refunds-returns`,
  `/legal/cookies-tracking`, `/legal/acceptable-use`, `/legal/eula`, `/legal/acknowledgements`
- `/legal/privacy-policy/versions` (history; "first version" state at v1)
- `/about`, `/delete-account`

Then: `pnpm --filter @effy/customer-web build` and run the **guest-bundle budget** — every new public
route above MUST be listed in `scripts/bundle-budget.mjs` and within 174 KB (they ship ~0 client JS;
the failure mode is an *unlisted* route, not size).

## C. Mobile renders the same words, natively (US1 · SC-006, FR-012, FR-022)

1. Build Android + iOS; open Account → **Privacy & data**.
2. Tap **Privacy policy** → the Privacy document renders natively.
3. Tap **Terms of service** → the **Terms** render (⚠ regression: it must NOT open the Privacy screen).
4. Open the **About** screen → app version, business identity, **Licenses/acknowledgements**, and legal
   links present.
5. Compare any document's text to the web version → **identical** (parity).

## D. Every link resolves to the right document (US3 · SC-005)

Walk each entry point in the link-integrity table
([legal-content.contract.md](./contracts/legal-content.contract.md)) and confirm the target document:
footer "Legal & company" column, sign-up consent, checkout place-order, newsletter sign-up, Account →
Privacy & data (web + mobile), mobile About, `/delete-account`, `/legal` index. Zero broken or
wrong-document links.

## E. The drift + identifier guard holds (FR-009, FR-013 · the guard doctrine)

- `pnpm --filter @effy/legal-content legal:check` → **passes** on a clean tree.
- Break it three ways and confirm each **fails and names the cause**:
  1. edit one generated mobile content line → **drift** failure;
  2. leave a `[LEGAL_ENTITY_NAME]` placeholder unresolved → **unresolved-identifier** failure;
  3. remove a `manifest` entry → **integrity** failure.
- Confirm the banned `techsupport+claudeone@phantm.com` appears nowhere (`git grep` clean).

## F. Store-submission collateral is complete and consistent (US2 · SC-003, SC-004, SC-008)

1. Open `docs/store-submission/`: `app-privacy-mapping.md`, `data-safety-mapping.md`,
   `submission-checklist.md`, `review-notes.md` all present.
2. Cross-check the **same data types + sub-processors** appear in the Privacy Policy, the Apple mapping
   and the Google mapping (SC-004) — no contradiction.
3. Confirm the Google **deletion URL equals** the URL cited in the Privacy Policy (SC-008).
4. Confirm the checklist marks the erasure-worker claim **blocked-dependency** and the identifiers
   **operator-action** — honest, not glossed.

## Automated gates (CI)

- `pnpm -r typecheck` · `pnpm -r test` (web content-render, link-integrity, mobile catalogue +
  Terms→Privacy regression) · `legal:check` · customer-web build + guest-bundle budget · Android +
  iOS compile · Playwright legal-routes spec.

## Operator / out-of-code (cannot be automated)

- Supply real-world identifiers (entity, ABN, address, jurisdiction, contact) → resolves `legal:check`.
- Legal review of all drafts.
- App Store Connect: App Privacy questionnaire, EULA posture (Standard), privacy policy URL, review
  notes. Play Console: Data safety form, deletion URL, privacy policy URL.
- (Dependency) Ship the background erasure worker before making the stronger deletion claim.
