# What to Implement Next — Candidate Register

**Surveyed 2026-10-05** on branch `dev` (after 071). Sources: `FEATURE-HISTORY.md`,
`ORDER-FLOW-GAPS.md`, `docs/prd/2026-10-client-feedback-prd.md`, `docs/store-submission/`,
`docs/observability-apple-blockers.md`, and the code itself.

Each item was checked against the code unless it is marked **(docs only)**. Nothing here was
re-run: test and deploy states are quoted from the feature history, not observed.

> ⚠ **Superseded as the next priority (2026-10-08):** the operator chose the delivery model v2
> programme — [2026-10-delivery-model-v2-backlog.md](prd/2026-10-delivery-model-v2-backlog.md),
> specs 074–082, starting with 074 Customer Points. The items below remain valid candidates; item 5
> (order emails) and item 7 (`TrackOrderScreen`) are folded into its E5.

**Recommended next spec:** items 1 and 2 together — both are already named as "still ahead" in
`CLAUDE.md`, and item 16 depends on the sweep. Then item 3, which unblocks store submission.

---

## A. Finish what is half-wired

| # | Item | Evidence |
| --- | --- | --- |
| 1 | **Deliver the event backbone.** `event_outbox` is written at payment and nothing drains it. The SNS/SQS fan-out in the architecture has no publisher. | `apis/edge-api/shared/src/payments/outbox.ts:17` |
| 2 | **Sweep abandoned unpaid orders.** `pending_payment` orders linger forever; no sweep exists in any service. They also block account closure. | No sweep function or schedule under `apis/edge-api`; `ORDER-FLOW-GAPS.md` Tier 4 |
| 3 | **Account erasure worker.** The service comment says erasure "runs automatically", but no erasure function exists. Store-submission blocker row 10. ⚠ **It MUST call `forfeit` from `@effy/edge-shared/points`** when a closure becomes final (074 FR-024, research R10): until it does, a closed account's points are unusable but never recorded as forfeited. | `apis/edge-api/customer/serverless.yml:375`; `apis/edge-api/customer/src/functions/`; `docs/store-submission/submission-checklist.md` |
| 4 | **Customer notifications inbox.** The mobile screen is backed by a fixture that returns an empty list. The `customer` service has no notifications read route, though `notification_request` rows are written. | `apps/customer-mobile/.../features/notifications/domain/NotificationFixtures.kt`; `apis/edge-api/customer/src/` |
| 5 | **Order-ready and out-for-delivery emails.** The email catalogue has only confirmation, delivered and refunded. Web-only shoppers hear nothing in between. | `packages/email-kit/src/catalog.ts` |
| 6 | **Customer push copy.** Customers are still told "Your order is ready for handoff" — internal vocabulary. | `apis/edge-api/notifications/src/worker/copy.ts:83` |
| 7 | **`TrackOrderScreen` is dead code.** No route, and it carries its own `TrackStage` vocabulary beside the server-derived stage. Wire it or delete it. | `apps/customer-mobile/.../features/tracking/presentation/TrackOrderScreen.kt` (referenced only by its own test) |
| 8 | **iOS push bridge.** No `SwiftPushBridge` or `AppDelegate`; all three iOS apps use `NoOpPushTokenProvider`. Blocked on the Apple Developer account. | `docs/observability-apple-blockers.md`; `apps/*-mobile/.../core/push/PushTokenProvider.kt` |
| 9 | **Driver masked contact.** The contract type exists, the driver service has no route, and the buttons are disabled. | `packages/shared-types/src/driver.ts:446`; `apis/edge-api/driver/serverless.yml`; `EnRouteScreen.kt:106`, `ArrivedScreen.kt:94` |
| 10 | **Driver operational placeholders.** ETA, distance, shop coordinates and dispatch phone do not exist in the backend. The map is a schematic. | `apps/driver-mobile/.../core/placeholder/Placeholder.kt`; `specs/060-driver-mobile-ui/provenance-register.md` |

## B. Money and compliance

