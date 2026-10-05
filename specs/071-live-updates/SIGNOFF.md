# Sign-off: 071 Live Updates Without Polling

**Status (2026-10-05)**: the early-proof slice is **built and tested, not deployed**. Nothing below
the "Operator" heading has been run. The gate (tasks T019–T020) is open.

## Built (Claude) — verified locally

| What | Proof |
|---|---|
| Constitution v3.1.0 — a managed pay-per-use connection service is permitted; AppSync Events named | `.specify/memory/constitution.md` |
| Channel rules, signer, `announce`, scope lookup, descriptor route — `@effy/edge-shared/live` | 43 unit tests; `scope.container.test.ts` 9 passed against the real migrations (`CONTAINER_TESTS=1`) |
| Signer agrees with the AWS SDK's | `sign.test.ts` pins two signatures produced by `@smithy/signature-v4` for the same inputs |
| Authorizer — `apis/edge-api/live` | 41 tests: every row and every refusal in contracts/live-channel.md §3; packages cleanly (`serverless package --stage dev`) |
| Payment finalised announces to shop, customer, ops | `announce-paid.test.ts` 4 passed; `checkout.container.test.ts` 23 passed with the new assertions |
| `GET /shop/v1/live` | `route.test.ts` 6 passed |
| Terraform — `infra/envs/dev/live.tf` | `terraform validate` passes (provider 6.53) — research R11 ✅ |
| Names agree across TypeScript, YAML and Terraform | `live.contract.test.ts` 10 passed. It caught one defect on its first run: `shop` had been given the publish permission before it publishes anything. Removed. |
| Web client, coalescer, provider, status line — `packages/web-kit/src/live` | 39 tests incl. SC-003 (idle hour, no reads), SC-004 (catch-up), SC-012 (≤ 3 reads per burst), FR-015, FR-016, FR-023 (refused epoch → off) |
| shop-web mounted | typecheck clean; 450 tests pass; design-system guards pass |
| Every backend suite | 14 services, all passing |

⚠ **shop-web's refresh timers are still in place** — deliberately. They come out in US2 (T025),
after this proof, so a console released before the channel is deployed behaves exactly as today.

## Operator — the early proof (quickstart Stage 1)

Run in this order. `AWS_PROFILE=ef` throughout; the database must be running.

1. `make edge-deploy SERVICE=live ENV=dev`
2. `make plan ENV=dev` — expect **only additions** plus **one in-place change** (the alerts topic
   policy gains `budgets.amazonaws.com`). Then `make apply ENV=dev`.
3. `make edge-deploy SERVICE=commerce ENV=dev`, then `make edge-deploy SERVICE=shop ENV=dev`
4. Commit and push so Amplify releases shop-web.
5. `scripts/verify-071/README.md`: run `live-authz.ts` (SHOP_ACCESS_TOKEN alone is enough here),
   then `live-latency.ts`.
6. By eye, notifications **denied** in the browser: open Today, pay a test order elsewhere.

| Check | Target | Result |
|---|---|---|
| Own channel granted with the app's access token (⚠ PROVE, R3) | granted | |
| Every other attempt refused, incl. publish (SC-005) | 0 granted | |
| New paid order appears, notifications denied (SC-002) | 20 of 20 within 5 s | |
| Payment → update, p95 / p99 (SC-001) | < 5 s / < 15 s | |
| Today open and idle 10 min, network panel (SC-003) | no data requests | |
| Suspend an operator with the console open (⚠ PROVE, R5; SC-009) | "Live updates off" ≤ 15 min | |

**If SC-001 or SC-002 is missed, or a ⚠ PROVE item fails: stop.** `research.md` and `plan.md` are
corrected before any later task starts.

## Not yet built

US2's timer removal (T025) and mobile parity (T027); the mobile client (T013); US3–US6; the
change-map guard (T047) and no-timer sweep (T048); document corrections (T052, T053).
