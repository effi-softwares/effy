# Implementation Plan: A Second Front Door for Back-Office

**Branch**: `dev` (feature directory `075-staff-gateway`) | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/075-staff-gateway/spec.md`

## Summary

The shared HTTP gateway is full: 300 of 300 routes and 300 of 300 integrations, and the integration
limit cannot be raised (research F1). 074's deploy was refused and only completed by merging two
routes. Nothing more can be added.

Back-office moves to a **second gateway, the staff gateway**, on its own hostname. That is 142 routes
— `admin`, `fleet`, `orders`, `catalog` and the back-office part of `inventory` — leaving the shared
gateway at about 158 (53%) and the staff gateway at about 142 (47%).

The approach, in six decisions (reasoning in [research.md](research.md)):

1. **A second HTTP API for back-office only** (R1). No code moves between services; each back-office
   stack changes which gateway it attaches to.
2. **Its own hostname**, `<staff_api_subdomain>.<env zone>`, default label `staff-api` (R2). Paths are
   unchanged, so no route table and no back-office API call changes — only the website's base address.
3. **One authorizer per audience boundary** (R3). The staff gateway has only the back-office
   authorizer; the shared gateway loses it at the end. Audience separation becomes structural.
4. **`inventory` becomes two stacks from one source** (R4): `serverless.yml` (shop) and
   `serverless.staff.yml` → `effy-edge-inventory-staff`.
5. **A cutover with one planned gap** (R5): temporary forwarding routes on the shared gateway let the
   stacks move one at a time while the website keeps its old address. `catalog` moves first to make
   room for them; product review is unreachable for the few minutes in between.
6. **Usage is measured three ways** (R6): a contract test before deploy, `make gateway-usage` on
   demand, and an hourly function with alarms at 75% and 90%.

Principle III is amended to **v3.2.0**: one backend, two gateways (R7).

## Technical Context

**Language/Version**: Terraform (AWS provider, as pinned in `infra/envs/dev`); Serverless Framework v3
YAML; TypeScript on Node 22 (one scheduled function, contract tests); Bash (two scripts); Make.

**Primary Dependencies**: one added — `@aws-sdk/client-apigatewayv2` in `apis/edge-api/admin` (the
usage reader). Everything else exists.

**Storage**: none. No migration, no table.

**Testing**: Vitest contract tests reading every `serverless*.yml` and the Terraform sources (G1–G7 in
[quickstart.md](quickstart.md)); a unit test for the usage function with a faked client;
`terraform validate`. The move itself is verified by the walks W1–W7 — a gateway cutover is a property
of the live environment and is not unit-testable.

**Target Platform**: `infra/envs/dev`; services `admin`, `fleet`, `orders`, `catalog`, `inventory`;
app `back-office` (configuration only).

**Project Type**: monorepo — infrastructure + backend configuration + one small function.

**Performance Goals**: none new. During the move a forwarded request makes one extra hop inside the
region (shared gateway → staff gateway); it disappears at step 5.

**Constraints**: nothing unavailable to customers, shops or drivers (FR-008); back-office gap of
minutes, one screen (FR-009); no customer, shop or driver app changes or releases (FR-006/007); no
always-on compute; the operator runs every apply and deploy; undo possible until the freed room is
used (FR-023).

**Scale/Scope**: 1 new gateway (API, stage, authorizer, domain, mapping, 2 DNS records, 4 parameters,
5xx alarm); 5 temporary routes; 4 `serverless.yml` re-pointed + 1 new `serverless.staff.yml`; 1
scheduled function + 5 alarms; 3 new contract tests and ~9 existing ones taught about two gateways;
2 scripts; 1 constitution amendment; 5 documents corrected. No UI change.

## Constitution Check

*Constitution v3.1.0. Gate evaluated before research and again after design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology; this plan cites research for every choice. |
| II. Shared contracts | ✅ | No DTO changes. The gateway contract is written once (`docs/api/shared-gateway.md`, updated to cover both). |
| **III. Single serverless backend** | ⚠ **amendment required** | The text says "behind the shared HTTP gateway". A second gateway contradicts the sentence, not the principle: still one backend, one runtime, `apis/edge-api` only, no always-on compute. See Complexity Tracking. **The amendment is the first task**; nothing is built before it. |
| III. Service per audience and domain | ✅ improved | `inventory` mixes audiences today; its back-office routes become their own stack. Recorded in R4. |
| III. A rule has one implementation | ✅ | Both inventory stacks bundle the same handlers. |
| IV. Auth isolation | ✅ strengthened | Per-gateway as well as per-route (R3). Issuer pinning in each service is untouched; the staff record remains authoritative. |
| V. Design | n/a | No screen changes. |
| VI. Layered architecture | ✅ | The usage function is handler → service → an API Gateway reader, wired by hand. |
| VII. Observability | ✅ | The staff gateway gets its own 5xx alarm; the new scheduled function gets a failed-invocation alarm (the scheduled-alarm contract requires it); usage metric through the shared metrics helper. |
| Real-world identifiers | ✅ | `staff-api` is a label in the environment's own zone, behind a variable. No email, account id or endpoint is introduced; alarms go to the existing alerts topic. |
| Operator runs live changes | ✅ | Every apply and deploy is a handed-over command in [quickstart.md](quickstart.md). |

**Post-design re-check**: unchanged. One violation, justified below, resolved by amendment.

## Project Structure

### Documentation (this feature)

```text
specs/075-staff-gateway/
├── plan.md
├── research.md                      # F1, R1–R9
├── data-model.md                    # the two gateways, placement table, states of the move
├── quickstart.md                    # machine checks, the move, walks, undo
├── contracts/gateway.contract.md    # parameters, cutover variable, forwarding routes, usage metric
└── tasks.md                         # /speckit-tasks
```

### Source Code (repository root)

```text
.specify/memory/constitution.md               # v3.2.0 — Principle III: one backend, two gateways

