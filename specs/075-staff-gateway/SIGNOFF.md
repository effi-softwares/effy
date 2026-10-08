# Sign-off: 075 — A Second Front Door for Back-Office

**Status (2026-10-08)**: **moved in dev and cleaned up.** The operator ran steps 1–6; verified from the
live environment afterwards: shared gateway **158 / 300 (53%)**, staff gateway **144 / 300 (48%)**,
every service healthy on its own gateway, and `/effy/dev/edge/authorizer/back-office_id` gone. T055 has
since removed the cutover variable and the forwarding-routes file. **Still open (operator):** one
`make plan` that must show no changes; walks W1 and W4–W7; the optional undo rehearsal (T054). Not
committed.

## What changed

- **Constitution v3.2.0**: one backend, two gateways. A plan states which gateway a service attaches
  to; a third gateway needs an amendment.
- **A staff gateway in Terraform** (`infra/envs/dev/staff-gateway.tf`): its own HTTP API, hostname
  (`staff-api.<zone>`), one authorizer (back-office), back-office-only CORS, four parameters under
  `/effy/<env>/staff/`, its own 5xx alarm.
- **Five stacks attach to it**: `admin`, `fleet`, `orders`, `catalog`, and `inventory-staff` — a new
  second stack file in the `inventory` directory holding the six back-office stock routes. No handler
  moved; no path changed.
- **The shared gateway loses its back-office authorizer and origin** at the end of the move.
- **A staged move** driven by one variable (`staff_gateway_cutover`), with five temporary forwarding
  routes so back-office keeps working while stacks move one at a time.
- **Usage is measured**: a contract test (what the tree would deploy), `make gateway-usage` (what is
  deployed), and an hourly `gatewayUsage` function in `admin` with alarms at 75% and 90% per gateway
  and a failed-run alarm.
- **Tooling**: `make edge-deploy SERVICE=inventory-staff`; the deploy prompt names the gateway;
  `make edge-health` probes each service on its own gateway; `make shop-verify-isolation` checks both
  gateways in every direction; `make dns-verify` checks the staff hostname.
- **Documents**: `docs/api/shared-gateway.md` (now both gateways), `docs/api/path-assignment.md`
  (gateway rule, three examples, what to do near the ceiling), ARCHITECTURE, CLAUDE, AGENTS,
  `infra/envs/README.md`, back-office env example.

## The numbers

| | Before (tree and dev) | After (tree; dev once moved) |
|---|---|---|
| shared | 300 / 300 routes, 300 / 300 integrations — 100% | 158 / 158 — **53%** |
| staff | — | 144 / 144 — **48%** |

Staff is 144, not the 142 planned: `inventory-staff` has its own two health routes. SC-001 (≤ 60%) holds.

## Verified by machine

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean |
| edge-shared | 596 passed (incl. serverless-stacks 5, gateway-capacity 3, gateway-placement 28) |
| edge-admin | 199 passed (incl. gateway-usage 6) |
| edge-inventory · catalog · orders · fleet | 61 · 14 · 27 · 156 passed |
| every other edge service | passed (commerce 236, customer 179, shop 386, storefront 166, driver 71, notifications 64, auth 151, live 41, ops 18) |
| back-office | 297 passed |
| `terraform validate`, `terraform fmt -check` (dev root) | clean |
| `bash -n` on the four scripts | clean |
| `check-no-refresh-timers.sh` | OK |

Container tests were not re-run: nothing in this feature touches SQL or a repository.

**Guards broken once and caught:**

| Guard | Broken by | Result |
|---|---|---|
| G1 capacity | one extra route in `customer/serverless.yml` on the pre-move tree | failed: "the shared gateway would hold 301 routes of 300" — it would have caught 074 |
| G4 staff routes use only the staff authorizer | one `orders` route pointed at `/edge/authorizer/customer_id` | failed, naming the route |
| G3 no back-office authorizer on shared | one `shop` route pointed at `/edge/authorizer/back-office_id` | failed, twice (also "Terraform does not publish it") |
| G5 inventory split complete | one function deleted from `serverless.staff.yml` | failed: "declared by 0 of the two inventory stacks" |

**Not broken by mutation**: G2 (placement table), G6 (stack discovery in the alarm and live
contracts), G7 (usage function) — covered by passing tests only.

## What each step's plan should show (compare with the real output)

