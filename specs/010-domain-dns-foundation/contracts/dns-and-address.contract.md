# Contract — DNS Naming & the Address Contract

**Slice**: 010-domain-dns-foundation · **Status**: authoritative from this slice onward

Two contracts, both binding on every future slice:

1. **The naming convention** — how any endpoint, in any environment, gets its address.
2. **The SSM address contract** — how a client *finds* that address without hard-coding it.

Extends the 001 SSM contract (`specs/001-infra-foundation/contracts/ssm-parameters.contract.md`) and
the 004 gateway contract (`specs/004-backend-bootstrap/contracts/shared-gateway.contract.md`).

---

## 1. Naming convention

```
<endpoint>.<env>.effyshopping.com        # non-production
<endpoint>.effyshopping.com              # production (the apex namespace)
```

**Single label for `<endpoint>`.** Not a style preference — the per-environment wildcard certificate
(`*.<env>.effyshopping.com`) matches **exactly one label**. `edge-api.dev.effyshopping.com` is covered;
`a.b.dev.effyshopping.com` is **not**, and would need its own certificate. A two-label name is
therefore a deliberate, costed decision — never an accident.

### The register

| Endpoint | dev | prod (reserved) | Attached by |
|---|---|---|---|
| **Cold path** — shared edge API | `edge-api.dev.effyshopping.com` | `edge-api.effyshopping.com` | **010 (this slice)** |
| **Hot path** — core API (Go/Fargate) | `core-api.dev.effyshopping.com` | `core-api.effyshopping.com` | the slice that deploys it |
| Back-office console | `back-office.dev.effyshopping.com` | `back-office.effyshopping.com` | the slice that hosts it |
| Shop console | `shop.dev.effyshopping.com` | `shop.effyshopping.com` | the slice that hosts it |
| Customer storefront | `www.dev.effyshopping.com` | `www.effyshopping.com` + apex | the slice that hosts it |
| Mail envelope (MAIL FROM) | `mail.dev.effyshopping.com` | `mail.effyshopping.com` | **010 (this slice)** |

**Why `edge-api` and not `api`.** The platform has **two** backends by constitutional design
(Principle III — the dual path). A bare `api.` would have quietly awarded the shared, generic word to
one of them, and left the other needing a name that sounds subordinate. Naming each for the path it
actually is — `edge-api` (cold) and `core-api` (hot) — keeps the pair symmetric and means no future
slice has to relitigate it. The names also match the directories they front (`apis/edge-api/`,
`apis/core-api/`), so an address tells you where the code lives.

**Reserved ≠ built.** Only the two bolded rows exist after this slice. The rest are names this
convention *guarantees are available and coverable by the existing wildcard certificate* — so the
slice that deploys each one adds **a DNS record, not a certificate, not a design**.

### Rules for a slice that adds an endpoint

1. Take the name from the register above. Do not invent a new shape.
2. Add an alias record in the environment's zone. The wildcard certificate already covers you —
   **unless** you are behind CloudFront or Amplify Hosting, in which case you need a **separate
   `us-east-1` certificate** and the provider alias to create it (research R2). Budget for that.
3. Publish the address in the SSM contract (§2). Never hand it to a client any other way.

---

## 2. The SSM address contract

### Keys

| Key | Value | Consumers |
|---|---|---|
| `/effy/<env>/edge/api_endpoint` | **the address callers should use** → `https://edge-api.dev.effyshopping.com` | web `.env` (`VITE_API_BASE_URL`), Makefile verify targets, README |
| `/effy/<env>/edge/api_default_endpoint` | the raw `execute-api` URL — **the fallback, kept alive** | debugging; break-glass |
| `/effy/<env>/edge/http_api_id` | *(unchanged)* the HTTP API id | every `serverless.yml` (`provider.httpApi.id`) |
| `/effy/<env>/edge/authorizer/<audience>_id` | *(unchanged)* per-pool JWT authorizer ids | every `serverless.yml` route |
| `/effy/<env>/region` | *(unchanged)* the env's home region | clients, backends |

### The semantics decision (and why it matters)

**`api_endpoint` keeps its key and its meaning — "where do I call this environment's API" — and
gains a better value.**

Renaming a contract key is a **breaking change to every consumer** (001 contract, explicitly). But
every current reader of `api_endpoint` already means *"the API's address"* — so changing the **value**
hands all of them the branded address with **zero code edits**, and satisfies **SC-003** ("no
provider-generated hostname in any client config") by construction rather than by a migration.

The rejected alternative — leaving `api_endpoint` raw and adding a *new* `api_base_url` key — would
leave the platform with **two competing answers to one question**, and a permanent question of which
one a given client read. That is exactly the drift Principle II exists to prevent.

### ⚠ The invariant that keeps the fallback real

```hcl
# infra/envs/<env>/edge-gateway.tf
resource "aws_apigatewayv2_api" "edge" {
  # disable_execute_api_endpoint MUST remain false (its default).
  # Setting it true kills the raw URL — silently violating FR-011 (additive cutover)
  # and SC-004 (zero callers broken).
}
```

The raw `execute-api` URL is **not deprecated and must not be disabled.** It is the fallback that
makes the cutover safe and the propagation window survivable. `api_default_endpoint` exists so that
the fallback is *published* rather than folklore.

---

## 3. Zone ownership contract

| Zone | Owned by | May write |
|---|---|---|
| `effyshopping.com` (parent) | `infra/global/` | production's records (none yet) |
| `dev.effyshopping.com` | `infra/envs/dev` | **everything inside it**, plus **exactly one** record in the parent: its own `NS` delegation |
| `qa.` / `staging.` | `infra/envs/<env>` | same, by the same module |

**Two invariants, both structural rather than procedural:**

- **An environment writes exactly one record outside its own zone** — its `NS` delegation. Nothing
  else. Not a sibling's record, not an apex record.
- **The delegation record lives in the environment's state.** So destroying the environment removes
  the delegation and the zone **together**. A zone can never outlive its delegation → **no dangling
  delegation, no subdomain takeover** (FR-005). This is the reason for the ownership split, not a
  side effect of it.

**Corollary**: `infra/global/` must never be destroyed casually. It is not an environment, it is not
in the `ENV=` workflow, and its own name-servers are what GoDaddy points at — recreating the zone
mints **new name-servers** and requires a manual registrar repoint to recover.
