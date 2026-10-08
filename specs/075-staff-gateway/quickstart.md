# Quickstart: A Second Front Door for Back-Office (075)

Contract: [contracts/gateway.contract.md](contracts/gateway.contract.md) · States:
[data-model.md](data-model.md) · Why each step: [research.md](research.md) R5.

## Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/edge-shared test        # gateway-capacity + scheduled-alarm + live contracts
for s in admin fleet orders catalog inventory; do pnpm --filter @effy/edge-$s test; done
bash -n scripts/gateway-usage.sh scripts/edge-health.sh scripts/verify-cross-pool.sh scripts/dns-verify.sh
pnpm --filter back-office test
make validate ENV=dev && make fmt
```

Proofs, each broken once to see it fail:

| # | Proves | Spec |
|---|---|---|
| G1 | Capacity contract: adding routes past 300 on either gateway fails the test and names the gateway | FR-018 |
| G2 | Every back-office stack reads the **staff** parameters; every other stack reads the **shared** ones | FR-001/003 |
| G3 | No stack on the shared gateway references the back-office authorizer | FR-013 |
| G4 | No stack on the staff gateway references a customer, shop or driver authorizer | FR-012 |
| G5 | `inventory` and `inventory-staff` between them declare every stock function exactly once | FR-004 |
| G6 | The scheduled-function alarm contract and the live contract still see every stack, including `serverless.staff.yml` | FR-010 |
| G7 | `gatewayUsage` emits one reading per gateway per limit, and 0–100 | FR-016/017 |

## The move (operator) — states 0 → 6

> **Done in dev on 2026-10-08, and the machinery has been removed (T055):** `staff_gateway_cutover`
> and `infra/envs/dev/staff-gateway-forwarding.tf` no longer exist. What follows is the record of how
> it was done. To repeat it elsewhere, restore both from git history (the commit before T055).

One variable in `infra/envs/dev/dev.tfvars` drives the infrastructure side: `staff_gateway_cutover`.
It is set in the file, not on the command line, so a later unrelated `make apply` cannot silently
take the forwarding routes away. Run `make gateway-usage ENV=dev` before and after each step.

```sh
# 1 — the staff gateway (nothing uses it yet)
#     dev.tfvars: staff_gateway_cutover = "prepare"   (already set — do NOT remove it before step 6)
make plan ENV=dev      # expect ONLY additions: 1 API, 1 stage, 1 authorizer, 1 domain + mapping,
make apply ENV=dev     #   2 DNS records, 4 parameters, alarms. Nothing changed or destroyed.

# 2 — catalog (7 routes). ⚠ Product review is unreachable from the end of this until step 3.
make edge-deploy SERVICE=catalog ENV=dev
make edge-health ENV=dev CUTOVER=1            # catalog answers on the staff address; the rest still on shared
make gateway-usage ENV=dev                    # shared 293, staff 7

# 3 — forwarding routes on the shared gateway (+5 routes, +5 integrations → 298)
#     dev.tfvars: staff_gateway_cutover = "forward"
make apply ENV=dev
#     back-office → Product review loads again, through the forwarding route

# 4 — the rest, one at a time; back-office keeps working throughout
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=admin ENV=dev
make edge-deploy SERVICE=inventory-staff ENV=dev      # ⚠ BEFORE inventory
make edge-deploy SERVICE=inventory ENV=dev            # sheds its six back-office routes
make edge-health ENV=dev CUTOVER=1

# 5 — the website
#     dev.tfvars: staff_gateway_cutover = "website"
make apply ENV=dev                            # back-office VITE_API_BASE_URL → the staff address
#     push to dev (or re-run the back-office Amplify build); set apps/back-office/.env.local too

