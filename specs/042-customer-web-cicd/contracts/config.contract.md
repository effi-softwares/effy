# Contract: App ↔ Infra Configuration (`/effy/<env>/{amplify,web,stripe,posthog}/*`)

Feature: 042-customer-web-cicd

One writer per key, many readers (Principle II). This slice **reads** a few operator-supplied keys and
**writes** one output key.

## Inputs — operator-supplied (must exist before the relevant apply)

| Key | Type | Who supplies | Purpose | If missing |
|---|---|---|---|---|
| `/effy/<env>/amplify/github_access_token` | SecureString | operator | Amplify → GitHub connection (D5) | plan fails loudly (data source errors) — correct |
| `/effy/<env>/stripe/publishable_key` | String | operator | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | checkout UI cannot init; supply a **test** key |
| `/effy/<env>/posthog/key` | String | operator (optional) | `NEXT_PUBLIC_POSTHOG_KEY` | blank → analytics no-op (already the case, 039) |
| `/effy/<env>/posthog/host` | String | operator (optional) | `NEXT_PUBLIC_POSTHOG_HOST` | defaults to `https://us.i.posthog.com` |

**Real-World Identifiers rule**: these are external credentials/keys — operator-supplied, never
inferred from session/environment. The banned address `techsupport+claudeone@phantm.com` must not
appear in any of these values, fixtures, or docs (constitution v1.12.0).

## Outputs — written by this slice

| Key | Type | Value | Reader(s) |
|---|---|---|---|
| `/effy/<env>/web/site_url` | String | `https://<zone_name>` (dev: `https://dev.effyshopping.com`) | `apis/edge-api/customer/serverless.yml` (`NEWSLETTER_CONFIRM_BASE_URL`), any future public-URL consumer |

⚠ Writing `/effy/<env>/web/site_url` **closes 039's open item** — the newsletter confirm link
currently falls back to `http://localhost:3000` because the key does not exist yet. After this key is
written, the edge-customer service must be redeployed to pick it up.

## Values sourced from Terraform references (NOT SSM — same root, no drift)

| Amplify env var | Terraform source |
|---|---|
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `module.customer_pool.user_pool_id` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `module.customer_pool.app_client_id` |
| `NEXT_PUBLIC_SITE_URL` | `"https://${module.dns.zone_name}"` |
| `NEXT_PUBLIC_CORE_API_BASE_URL` | `"https://${var.core_api_subdomain}.${module.dns.zone_name}"` |
| `NEXT_PUBLIC_EDGE_API_BASE_URL` | `"https://${var.api_subdomain}.${module.dns.zone_name}"` |

⚠ **AMENDED 2026-08-12 — `EDGE_API_BASE_URL` → `NEXT_PUBLIC_EDGE_API_BASE_URL`.** As originally
contracted this variable carried no prefix, on the reasoning that the edge API's address is
server-only config (011 FR-016). That is sound in principle and **did not work in practice**: an
Amplify environment variable is a *build* variable, and AWS is explicit that "a Next.js server
component doesn't have access to those environment variables by default." Only `NEXT_PUBLIC_`
values survive the build, because Next inlines them into the output. Unprefixed, `edgeApiBaseUrl()`
threw at request time on the deployed runtime and `requireCustomer` turned that into a redirect to
`/account/unavailable` — for **every signed-in customer on dev**, with no failed request in the
browser, because the throw preceded the fetch. Every edge-backed capability (account, addresses,
password, sign-out, deletion, checkout's saved addresses, newsletter) was affected.

The address is public-safe: the gateway's per-pool JWT authorizer answers an unauthenticated caller
with a flat 401. ⚠ **The reader constraint is unchanged** — it is consumed only from server code
(`lib/api/edge.ts`), because those routes relay the customer's ID and access tokens. The prefix
moved; the boundary did not, and it now rests on review rather than on the address being unknown.

⚠ **A future server-only variable cannot simply be added to this table.** It needs
`.env.production` written during the build (AWS: *Making environment variables accessible to
server-side runtimes*), or it will be silently undefined in production exactly as this one was.

## Portability contract (prod-by-configuration — FR-018/FR-019)

Every environment-specific value above is a variable or an in-env reference. Standing up prod =
instantiate `infra/modules/amplify-web-app` in `infra/envs/prod/` with:
- `deploy_branch = "main"` (or the production release branch),
- `domain_name = "effyshopping.com"` (the reserved apex),
- prod Cognito refs + prod SSM keys.

No pipeline logic, `amplify.yml`, or `.npmrc` changes are required to target production (SC-008).
