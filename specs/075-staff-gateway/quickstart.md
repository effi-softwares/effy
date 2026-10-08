# Quickstart: A Second Front Door for Back-Office (075)

Contract: [contracts/gateway.contract.md](contracts/gateway.contract.md) · States:
[data-model.md](data-model.md) · Why each step: [research.md](research.md) R5.

## Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/edge-shared test        # gateway-capacity + scheduled-alarm + live contracts
for s in admin fleet orders catalog inventory; do pnpm --filter @effy/edge-$s test; done
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

One variable in `infra/envs/dev/dev.tfvars` drives the infrastructure side: `staff_gateway_cutover`.
It is set in the file, not on the command line, so a later unrelated `make apply` cannot silently
take the forwarding routes away. Run `make gateway-usage ENV=dev` before and after each step.

```sh
# 1 — the staff gateway (nothing uses it yet)
#     dev.tfvars: staff_gateway_cutover = "prepare"
make plan ENV=dev      # expect ONLY additions: 1 API, 1 stage, 1 authorizer, 1 domain + mapping,
make apply ENV=dev     #   2 DNS records, 4 parameters, alarms. Nothing changed or destroyed.

# 2 — catalog (7 routes). ⚠ Product review is unreachable from the end of this until step 3.
make edge-deploy SERVICE=catalog ENV=dev
make edge-health ENV=dev                      # catalog answers on the staff address
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
make edge-health ENV=dev

# 5 — the website
#     dev.tfvars: staff_gateway_cutover = "website"
make apply ENV=dev                            # back-office VITE_API_BASE_URL → the staff address
#     push to dev (or re-run the back-office Amplify build); set apps/back-office/.env.local too

# 6 — clean up
#     dev.tfvars: remove the staff_gateway_cutover line (default "complete")
make plan ENV=dev      # expect ONLY: 5 forwarding routes + 5 integrations, the shared gateway's
make apply ENV=dev     #   back-office authorizer and its parameter destroyed; shared CORS list shortened
make gateway-usage ENV=dev                    # shared ≈ 158 (53%), staff ≈ 142 (47%)
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

```sh
make gateway-usage ENV=dev      # ⚠ STOP if shared routes + 142 would pass 300 — undo is no longer possible
```
Then either the simple way (short back-office outage) or the no-gap way — both in research R8.
