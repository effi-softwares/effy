# 070 — Sign-off record

Status: **IN PROGRESS** — 30 of 102 tasks done. Nothing has been deployed, applied or committed.

## Done and verified (2026-10-05)

| Phase | Tasks | State |
|---|---|---|
| 1. Setup | T001–T004 | Baseline measured; constitution **3.0.0**; `ARCHITECTURE.md`, brief, service-assignment guide, `CLAUDE.md` describe one backend |
| 2. Foundational (code) | T005–T019 | Shared helpers (money, availability, customer gate, metrics, overload wrapper), delivery engine, cart policy, payment gateway, both service shells, role migration, password script, additive Terraform |
| 3. US1 Browse | T022–T032 | `storefront` service (8 routes); customer-web and customer-mobile browsing re-pointed |

### Test evidence

| Suite | Result |
|---|---|
| edge `shared` | 330 passed (was 150 + 9 skipped) — includes 17 new real-database tests |
| edge `storefront` (new) | 179 passed — includes 14 real-database tests |
| edge `commerce` (new, shell only) | 10 passed |
| every other edge service, real database on | all pass, **except two pre-existing failures in `shop`** (below) |
| customer-web | 593 passed (unchanged count) |
| customer-mobile host tests | 380 passed (unchanged count) |
| `terraform validate` (dev root) | valid; `terraform fmt` clean |

Proven against the real migrations, not fakes:
- cursor paging visits every product exactly once under `newest`, `price_asc`, `price_desc` and `relevance`;
- each facet is counted with its own selection cleared; the attribute-count `GROUP BY` runs;
- the search expression equals the trigram index expression, character for character;
- a role at its connection limit is refused with SQLSTATE 53300 and the request becomes a 503 with
  `Retry-After`, while another role is unaffected;
- the delivery fee engine, slots and standard days reproduce every Go table test, including both
  daylight-saving days.

### Found, not caused by 070

- `apis/edge-api/shop/src/attention/repository.container.test.ts` — "resolves recipients and their
  manager flag from the PLATFORM RECORD" fails with `column "id" does not exist`.
- `apis/edge-api/shop/src/orders/repository.container.test.ts` — "pages with a total order and a
  stable total" returns the wrong page.

Both fail identically with 070's migration removed. They were invisible in the baseline because
Docker was not running. Not fixed here.

## Deviations from the plan, recorded

| What | Why |
|---|---|
| Platform status not ported (T029) | `shop` already serves `/shop/v1/status` and `/shop/v2/status` publicly with the same statement and shapes; a third copy would be the duplication this feature removes |
| Storefront origins are a separate gateway-only list, and no production origin is listed in dev | The storefront never uploads, so it is not given the media bucket's CORS grant; core-api's list let a prod page call dev |
| `created_at_key` column added to the card projection | The driver returns timestamps at millisecond precision; a "newest" cursor built from that would skip products sharing a millisecond |
| `ids=` hydration drops a non-uuid id instead of failing | Same repair as the malformed product id (FR-025) |

## OPERATOR — next, in this order

All with `AWS_PROFILE=ef`. Each prompts before it changes anything.

**T020 — quickstart Stage 1 (additive; core-api keeps serving)**

```
make db-up ENV=dev              # applies 20261005032655_shopper_role.sql  (commit it first, or FORCE=1)
make db-shopper-role ENV=dev    # sets the role's password, creates secret /effy/dev/db/shopper
make plan ENV=dev               # expect ONLY: 4 new SSM parameters + the gateway CORS origin change
make apply ENV=dev
```

Expected plan: `aws_ssm_parameter.db_shopper_username`, `.db_shopper_secret_arn`,
`.stripe_secret_key_arn`, `.stripe_webhook_secret_arn` created; `aws_apigatewayv2_api.edge` updated
in place (two origins added). **Nothing under `module.core_api` may change.** If it does, stop.

Check: `psql … -c "SELECT rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname='effy_shopper'"` → `t | 40`.

**T021 — Claude, after T020**: package both services and record the resource counts.

**T033 — early proof (after T021)**

```
make edge-deploy SERVICE=storefront ENV=dev
curl -s https://edge-api.dev.effyshopping.com/storefront/healthz
curl -s https://edge-api.dev.effyshopping.com/storefront/readyz
curl -s "https://edge-api.dev.effyshopping.com/storefront/v1/products?q=milk" | head -c 400
curl -s "https://core-api.dev.effyshopping.com/v1/storefront/products?q=milk"  | head -c 400
```

The two product responses must list the same ids in the same order with the same `total`. Then
measure search (warm) against SC-004 and a first request after idle against SC-007. **If either
target is missed, stop here** — nothing irreversible has happened.
