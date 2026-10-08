# Tasks: A Second Front Door for Back-Office

**Input**: Design documents from `specs/075-staff-gateway/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/gateway.contract.md](contracts/gateway.contract.md),
[quickstart.md](quickstart.md)

**Tests**: included. The guards G1–G7 in the quickstart are part of this feature's definition of done.
Each is broken once to see it fail.

**Organization**: by user story (spec.md). Paths are repo-relative. Abbreviations:
`EA` = `apis/edge-api`, `TF` = `infra/envs/dev`.

⚠ **Mode of work**: Claude writes Terraform, configuration, code and scripts. The operator runs every
`make apply` and `make edge-deploy`. Tasks marked **OPERATOR** are handed over with exact commands and
are ticked only when the operator reports the result.

⚠ **Nothing in Phases 1–7 changes anything live.** A stack moves only when the operator redeploys it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

- [ ] T001 Amend `.specify/memory/constitution.md` to **v3.2.0**: prepend the sync-impact report (3.1.0 → 3.2.0, MINOR, reason: the integration limit, research F1/R7); rewrite Principle III's first bullet to "behind one of two HTTP gateways — the shared gateway (customer, shop, driver, public) and the staff gateway (back-office only)"; add bullets "a plan MUST state which gateway a new service attaches to" and "a third gateway requires amending this constitution first"; add the two gateways to Technology Standards; update the footer version and Last Amended 2026-10-08. Do not edit earlier sync-impact reports.
- [ ] T002 [P] Create `EA/shared/src/lib/serverless-stacks.ts`: `listStacks()` returns, for every directory under `apis/edge-api/` that holds one, each `serverless*.yml` as `{ service, dir, file, stackName, gateway: "shared" | "staff" | null, doc }` — `gateway` read from which SSM parameter `provider.httpApi.id` names (`/edge/http_api_id` → shared, `/staff/http_api_id` → staff, absent → null); plus `httpRoutes(stack)` returning `{ fn, method, path, authorizerParam | null }[]`. Parse with the YAML loader the existing contract tests use (see `EA/shared/src/lib/background-alarms.contract.test.ts`). Add `serverless-stacks.test.ts` asserting it finds all thirteen service directories on today's tree.
- [ ] T003 [P] Add `@aws-sdk/client-apigatewayv2` to `EA/admin/package.json` at the same major/minor as the other `@aws-sdk/*` clients there; run `pnpm install`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the staff gateway exists in Terraform, and the guards know there are two.

- [ ] T004 In `TF/variables.tf` add `staff_api_subdomain` (string, default `"staff-api"`, validation: a single DNS label, not equal to `var.api_subdomain`) and `staff_gateway_cutover` (string, default `"complete"`, validation: one of `prepare`, `forward`, `website`, `complete`) with descriptions quoting the table in [contracts/gateway.contract.md](contracts/gateway.contract.md) "The cutover variable".
- [ ] T005 Create `TF/staff-gateway.tf`, mirroring `TF/edge-gateway.tf` + `TF/edge-domain.tf` resource for resource: `aws_apigatewayv2_api.staff` (HTTP, raw endpoint enabled), `$default` auto-deploy stage with the same access-log and throttling settings as the shared stage, **one** `aws_apigatewayv2_authorizer.staff_back_office` (JWT, issuer and audience taken from the same pool/client expressions `local.edge_pools["back-office"]` uses), CORS with `allow_origins` = the back-office console origin(s) from `local.browser_origins` restricted to back-office + `http://localhost:5173` and methods/headers/expose-headers copied from the shared gateway, regional TLS 1.2 custom domain `"${var.staff_api_subdomain}.${module.dns.zone_name}"` on the existing wildcard certificate, one empty-key API mapping, Route 53 A + AAAA alias records, and the four SSM parameters `/effy/${var.env}/staff/{http_api_id,api_endpoint,api_default_endpoint,authorizer/back-office_id}`. Add `output "staff_api_endpoint"` in `TF/outputs.tf`. Header comment: why a second gateway (F1) and that it carries exactly one authorizer (R3).
- [ ] T006 In `TF/staff-gateway.tf` add the staff gateway's 5xx alarm, a copy of the shared gateway's in `TF/edge-gateway.tf` with `ApiId` = the staff API, delivered to the same alerts topic.
- [ ] T007 Create `EA/shared/src/lib/gateway-capacity.contract.test.ts` (G1): using `listStacks()`, count per gateway (a) routes and (b) functions with at least one `httpApi` event; add 5 to the shared gateway while any stack with a `/admin`, `/fleet`, `/orders`, `/catalog` or `/inventory/v1/admin` path is on staff AND `TF/dev.tfvars` sets `staff_gateway_cutover` to `forward` or `website`; fail naming the gateway and the count if either passes 300; `console.table` the result every run. Constant `GATEWAY_CEILING = 300` with a comment citing research F1 (integrations are not adjustable).
- [ ] T008 Prove T007: temporarily add one `httpApi` event to `EA/customer/serverless.yml`, confirm the test fails naming `shared` at 301, restore. Record the result for SIGNOFF.

**Checkpoint**: `make validate ENV=dev` passes; `pnpm --filter @effy/edge-shared test` passes; the tree still describes one gateway in use.

---

## Phase 3: User Story 1 — New work can ship again (P1) 🎯 MVP

**Goal**: every back-office stack attaches to the staff gateway; the shared gateway is left at about 53%.

**Independent test**: G1 prints shared ≈ 158 and staff ≈ 142; G2 and G5 pass.

- [ ] T009 [US1] Create `EA/shared/src/lib/gateway-placement.contract.test.ts` with G2: the stacks `admin`, `fleet`, `orders`, `catalog`, `inventory-staff` have `gateway === "staff"`; `storefront`, `commerce`, `customer`, `shop`, `inventory`, `driver`, `notifications` have `"shared"`; `auth`, `live` have `null`; any stack not in one of the three lists fails with "place this service: docs/api/path-assignment.md". Red until T010–T014.
- [ ] T010 [P] [US1] In `EA/admin/serverless.yml` change `provider.httpApi.id` to `${ssm:/effy/${sls:stage}/staff/http_api_id}` and every `authorizer.id` to `${ssm:/effy/${sls:stage}/staff/authorizer/back-office_id}`; update the header comment and `EA/admin/README.md` where they name the shared gateway.
- [ ] T011 [P] [US1] The same two replacements in `EA/fleet/serverless.yml`.
- [ ] T012 [P] [US1] The same two replacements in `EA/orders/serverless.yml`.
- [ ] T013 [P] [US1] The same two replacements in `EA/catalog/serverless.yml`.
- [ ] T014 [US1] Split inventory: create `EA/inventory/serverless.staff.yml` — `service: effy-edge-inventory-staff`, the same `provider`, `custom`, `package`/esbuild, IAM and environment blocks as `serverless.yml` but `httpApi.id` from `/staff/http_api_id`; move the six functions whose handlers are `src/functions/admin-*.handler` (stock get, low-stock get, stock put, stock-tracking put, stock-threshold put, settings put) into it unchanged except `authorizer.id` → `/staff/authorizer/back-office_id`; add public `GET /inventory-staff/healthz` and `/inventory-staff/readyz` reusing the existing health handlers. Remove those six functions from `EA/inventory/serverless.yml`. Scheduled and queue functions stay in `serverless.yml`. Header comments in both files point at research R4.
- [ ] T015 [US1] Add G5 to `EA/shared/src/lib/gateway-placement.contract.test.ts`: every `EA/inventory/src/functions/*.ts` handler is declared by exactly one of the two inventory stacks; every `/inventory/v1/admin/…` path is in `serverless.staff.yml` and no other inventory path is.
- [ ] T016 [P] [US1] Update `EA/catalog/src/config.contract.test.ts`, `EA/orders/src/config.contract.test.ts`, `EA/fleet/src/shared/config.contract.test.ts`, `EA/admin/src/delivery/config.contract.test.ts` and `EA/admin/src/feedback/config.contract.test.ts` wherever they assert an `/edge/http_api_id` or `/edge/authorizer/back-office_id` parameter: expect the `/staff/` names, and that Terraform (`TF/staff-gateway.tf`) declares them.
- [ ] T017 [US1] Update `EA/inventory/src/config.contract.test.ts` to check both stack files: `serverless.yml` reads only `/edge/…` and the shop authorizer, `serverless.staff.yml` only `/staff/…`.
- [ ] T018 [US1] In `Makefile`: make `edge-deploy`, `edge-remove` and `edge-offline` accept `SERVICE=inventory-staff` by resolving it to directory `apis/edge-api/inventory` plus `--config serverless.staff.yml` (one small lookup, e.g. `EDGE_CONFIG`, so no other service is special-cased); add `inventory-staff` to the usage strings; change the deploy prompt from "attaches to the shared HTTP API" to name the gateway read from the stack file.
- [ ] T019 [US1] Run `pnpm -r typecheck`, `pnpm --filter @effy/edge-shared test` and the five services' tests; G1 must print shared ≈ 158 / staff ≈ 142 and both ≤ 60% (SC-001). Package each of the six stacks without deploying (`pnpm exec serverless package --stage dev` needs live SSM values, so only if the staff parameters exist; otherwise record "packaged after T041").

**Checkpoint**: the tree describes two gateways. Nothing live has changed.

---

## Phase 4: User Story 2 — Nobody using Effy notices (P1)

**Goal**: the cutover machinery — forwarding routes, the website's address, health checks, background work and live updates all accounted for.

**Independent test**: `make validate` passes for each of the four cutover values; G6 passes; W1–W4 and W6 after the move.

- [ ] T020 [US2] Create `TF/staff-gateway-forwarding.tf`: `local.staff_forwarding = contains(["forward", "website"], var.staff_gateway_cutover)`; a `for_each` over the five prefixes in the contract's forwarding table creating, on **`aws_apigatewayv2_api.edge`**, an `HTTP_PROXY` integration (`integration_method = "ANY"`, `integration_uri = "https://<staff domain>/<prefix>/{proxy}"`, payload format 1.0, timeout 29 s) and a route `ANY /<prefix>/{proxy+}` with **no authorizer**. Header comment: temporary, dev migration only, why no authorizer (the staff gateway authorizes), and that a specific route always wins over a greedy one (research R5).
- [ ] T021 [US2] In `TF/amplify-consoles.tf` split `local.console_api_base_url`: shop-web keeps the shared address; back-office's `VITE_API_BASE_URL` is the staff address when `var.staff_gateway_cutover` is `website` or `complete`, else the shared one. Comment both.
- [ ] T022 [US2] Update `EA/shared/src/lib/background-alarms.contract.test.ts` and `EA/shared/src/live/live.contract.test.ts` to enumerate stacks through `listStacks()` (G6), so `serverless.staff.yml` is seen; assert in the first that no scheduled or queue function was lost from `inventory` by the split (FR-010).
- [ ] T023 [P] [US2] Change `scripts/edge-health.sh` to accept `TARGETS="<url>=<svc svc…>;<url>=<svc…>"` (keeping `API_URL` + `SERVICES` working), and the `edge-health` target in `Makefile` to probe the shared address for `shop customer storefront commerce driver inventory` and the staff address for `admin fleet orders catalog inventory-staff`. During the move a service not yet redeployed answers on the shared address only — print which address answered rather than failing when `CUTOVER=1` is passed.
- [ ] T024 [P] [US2] In `scripts/dns-verify.sh` and its `Makefile` target, also verify the staff hostname: resolves, TLS chain trusted, raw staff URL still answers (`/staff/api_default_endpoint`).
- [ ] T025 [P] [US2] Update `apps/back-office/.env.example` and `apps/back-office/README.md`: `VITE_API_BASE_URL` is the staff address (`make auth-param` on `/effy/dev/staff/api_endpoint`). Do not edit `apps/back-office/.env` — that is the operator's file; say so in the handover.
- [ ] T026 [US2] Confirm no back-office code holds a second copy of the API address: grep `apps/back-office/src` and `packages/{api-client,web-kit}` for `edge-api`, `api_subdomain` and hard-coded hosts; the live channel's hosts (`VITE_LIVE_*`) are independent of the gateway and must be unchanged. Record the result in the SIGNOFF draft; fix anything found.
- [ ] T027 [US2] `make validate ENV=dev` and `make fmt`; then, for each cutover value, write in `specs/075-staff-gateway/SIGNOFF.md` (draft) the resources that value adds or removes relative to the previous one, read from the Terraform source, to compare against the operator's real plan output.

---

## Phase 5: User Story 3 — The audiences stay apart (P1)

**Goal**: separation is per gateway, not only per route.

**Independent test**: G3, G4 pass; W5 after the move (every cross-audience attempt refused).

- [ ] T028 [US3] In `TF/edge-gateway.tf` make the shared gateway's back-office authorizer, its `/edge/authorizer/back-office_id` parameter and the back-office origin in the shared CORS list exist only while `var.staff_gateway_cutover != "complete"` (filter `local.edge_pools` for the `for_each`; do not rename the remaining three authorizers' resource addresses — a rename would destroy and recreate them under live routes). Comment: removal is the last step, and AWS refuses to delete an authorizer still in use.
- [ ] T029 [US3] Add G3 and G4 to `EA/shared/src/lib/gateway-placement.contract.test.ts`: no route on a shared-gateway stack names any `back-office_id` authorizer parameter; every authenticated route on a staff-gateway stack names `/staff/authorizer/back-office_id` and nothing else; the only unauthenticated routes on staff stacks are `/<service>/healthz|readyz`. Also assert from the Terraform source that `staff-gateway.tf` declares exactly one `aws_apigatewayv2_authorizer`.
- [ ] T030 [US3] Prove G3 and G4: point one `EA/orders/serverless.yml` route at `/edge/authorizer/customer_id`, see G4 fail; add a route with the back-office parameter to `EA/shop/serverless.yml`, see G3 fail; restore both.
- [ ] T031 [US3] Update `scripts/verify-cross-pool.sh` and the `shop-verify-isolation` target in `Makefile` to take both addresses (`SHARED_API`, `STAFF_API`, read from the two parameters) and to try, with customer, shop and driver tokens, one staff route, and with a staff token, one shop and one customer route — expecting 401 for all (SC-005). Add `DRIVER_TOKEN` / `CUSTOMER_TOKEN` as optional inputs; skip a direction, loudly, when its token is absent.

---

## Phase 6: User Story 4 — The operator sees a door filling up (P2)

**Goal**: usage is visible on demand and alarmed before it matters.

**Independent test**: G7 passes; `make gateway-usage ENV=dev` prints both gateways; W7.

- [ ] T032 [P] [US4] Create `scripts/gateway-usage.sh` (read-only; `AWS_PROFILE` from the Makefile): read `/effy/$ENV/edge/http_api_id` and `/effy/$ENV/staff/http_api_id`, count routes and integrations with paginated `aws apigatewayv2 get-routes` / `get-integrations`, print the table in the contract, list routes per stack prefix with `--by-service`, exit non-zero at ≥ 90% of 300. If the staff parameter does not exist yet, print the shared gateway alone and say so. Add target `gateway-usage` to `Makefile` with a `##` help line.
- [ ] T033 [US4] Create `EA/admin/src/gateway-usage/reader.ts` (the only file importing `@aws-sdk/client-apigatewayv2`: `countRoutes(apiId)`, `countIntegrations(apiId)`, paginated) and `service.ts` (`measure(reader, { shared, staff })` → four readings `{ gateway, limit, used, ceiling: 300, percent }`, percent rounded up so 299/300 never reads as under 100 by rounding down to 99 — state the rounding in a comment). Wired by hand, Principle VI.
- [ ] T034 [US4] Create `EA/admin/src/functions/gateway-usage-scheduled.ts`: read the two API ids from env (`SHARED_HTTP_API_ID`, `STAFF_HTTP_API_ID`), call `measure`, emit `GatewayUsagePercent` in namespace `Effy/Platform` with dimensions `gateway`, `limit` through the shared metrics helper (`@effy/edge-shared` — the same one `sesIdentityHealth` uses), log the four readings; let any error throw so the invocation fails.
- [ ] T035 [US4] In `EA/admin/serverless.yml` add function `gatewayUsage` (schedule `rate(1 hour)`, 30 s timeout, the two env vars from SSM) beside `sesIdentityHealth`, with an IAM statement allowing `apigateway:GET` on `arn:aws:apigateway:${aws:region}::/apis/<id>/routes` and `/integrations` for exactly the two APIs.
- [ ] T036 [US4] Write `EA/admin/src/gateway-usage/service.test.ts` (G7): a fake reader → four readings, each 0–100, correct gateway/limit labels, pagination summed, 300/300 → 100; a reader that throws makes the handler reject.
- [ ] T037 [US4] Create `TF/gateway-usage.tf`: for each gateway, alarms at ≥ 75 (warning) and ≥ 90 (critical) on the maximum of its `routes` and `integrations` readings (metric math), period 1 h, `treat_missing_data = "notBreaching"`, to the alerts topic; and in `TF/background-functions.tf` add `gatewayUsage` to the list of scheduled functions that get a failed-invocation alarm (FR-019). Update the expected lists in `EA/shared/src/lib/background-alarms.contract.test.ts` and any alarm-name contract that enumerates `Effy/Platform` metrics.
- [ ] T038 [US4] Run `pnpm --filter @effy/edge-admin test`, `pnpm --filter @effy/edge-shared test`, `make validate ENV=dev`.

---

## Phase 7: User Story 5 — The rule is written down (P2)

**Goal**: a reader can place a new capability without asking.

**Independent test**: SC-008 — three example capabilities placed correctly from the guide alone.

- [ ] T039 [P] [US5] Rewrite `docs/api/shared-gateway.md` to describe both gateways (keep the filename; retitle "The gateways"): the shared contract as it is, the staff contract from [contracts/gateway.contract.md](contracts/gateway.contract.md), the refusals table, and that the forwarding routes are history once removed.
- [ ] T040 [P] [US5] In `docs/api/path-assignment.md`: add a gateway column to the service table; replace the "gateway is full" warning written under 074 with the standing rule — which gateway by audience; a service that serves two audiences is two stacks; **at 75% plan, at 90% stop adding and act**; the options in order (move a service's audience split, then a further gateway by constitution amendment) and why merging routes to fit a counter is not one of them; three worked examples (a new back-office settings screen, a new customer route, a route used by shop and back-office).
- [ ] T041 [P] [US5] Correct `ARCHITECTURE.md`, `CLAUDE.md` (Platform shape: "behind one shared HTTP gateway" → two gateways, constitution v3.2.0; Current status: the staff address; add 075 to "Features recorded") and `infra/envs/README.md` (new-environment steps: both gateways come from one apply; the cutover variable is never set). Specs 004–074 are not edited.

---

## Phase 8: The move (operator) — delivers US1, US2, US3 in dev

⚠ Each task is the operator's. Hand over the commands from [quickstart.md](quickstart.md) one step at a time and wait for the result. **Before the first one**: the 074 `customer` redeploy (merged route) must have succeeded, and W1 "before" must be walked.

- [ ] T042 [US2] **OPERATOR** W1 before: open every back-office area and note what is there. `make gateway-usage ENV=dev` (expect shared 300/300).
- [ ] T043 [US1] **OPERATOR** Step 1: set `staff_gateway_cutover = "prepare"` in `TF/dev.tfvars`; `make plan ENV=dev` — additions only; compare with the SIGNOFF draft from T027; `make apply ENV=dev`; `make dns-verify ENV=dev`.
- [ ] T044 [US1] **OPERATOR** Step 2: `make edge-deploy SERVICE=catalog ENV=dev`; `make gateway-usage ENV=dev` (shared 293, staff 7, no orphan routes); `curl` the catalog health route on the staff address. ⚠ If the deployment fails or leaves routes on both gateways, stop — fallback is `make edge-remove SERVICE=catalog` then deploy (research, Unknowns).
- [ ] T045 [US2] **OPERATOR** Step 3: `staff_gateway_cutover = "forward"`; `make apply ENV=dev`; reload back-office → Product review works through the old address (signed in, a write action included — this is the check that the sign-in header and CORS survive forwarding).
- [ ] T046 [US2] **OPERATOR** Step 4: deploy `orders`, `fleet`, `admin`, `inventory-staff`, `inventory` in that order, reloading the matching back-office area after each (W2); `make edge-health ENV=dev CUTOVER=1`. During it, place and progress one order on the customer, shop and driver apps (W3).
- [ ] T047 [US2] **OPERATOR** Step 5: `staff_gateway_cutover = "website"`; `make apply ENV=dev`; rebuild back-office (push to `dev`); update the local `apps/back-office/.env`; confirm in the browser's network panel that requests go to the staff address.
- [ ] T048 [US3] **OPERATOR** Step 6: remove the `staff_gateway_cutover` line; `make plan ENV=dev` — only the five forwarding routes and integrations, the shared back-office authorizer and its parameter destroyed, shared CORS shortened; `make apply ENV=dev`; `make gateway-usage ENV=dev` (≈ 53% / 47%); `make edge-health ENV=dev`.
- [ ] T049 [US3] **OPERATOR** Walks W1 (after), W4 (live update), W5 (`make shop-verify-isolation …` with all four tokens), W6 (one refund, one cancellation — each once).
- [ ] T050 [US4] **OPERATOR** W7: `make gateway-usage ENV=dev`; confirm `GatewayUsagePercent` has four series after the first hourly run; trip one alarm by temporarily lowering its threshold in a plan, confirm the alert arrives, restore.

---

## Phase 9: User Story 6 — It can be undone, and done again elsewhere (P3)

**Goal**: written undo; a fresh environment needs nothing extra.

**Independent test**: the undo runbook is complete enough to follow cold; `terraform validate` with the default variable describes the finished state with no forwarding resources.

- [ ] T051 [US6] Expand "Undo" in `specs/075-staff-gateway/quickstart.md` into exact steps for both ways in research R8: the capacity check first (`make gateway-usage`; stop if shared routes + staff routes > 300), then (simple) revert the five stack files' parameters, redeploy, set the website back; (no gap) the forwarding technique reversed — and add to `TF/staff-gateway-forwarding.tf` a commented description of the reverse routes rather than dead resources. State plainly when undo stops being possible.
- [ ] T052 [US6] Add to `EA/shared/src/lib/gateway-placement.contract.test.ts` a Terraform-source check for FR-025: `staff_gateway_cutover` defaults to `"complete"`, and no file under `infra/envs/` other than `dev/dev.tfvars` sets it; `dev/dev.tfvars` may set it only during the move (T055 tightens this).
- [ ] T053 [US6] In `infra/envs/README.md` "Standing up a new environment": the order (apply → deploy every stack, including `inventory-staff` → build the consoles), and that both gateways and all parameters come from the one apply.
- [ ] T054 [US6] **OPERATOR** (optional, SC-009; only while the shared gateway still has room) rehearse undo and the move again in dev by following the runbook alone; record the time taken and anything the runbook got wrong.

---

## Phase 10: Polish

- [ ] T055 After T048 and once SIGNOFF is accepted: the forwarding routes are a dev-only migration aid (research R9), so remove `TF/staff-gateway-forwarding.tf`, reduce `staff_gateway_cutover` in `TF/variables.tf` to nothing (delete the variable and the conditionals in `TF/edge-gateway.tf` and `TF/amplify-consoles.tf`, leaving the finished state unconditional), drop the five-route allowance from T007's test, and replace T052's assertion with "no file under `infra/envs/` mentions `staff_gateway_cutover`". `make validate ENV=dev`; the operator's next `make plan` must show no changes.
- [ ] T056 [P] Write `specs/075-staff-gateway/SIGNOFF.md`: what changed, machine checks with counts, each guard broken and caught (T008, T030, and G1/G5/G6/G7), the real plan outputs against the T027 predictions, usage before and after, walk results, the measured back-office gap (FR-008: ≤ 10 minutes), deviations, what was not verified.
- [ ] T057 [P] Add the 075 entry at the top of `FEATURE-HISTORY.md` (house style: what changed, defects found, verified, operator steps and their order — especially `inventory-staff` before `inventory`, and step 6 last).
- [ ] T058 [P] Update `docs/prd/2026-10-delivery-model-v2-backlog.md`: 075 built; back-office routes of specs 076+ attach to the staff gateway.
- [ ] T059 Full run: `pnpm -r typecheck`; `pnpm --filter "@effy/edge-*" test`; `pnpm --filter back-office test`; `make validate ENV=dev`; `make fmt`; `scripts/check-no-refresh-timers.sh`. Grep the whole diff for any email address, account id or hostname that is not derived from a variable (Prohibited values).

---

## Dependencies

```
T001 ─► everything (the amendment comes first)
T002 ─► T007, T009, T015, T022, T029, T052
T004 ─► T005 ─► T006, T020, T021, T028, T037
Phase 2 ─► Phase 3 (US1) ─► Phase 4 (US2) ─► Phase 8
Phase 3 ─► Phase 5 (US3: T029 needs the re-pointed stacks; T028 needs T004)
Phase 2 ─► Phase 6 (US4) — independent of US1–US3 except T037 ↔ T022 (same test file: do T022 first)
Phase 7 (US5) — after Phase 3, otherwise independent
Phase 8 needs Phases 3, 4, 5 complete and Phase 6 at least to T032 (gateway-usage is used at every step)
Phase 9: T051–T053 any time after Phase 4; T054 after T048
T055 after T048 and SIGNOFF acceptance
```

Same-file sequences: `gateway-placement.contract.test.ts` T009 → T015 → T029 → T052; `Makefile` T018 →
T023 → T024 → T031 → T032; `EA/admin/serverless.yml` T010 → T035; `TF/staff-gateway.tf` T005 → T006.

## Parallel examples

- Phase 1: T002 ∥ T003.
- US1: T010 ∥ T011 ∥ T012 ∥ T013 (four different `serverless.yml`), then T016.
- US2: T023 ∥ T024 ∥ T025.
- US5: T039 ∥ T040 ∥ T041.
- US4 (T032–T038) can be built alongside US2/US3 — different files, apart from the two noted above.

## Implementation strategy

**MVP = Phases 1–5 + Phase 8.** That is the move itself: it frees the shared gateway and unblocks spec
076. US1, US2 and US3 are all P1 and cannot ship separately — a moved stack without the cutover
machinery is an outage, and without the authorizer change is a weaker boundary than the spec allows.

**Then** US4 (so the next overflow is an alarm, not a failed deploy) — build it before Phase 8 if at all
possible, because `make gateway-usage` is the instrument for every step of the move. **Then** US5, US6,
polish.

Stop points where everything works and the operator may pause: after T043, after T045, after each
deployment in T046, after T047.