infra/envs/dev/
├── staff-gateway.tf            NEW  # API, $default stage, back-office authorizer, CORS, domain,
│                                    #   mapping, A/AAAA, 4 SSM parameters, 5xx alarm
├── staff-gateway-forwarding.tf NEW  # 5 HTTP_PROXY integrations + 5 ANY routes on the SHARED gateway,
│                                    #   count-gated on var.staff_gateway_cutover
├── gateway-usage.tf            NEW  # 4 alarms (2 gateways × 75/90, max over both limits)
├── edge-gateway.tf                  # back-office authorizer + its parameter + back-office CORS origin
│                                    #   become conditional on the cutover variable
├── amplify-consoles.tf              # back-office VITE_API_BASE_URL: shared or staff by the variable;
│                                    #   shop-web's stays on the shared address
├── background-functions.tf          # + failed-invocation alarm for gatewayUsage
├── variables.tf                     # staff_api_subdomain (default "staff-api"),
│                                    #   staff_gateway_cutover (default "complete", validated)
└── outputs.tf                       # staff_api_endpoint

apis/edge-api/
├── admin/
│   ├── serverless.yml               # httpApi.id + authorizer → /staff/…; + gatewayUsage (hourly),
│   │                                #   IAM: apigateway:GET on the two APIs' routes and integrations
│   ├── src/functions/gateway-usage-scheduled.ts   NEW
│   ├── src/gateway-usage/{service,reader}.ts      NEW  (+ service.test.ts)
│   └── package.json                 # + @aws-sdk/client-apigatewayv2
├── fleet/serverless.yml             # → /staff/…
├── orders/serverless.yml            # → /staff/…
├── catalog/serverless.yml           # → /staff/…
├── inventory/
│   ├── serverless.yml               # loses the six admin-* functions
│   └── serverless.staff.yml    NEW  # effy-edge-inventory-staff: the six admin-* functions +
│                                    #   /inventory-staff/healthz|readyz, on the staff gateway
└── shared/src/lib/
    ├── gateway-capacity.contract.test.ts    NEW  # G1: ≤ 300 routes and integrations per gateway
    ├── gateway-placement.contract.test.ts   NEW  # G2–G5: who attaches where, which authorizers
    ├── serverless-stacks.ts                 NEW  # the one place that lists every serverless*.yml
    └── background-alarms.contract.test.ts        # reads stacks through serverless-stacks.ts (G6)
   shared/src/live/live.contract.test.ts          # same
   {catalog,inventory,orders,fleet}/…/config.contract.test.ts   # expect /staff/ parameters
   {commerce,driver}/…/config.contract.test.ts                  # unchanged — still /edge/

Makefile                             # edge-deploy/edge-remove/edge-offline: SERVICE=inventory-staff →
                                     #   inventory dir + --config serverless.staff.yml; the deploy
                                     #   prompt names the gateway; edge-health probes both gateways;
                                     #   gateway-usage NEW; the back-office verify targets read /staff/
scripts/gateway-usage.sh        NEW  # read-only: route + integration counts for both gateways
scripts/edge-health.sh               # takes a list of (address, services) pairs
scripts/dns-verify.sh                # also checks the staff hostname's TLS chain

apps/back-office/.env.example        # VITE_API_BASE_URL → the staff address
apps/back-office/README.md           # same

