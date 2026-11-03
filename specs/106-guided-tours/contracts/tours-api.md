# Contract: a person's tour state (shop service, shared gateway)

Both routes use the **shop** JWT authorizer. The subject comes from the token, and the audience is fixed to
`'shop'` by the handler. There is no path parameter, so a caller can only reach their own row. Any shop-pool caller
is admitted, including a role-less or unassigned one, like `/shop/v1/me` (tours are about the console, not a shop).

## GET `/shop/v1/me/tours`

**200**

```json
{ "offerTours": true, "seen": { "welcome": { "version": 1, "outcome": "finished", "at": "2026-11-03T09:12:00Z" } } }
```

A subject with no row gets `{ "offerTours": true, "seen": {} }`, never 404.

**401** `Unauthenticated`: no subject. **503**: the database is unavailable (standard `unavailable(scope)`).

## PATCH `/shop/v1/me/tours`

The body is **exactly one** of:

```json
{ "tour": "orders-queue", "version": 1, "outcome": "finished" }
{ "offerTours": false }
{ "reset": true }
```

| Body | Effect |
|---|---|
| tour/version/outcome | `seen[tour] = { v, outcome, at: now() }` (an upsert that overwrites the earlier entry) |
| offerTours | Sets `offer_tours` |
| reset | `seen = '{}'` (`offer_tours` unchanged) |

**200** returns the new state (same shape as GET), so the client replaces its cache with what the server holds.

**400** `ValidationFailed`, with the detail naming the field: not JSON; more than one kind of change, or none; `tour`
not matching `^[a-z0-9][a-z0-9-]{0,39}$`; `version` not an integer from 1 to 1000; `outcome` not one of the three;
`offerTours` not boolean; `reset` not `true`.
**409** `tour-state-full` (`https://effyshopping.com/problems/tour-state-full`): the write would make `seen` hold more than 100 tours (a guard; the consoles have far fewer).
**401** / **503** as GET.

No live announcement (`@effy/edge-shared/live`): the state is the caller's own preference, it changes only when the
caller acts, and the caller's own cache is updated by the response. `change-map.guard.test.ts` covers orders, rounds,
slots and stock, not this.

## Back-office (next slice, same contract)

`GET|PATCH /admin/v1/me/tours` in the **admin** service, staff gateway, admin authorizer, `audience = 'admin'`, with
the same body and responses, served by the same `@effy/edge-shared/tours` store.
