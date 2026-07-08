# Effy API Versioning Policy

**Binding on**: every externally consumed endpoint of `core-api` and `edge-api`.
Origin: specs/004-backend-bootstrap (research decisions A1–A5; industry survey:
Google AIP-185/180, GitHub, Shopify, Stripe, Uber, Zalando, RFC 9745/8594/9457).

## Why (the platform constraint)

Effy's native mobile apps cannot be force-updated: at any moment older and newer builds
are live simultaneously. The backend therefore serves **multiple contract versions at
once**, forever treating "the fleet is mixed" as the normal state, not an exception.

## The rules

1. **Scheme** — URI-path major version. Every externally consumed route lives under
   `/v1/...` (then `/v2/...`, …) from its first release. There is never an unversioned
   product route. Exceptions (deliberately unversioned, process-scoped): `/healthz`,
   `/readyz`, `/metrics`.
2. **Granularity** — the major version names the whole surface's contract. Endpoints
   evolve **additively inside** a version; a breaking change to a route publishes that
   route under the next version **while the old route keeps serving**. Untouched routes
   are not force-migrated to the new version.
3. **Breaking vs additive** (adopted from GitHub's + Google AIP-180's lists):
   - *Breaking — requires a new version*: removing/renaming an operation, parameter, or
     response field; adding a **required** parameter; changing a field's type or
     nullability; removing enum values; tightening validation or auth; changing error
     `type` semantics, pagination, or relied-upon ordering; semantic changes with
     unchanged wire shape. **Rename = remove + add = breaking.**
   - *Additive — allowed in place*: new operations; new **optional** parameters; new
     response fields; new enum values; new optional headers.
4. **Tolerant readers** (client-side half of the contract): every first-party client
   ignores unknown response fields, maps unknown enum values to a safe fallback, and
   never depends on field order.
5. **Coexistence mechanics** — version-neutral services/repositories; version-specific
   handlers/DTOs only where shapes differ (core-api: Gin `/v1`,`/v2` route groups —
   unchanged endpoints register the same handler in both; edge-api: one handler file per
   route per version sharing the service module). **Never** API Gateway stages or Lambda
   aliases as version mechanisms.
6. **Lifecycle** — `active → deprecated → retired`, one-way:
   - *Deprecated*: every response from the version carries `Deprecation` (RFC 9745) +
     `Sunset` (RFC 8594) + `Link: <migration-note>; rel="deprecation"` headers.
   - *Window*: **minimum 6 months** from deprecation announcement to sunset, extended
     until the old version's share of active devices falls below the agreed threshold
     (fleet-measured; the platform owns all clients, so measure — don't guess).
   - *Retired*: the version answers **`410 Gone`** with problem type `version-retired`
     naming the successor. A version that never existed answers plain `404` (`no-route`).
7. **Min-app-version enforcement** (reserved pattern; the lever that lets a version
   actually retire): a version-neutral bootstrap/config read returns
   `min_supported_version` (hard block → update screen) and `recommended_version` (soft
   prompt); clients send `X-App-Version`; backends may answer `426 Upgrade Required`
   below the hard floor. Implemented by the first slice that ships a real mobile flow;
   named here so it is designed-for, not bolted on.
8. **Version bumps are decisions, not habits**: introducing `/v2` of anything requires a
   written note (in the owning feature's spec/plan) naming the breaking change and the
   migration path.

## This slice's demonstration

`/v1/platform/status` and `/v2/platform/status` are published side by side with
deliberately different payload shapes (the v2 reshape is a canonical breaking-shape
example) to prove rule 5 end-to-end; `/v3/...` proves the 404 arm of rule 6. No version
is deprecated or retired yet — rules 6.7 activate as the platform evolves.

## Path scheme under the shared gateway (A3, 2026-07-08)

With the cold path decomposed into services behind one HTTP API, the version segment follows the
service prefix: **`/<service>/v<major>/...`** (e.g. `/admin/v1/me`, `/store/v2/status`). Service
prefix first = the ownership boundary is the routing boundary (route-key uniqueness across the
shared API by construction), and each service versions on its own cadence. Health is
`/<service>/healthz` (public, unversioned). The rules above are otherwise unchanged.