docs/api/shared-gateway.md           # describes both gateways; the staff contract
docs/api/path-assignment.md          # gains the gateway column + "when a gateway nears its ceiling"
ARCHITECTURE.md · CLAUDE.md · infra/envs/README.md · FEATURE-HISTORY.md
```

**Structure Decision**: no new directory under `apis/edge-api/` and no new workspace package. The
second inventory stack is a second configuration file beside the first (R4). Stack discovery, today
repeated in several contract tests as "read `<dir>/serverless.yml`", moves into one helper so that a
future extra stack file cannot be invisible to a guard.

## Placement (Principle III: which service, which gateway)

| Change | Service | Gateway | Why |
|---|---|---|---|
| Re-pointed, no code change | `admin`, `fleet`, `orders`, `catalog` | staff | back-office audience |
| Split out | `inventory-staff` | staff | the six `/inventory/v1/admin/…` routes |
| `gatewayUsage` scheduled function | `admin` | none (no route) | platform health for the operator; `admin` already runs the hourly `sesIdentityHealth` probe |
| Unchanged | `storefront`, `commerce`, `customer`, `shop`, `inventory`, `driver`, `notifications`, `auth`, `live` | shared / none | not back-office |

## Build order

1. **Amend the constitution** to v3.2.0 (sync-impact report at the top, Principle III text,
   Technology Standards line for the gateways).
2. **Guards first**: `serverless-stacks.ts`; the capacity test (G1) — it must fail on today's tree if a
   route is added, proving it would have caught 074; the placement tests (G2–G5), written against the
   target and red until step 4.
3. **Infrastructure**: variables with validation; `staff-gateway.tf`; the conditionals in
   `edge-gateway.tf`; `staff-gateway-forwarding.tf`; `amplify-consoles.tf`; `terraform validate`.
4. **Services**: re-point the four `serverless.yml`; split `inventory`; update the config contract
   tests; G2–G6 green.
5. **Usage**: reader + service + handler in `admin`; `gateway-usage.tf` and the background alarm;
   `scripts/gateway-usage.sh`; G7.
6. **Operator tooling**: Makefile targets, `edge-health.sh`, `dns-verify.sh`.
7. **Documents**: gateway contract, path assignment (with the ceiling rule, FR-020–FR-022),
   ARCHITECTURE, CLAUDE, env README, back-office env example.
8. **Hand over** the move ([quickstart.md](quickstart.md) states 1–6), then the walks, then SIGNOFF
   and FEATURE-HISTORY.

Steps 2–7 change nothing live. Everything deployed before step 8 keeps working, because a stack only
moves when the operator redeploys it.

## Risks

| Risk | What limits it |
|---|---|
| A stack does not move cleanly between gateways (orphan routes, or a failed CloudFormation update) | `catalog` goes first — 7 routes, one screen. Fallback for that stack: `edge-remove` then `edge-deploy` (research, Unknowns). The move stops there until understood. |
| Forwarded requests lose the sign-in header or fail CORS | Checked at step 3 on product review alone, before anything else depends on forwarding. The shared gateway answers the browser's preflight itself, as today. |
| An unrelated `make apply` during the move removes the forwarding routes | The cutover value lives in `dev.tfvars`, not on a command line. |
| Step 6 run too early | AWS refuses to delete an authorizer a route still uses; the apply fails without breaking anything. |
| Undo after the freed room is used | Not possible; the runbook checks and says so (R8). |
| The usage function reads a gateway it has no permission on | Its failed-invocation alarm; G7 covers the parsing, the W7 walk the permission. |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle III: "behind the shared HTTP gateway" / "every client calls the one gateway" — a second gateway | The integration limit (300 per HTTP API) is not adjustable and is reached; no route can be added to the platform. | *Raise the quota*: integrations cannot be raised. *One function per service with an internal router*: gives up per-route authorizers, per-function permissions and timeouts, and rewrites every service. *Fewer, fatter routes*: what 074 was forced into; it changes contracts to fit a counter. Resolved by amending to **v3.2.0** before any build task; a third gateway needs the same amendment. |
| A second Serverless stack in one service directory (`inventory`) | A stack attaches to exactly one gateway, and `inventory` serves two audiences. | *A new service directory*: its handlers would import another service's source. *Moving the routes into `admin`*: stock rules in two services. |
| Temporary infrastructure (5 forwarding routes) that exists only for the move | Without it, back-office is partly dead for the whole sequence of deployments (FR-009). | *Move all, then rebuild the website*: tens of minutes of partial outage. *Two base addresses in the website*: permanent client complexity for a one-off. Gated by a variable whose default removes them. |
