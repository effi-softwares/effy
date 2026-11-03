# Quickstart: validating Guided Tours (106)

## Local checks (Claude runs these)

```bash
pnpm --filter @effy/design-system test           # token / shape guards still green with tour.tsx
pnpm --filter @effy/design-system typecheck
pnpm --filter @effy/web-kit test                 # tour engine: step filtering, offer rule, counter, keys
pnpm --filter @effy/shop-web test                # tours.test.ts (limits) + tours.guard.test.ts (every page, every target)
pnpm --filter @effy/shop-web typecheck
pnpm --filter @effy/edge-shared test             # tours store unit tests + gateway capacity (shared 167/300)
pnpm --filter @effy/edge-shop test               # handler validation (400s, one-change rule)
```

Expected: everything green. `tours.guard.test.ts` fails if a routed screen has no `useTourPage`, if a step names a
`data-tour` key that exists nowhere, or if a tour is unused. Prove the guard works by deleting one `data-tour`
attribute and watching it fail.

The container test for the store (`store.container.test.ts`) runs against a local Postgres. See memory
"container tests without Docker".

## Operator steps (the user runs these, in this order)

1. Commit.
2. `AWS_PROFILE=ef make db-up-one ENV=dev`, which applies `db/migrations/20261103120000_console_tour_state.sql` (one new
   table, nothing else touched).
3. `AWS_PROFILE=ef make edge-deploy SERVICE=shop` (two new routes; shared gateway 167/300).
4. Deploy shop-web (push; Amplify builds it).

Order matters: shop-web reads `GET /shop/v1/me/tours`. Before step 3, the read fails and **no tour starts by itself**
(R11), but Help still runs tours, so deploying out of order is safe, just quiet.

## The walk (acceptance, against dev)

Use two shop accounts: a **Manager** and a **Staff** member who have never signed in after the deploy (or choose
**Help → Show every tour again**).

| # | Do | Expect |
|---|---|---|
| 1 | Sign in as Staff | The Welcome tour starts by itself; finish it with Done and the page's own tour follows |
| 2 | Take the Welcome tour | 9 steps ("Step 1 of 9"); **no Team step**; each outlines its part; →/←/Esc work |
| 3 | Sign in as Manager on another browser | The Welcome tour has 10 steps, including Team |
| 4 | Open Orders | The "Orders · Queue" tour starts by itself; the lanes are outlined in turn |
| 5 | Reload Orders, then open it on a second device as the same person | It does not start again (remembered per person) |
| 6 | Switch to Table at phone width (≤ 767px) | "Orders · Table" starts by itself; the filters step points at **Filters** |
| 7 | While a tour runs, place a test order from the storefront | The new-order banner appears **undimmed and clickable**; the chime plays; the tour stays |
| 8 | Open an order as Staff on an Effy-driver order, run its tour | No Courier pickup step, no Refund step; the counter counts only the steps shown |
| 9 | Run the same as Manager on a courier-pickup order with something refundable | Both steps appear |
| 10 | Help → All tours → "A product" from Today | Opens the newest product, then the tour starts |
| 11 | ⌘K, type "tour" | **Tour this page** and **All tours** are offered |
| 12 | Help → turn off "Show tours on new pages", open Insights | Nothing starts; Help → Tour this page still runs it |
| 13 | Try to click a dimmed button during a tour | Nothing happens; Esc closes the tour and the page is unchanged |
| 14 | Dark appearance, then keyboard only, then VoiceOver on one tour | Readable; Tab stays in the card; each step is announced |
| 15 | Turn Wi-Fi off, open a page not seen, close its tour, reload | It does not start again; back online, the record reaches the server (check on another device) |
| 16 | PostHog | `tour_started` / `tour_finished` / `tour_closed` / `tour_declined` with tour key and step only |