| Step | `staff_gateway_cutover` | Expected `make plan` |
|---|---|---|
| 1 | `"prepare"` (already in `dev.tfvars`) | **Add only**: staff API, stage, authorizer, domain name, API mapping, 2 DNS records, 4 SSM parameters, staff 5xx alarm, 4 gateway-usage alarms, 1 background alarm (`gateway-usage`). **0 to change, 0 to destroy.** |
| 3 | `"forward"` | **Add** 5 integrations + 5 routes on the shared API. Nothing else. |
| 5 | `"website"` | **Change** the back-office Amplify app's environment variables (`VITE_API_BASE_URL`). Nothing else. |
| 6 | line removed | **Destroy** 5 routes + 5 integrations, the shared gateway's `back-office` authorizer, its SSM parameter. **Change** the shared API's CORS origins (two removed). Nothing else. |

⚠ At step 1, if the shared API, any of its three other authorizers, or any Cognito pool shows a change
or a replacement: stop and send me the plan.

## Findings while building

- ⚠ **`make dns-verify` would have passed while proving nothing.** It probed `/admin/healthz` on the
  shared gateway and on its raw URL and checked the two agree. After the move both answer 404 — and
  still agree. It now probes a service that lives on each gateway.
- ⚠ **The default cutover value is unsafe for dev mid-move**, so `dev.tfvars` now sets `"prepare"`.
  Without it, an ordinary `make apply` on this tree would have pointed the back-office website at a
  gateway with no services on it. (Deleting the in-use authorizer would have failed; the website
  switch would not.)
- **The usage function must read both gateways' ids**, so the first version of "a staff stack reads no
  `/edge/` parameter" was wrong; the guard is now about authorizers, which is the boundary that matters.
- **`catalog` has no `readyz` route**; the health script now reports that as "no readyz route" rather
  than as down.
- **Existing guards found stacks by reading `<dir>/serverless.yml`** (scheduled-function alarms, the
  live channel). Both now go through `listStacks()`.

## Deviations from the plan

| Task | What differs |
|---|---|
| T002 | No YAML library: the existing guards read stack files with regular expressions, and the reader follows them. It throws on an `httpApi` event it cannot parse rather than skipping it. |
| T014 | `inventory` has no scheduled or queue function, so nothing "stays" — the guard asserts the staff stack has none. |
| T019 | The stacks were not packaged: `serverless package` resolves the `/staff/` parameters, which do not exist until step 1 is applied. |
| T027 | Predictions are read from the Terraform source, not from a plan run. |
| T037 | Four usage alarms (each on the higher of a gateway's two limits), plus the background one. |
| — | `dev.tfvars` sets `staff_gateway_cutover = "prepare"` now (see Findings). |

## After the move (2026-10-08)

- `make gateway-usage` had a bug on first use: the CLI applies `--query` per page, so it printed one
  count per page and the arithmetic failed. It now counts ids across all pages.
- **T055**: `staff_gateway_cutover`, its conditionals and `staff-gateway-forwarding.tf` are removed;
  the finished state is unconditional. The three shared authorizers keep their addresses (the pool map
  is filtered, not re-keyed), so the next plan should show **no changes**. Guards: 30 pass; a new one
  fails if the variable or a forwarding route reappears in any environment.

## Not verified

- **Nothing has run against AWS.** In particular, unproven until the move:
  1. that redeploying a stack against another gateway moves its routes cleanly (step 2, `catalog`);
  2. that forwarded requests keep the sign-in header and pass CORS (step 3, product review);
  3. that the usage function's permission (`apigateway:GET` on the two APIs' routes and integrations)
     is sufficient (first hourly run after `admin` is deployed).
- The 75% / 90% alarms have never fired.
- The undo runbook has not been rehearsed.

## Operator steps

Before anything: the 074 `customer` redeploy (merged route) must have succeeded.

Then [quickstart.md](quickstart.md) → "The move", steps 1–6, one at a time. In short:

```sh
make gateway-usage ENV=dev                         # before: shared 300 / 300
make plan ENV=dev && make apply ENV=dev            # 1  (dev.tfvars already says "prepare")
make edge-deploy SERVICE=catalog ENV=dev           # 2  ⚠ product review down until step 3
#    dev.tfvars → "forward";  make apply ENV=dev   # 3
make edge-deploy SERVICE=orders ENV=dev            # 4
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=admin ENV=dev
make edge-deploy SERVICE=inventory-staff ENV=dev   #    ⚠ BEFORE inventory
make edge-deploy SERVICE=inventory ENV=dev
#    dev.tfvars → "website";  make apply ENV=dev; rebuild back-office     # 5
#    dev.tfvars → delete the line;  make apply ENV=dev                    # 6
make gateway-usage ENV=dev && make edge-health ENV=dev
```

Then walks W1–W7. Afterwards T055 removes the forwarding file and the cutover variable.