| # | Item | Evidence |
| --- | --- | --- |
| 11 | **Disputes and chargebacks.** No `charge.dispute.*` handling anywhere. | No match under `apis/edge-api` |
| 12 | **Tax invoice.** The ABN is an unfilled fail-loud placeholder and per-item GST is unmodelled (basic food is GST-free, so a basket is a mixed supply). | `packages/legal-content/src/identifiers.json`; `ORDER-FLOW-GAPS.md` Tier 4 |
| 13 | **Shop settlement and payouts.** 067 added margin, but there are no payout, statement or refund-cost-attribution tables. | No match in `db/migrations` or `apis/edge-api` |
| 14 | **Returns, replacements and substitutions.** The platform can only refund. | `ORDER-FLOW-GAPS.md` G3, Tier 2 |
| 15 | **Guest checkout.** Checkout redirects a guest to sign-in at the highest-intent moment. **(docs only — the redirect was not re-verified)** | `ORDER-FLOW-GAPS.md` Tier 4 |
| 16 | **Checkout stock reservation.** The oversell window between payment intent and payment is accepted, not closed. Depends on item 2. **(docs only)** | 054 spec A6; `ORDER-FLOW-GAPS.md` G2 |

## C. Surfaces and parity

| # | Item | Evidence |
| --- | --- | --- |
| 17 | **Shop-mobile parity.** It has only Home, Catalog, Orders and Account. Today, Insights, Team and notifications exist only on shop-web. | `apps/shop-mobile/.../features/` vs `apps/shop-web/src/features/` |
| 18 | **Back-office customer management.** No customers route or service domain, though the brief lists "manage users". | `apps/back-office/src/routes/`; `apis/edge-api/admin/src/` |
| 19 | **Back-office staff management UI.** The API domain exists; the UI is only the proving screens. | `apis/edge-api/admin/src/staff/`; `apps/back-office/src/features/staff-identity/` |
| 20 | **Back-office audit log viewer and platform-wide insights.** Audit trails appear per entity only; there is no admin reporting. | `apps/back-office/src/features/` |
| 21 | **Home merchandising control.** Back-office manages promotions only; no featured or recommended rails. | `apis/edge-api/admin/src/promotions/`; `platform-brief.md` §3 |
| 22 | **Reviews and ratings.** None exist. | `apis/edge-api/storefront/src/lib/cards.ts:64` |
| 23 | **Carrier integration.** Standard-delivery handover is a manual staff record — no carrier API, tracking or webhook. | `apis/edge-api/orders/src/handoff/` |
| 24 | **Customer live tracking.** No ETA or driver position for customers. Partly blocked by item 10. | `apis/edge-api/commerce/src/orders/` |

## D. Platform and release

| # | Item | Evidence |
| --- | --- | --- |
| 25 | **Production environment.** `prod`, `qa` and `staging` are five-file stubs; only `dev` is real. | `infra/envs/` |
| 26 | **CI for backend and mobile.** Workflows cover only `web` and `infra`. Backend deploys are a manual `make` target; no Gradle or iOS build runs in CI. | `.github/workflows/`; `Makefile:242` |

---

## Ahead of all of it: the deploy and walk backlog

Not new work, but it gates confidence in everything above. As recorded in `FEATURE-HISTORY.md`
(not re-run for this survey):

- **063–069** are code-complete and machine-verified, but not deployed or walked.
- **071**: the second round of deploys and the walk are open.
- **070**: the fifteen-journey walk and the measurement harness are open, including one paid test
  order through the new webhook endpoint, which had not been seen when the old backend was destroyed.
- Two `shop` real-database tests fail, and `scripts/check-no-telemetry-pii.sh` exits 1 on the
  notifications worker's `email` channel name.

## Smaller findings

- Search is trigram similarity plus `ILIKE` (`apis/edge-api/storefront/src/search/`); no synonyms
  or typo handling beyond that.
- Customer-mobile has no newsletter sign-up; customer-web does.
- Multi-hub is deferred by design (one operating hub).
- Legal identifiers (entity name, registered address, governing-law state) are placeholders that
  `legal:check --release` blocks on; they are operator input, not code.