# 6 — clean up
#     dev.tfvars: remove the staff_gateway_cutover line (default "complete")
make plan ENV=dev      # expect ONLY: 5 forwarding routes + 5 integrations, the shared gateway's
make apply ENV=dev     #   back-office authorizer and its parameter destroyed; shared CORS list shortened
make gateway-usage ENV=dev                    # shared 158 (53%), staff 144 (48%)
make edge-health ENV=dev                      # no CUTOVER: every service on its own gateway
```

⚠ **`inventory-staff` goes before `inventory`.** Deployed first, its six functions exist on the staff
gateway while the shared gateway's own six routes still answer; when `inventory` is then redeployed
without them, the forwarding route takes over at once. The other way round, stock administration is
unreachable between the two deployments.

⚠ **Step 6 needs every back-office stack already moved.** A stack still on the shared gateway holds a
reference to the back-office authorizer, and AWS refuses to delete an authorizer in use — the apply
fails rather than breaking anything, and `make gateway-usage` shows which stack is left.

Stop and send me the plan output if step 1 shows anything changed or destroyed.

## Walks (dev)

| # | When | Do | Expect |
|---|---|---|---|
| W1 | before step 1 and after step 6 | Open every back-office area: Dashboard, Shops, Orders (+ Assignments, Handover), Customers, Catalog, Product review, Promotions, Delivery, Drivers, Vehicles, Exceptions, Deliverability, Feedback, Admin | Identical: same data, same actions, same role rules |
| W2 | after each of steps 3 and 4 | Reload back-office; open the area just moved | Works, through the old address |
| W3 | during step 4 | Place, pack, collect and deliver one order on customer / shop / driver apps | Nothing unavailable |
| W4 | after step 6 | With an order open in back-office, change it from the shop console | The back-office screen updates by itself |
| W5 | after step 6 | Call a staff route with a customer token, a shop token and a driver token; call a shop route and a customer route with a staff token | Every one refused (401) |
| W6 | after step 6 | Issue a refund and cancel an order in back-office | Each happens exactly once |
| W7 | after step 6 | `make gateway-usage ENV=dev`; lower an alarm threshold below the reading in a test | Numbers shown; the alert arrives |

## Undo

Undo is the move in reverse. It is possible **only while the shared gateway has room** for everything
that would come back.

```sh
make gateway-usage ENV=dev
# ⚠ STOP unless (shared routes + staff routes − 2) ≤ 300 and the same for integrations.
#   (−2: the staff stack's own two health routes do not come back.)
#   Once later features have used the freed room, undo is NOT possible. Fix forward instead.
```

### The simple way — back-office is down for the length of the deployments (acceptable in dev)

```sh
# 1  restore the shared gateway's back-office authorizer, parameter and CORS origin, and point the
#    back-office website at the shared address — in edge-gateway.tf: shared_pools = local.edge_pools,
#    shared_gateway_origins = browser_origins + storefront_origins; in amplify-consoles.tf:
#    back_office_api_base_url = local.api_url
make apply ENV=dev
# 2  in admin, fleet, orders, catalog serverless.yml:  /staff/http_api_id → /edge/http_api_id
#                                                      /staff/authorizer/back-office_id → /edge/authorizer/back-office_id
#    move the six admin-* functions from inventory/serverless.staff.yml back into serverless.yml
#    (git revert of the 075 stack-file changes does all of this)
make edge-deploy SERVICE=catalog ENV=dev              # each stack's routes leave the staff gateway and
make edge-deploy SERVICE=orders ENV=dev               #   return to the shared one
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=admin ENV=dev
make edge-remove SERVICE=inventory-staff ENV=dev
make edge-deploy SERVICE=inventory ENV=dev
# 3  rebuild back-office (it now carries the shared address again); make edge-health ENV=dev
```
The staff gateway stays, empty and costing nothing. The contract tests G2–G5 will be red on the
reverted tree — that is correct: they describe 075, and reverting 075 reverts them with it.

### Without a gap — the forwarding technique, the other way round

The same five routes the move used (`staff-gateway-forwarding.tf`, in git history before T055; the
shape is in research R5 and contracts/gateway.contract.md), but created on the **staff**
gateway and pointing at the **shared** address, with the website left on the staff address until the
last stack is back. They are not kept in Terraform (dead infrastructure for a path that may never be
taken): copy that file's two resources, swap `aws_apigatewayv2_api.edge` for `.staff` and
`local.staff_api_url` for `local.api_url`, apply, move the stacks back one at a time, switch the
website, then delete the copy. The staff gateway has room for five routes at any point.

## Doing it again in another environment

Nothing to do. A new environment's first `make apply` creates both gateways (the cutover variable is
never set), and each stack attaches where its file says. Order: apply → `make db-up` → deploy every
stack including `inventory-staff` → build the consoles → `make gateway-usage`.
