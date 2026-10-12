# Quickstart — validating 084

## Run

```sh
pnpm install
pnpm --filter @effy/customer-web dev          # http://localhost:3000, against dev's gateway
```

## Checks (all must pass)

```sh
pnpm --filter @effy/design-system test         # console guards + storefront tokens + token usage
pnpm --filter @effy/customer-web typecheck
pnpm --filter @effy/customer-web test
pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size
pnpm --filter @effy/customer-web e2e
pnpm --filter @effy/edge-storefront test && pnpm --filter @effy/edge-commerce test
pnpm --filter @effy/edge-shared test -- gateway-capacity
./scripts/check-no-emerald.sh && ./scripts/check-no-jade.sh && ./scripts/check-no-refresh-timers.sh
./scripts/check-no-storefront-red.sh
```

(Package filter names are as each `package.json` declares; adjust if they differ.)

## Operator steps

```sh
# backend first — the web reads new fields defensively, so order is safe either way
AWS_PROFILE=ef make deploy SERVICE=storefront ENV=dev
AWS_PROFILE=ef make deploy SERVICE=commerce ENV=dev
AWS_PROFILE=ef make gateway-usage ENV=dev
# then customer-web through its pipeline (042)
```

## The walk

Open [screen-index.md](screen-index.md). For each row, open the reference PNG beside the running page
at 1440 wide (D) or 390 wide (P) and tick it. States that need setting up:

| State | How |
| --- | --- |
| Home — empty store / unavailable | point `EDGE_API_URL` at an empty env / an unreachable host |
| Checkout — courier only / not serviced | an address outside the postcode list, with courier on / off |
| Window closed / full | a window past cutoff; a window at capacity |
| Payment declined / 3DS | Stripe test cards `4000 0000 0000 0002` / `4000 0027 6000 3184` |
| Confirmation pending / not completed | return with `redirect_status=processing` / `failed` |
| Order moved to courier | back-office override (081) on a paid Effy order |
| Delete blocked | an account with an order in progress; an address on an open order |

## Totals parity (SC-004)

Before the redesign lands, record quote + intent totals for the fixed carts in
`apps/customer-web/e2e/delivery.spec.ts`; they must be identical after.
