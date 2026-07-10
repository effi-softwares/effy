# Contract: Naming

**Feature**: 008-shop-naming-unification | **Status**: Normative

This is the single source of truth for what becomes what. Where any other artifact disagrees with this
file, this file wins. It is also the specification for `scripts/verify-no-store.sh`, which mechanically
enforces § 3.

---

## 1. The rule

> The Effy audience of internal fulfillment-node operators, the node itself, the people who staff it, the
> roles they hold, the surfaces they use, the service that serves them, and the records that describe
> them are named **shop**. Never **store**.

---

## 2. The map

### 2.1 Paths

| Before | After |
|---|---|
| `apis/edge-api/store/` | `apis/edge-api/shop/` |
| `apis/edge-api/store/src/functions/store-ping-v1-get.ts` | `…/shop/src/functions/shop-ping-v1-get.ts` |
| `apis/edge-api/store/src/functions/store-me-v1-get.ts` | `…/shop/src/functions/shop-me-v1-get.ts` |
| `apis/edge-api/store/src/functions/store-me.test.ts` | `…/shop/src/functions/shop-me.test.ts` |
| `apis/edge-api/store/src/functions/store-manager-ping-v1-get.ts` | `…/shop/src/functions/shop-manager-ping-v1-get.ts` |
| `apis/edge-api/store/src/functions/store-manager-ping.test.ts` | `…/shop/src/functions/shop-manager-ping.test.ts` |
| `apps/shop-web/src/features/store-identity/` | `apps/shop-web/src/features/shop-identity/` |
| `packages/shared-types/src/store.ts` | `packages/shared-types/src/shop.ts` |
| `db/migrations/20260710050004_store_staff_rbac.sql` | `db/migrations/20260710050004_shop_staff_rbac.sql` |
| `docs/audiences/store-capabilities.md` | `docs/audiences/shop-capabilities.md` |
| `specs/007-shop-web/contracts/store-me.contract.md` | `…/contracts/shop-me.contract.md` |
| `specs/007-shop-web/contracts/store-manager-ping.contract.md` | `…/contracts/shop-manager-ping.contract.md` |
| `specs/007-shop-web/contracts/store-schema.contract.md` | `…/contracts/shop-schema.contract.md` |

`src/staff/` and `src/status/` keep their paths — both are already audience-neutral. `src/status/` in
particular hosts the *platform* status routes and is not shop-specific despite living in this service.

### 2.2 Route paths

| Before | After | Auth |
|---|---|---|
| `GET /store/healthz` | `GET /shop/healthz` | public |
| `GET /store/v1/status` | `GET /shop/v1/status` | public |
| `GET /store/v2/status` | `GET /shop/v2/status` | public |
| `GET /store/v1/ping` | `GET /shop/v1/ping` | shop authorizer |
| `GET /store/v1/me` | `GET /shop/v1/me` | shop authorizer |
| `GET /store/v1/manager-ping` | `GET /shop/v1/manager-ping` | shop authorizer |

The authorizer id (`/effy/<env>/edge/authorizer/shop_id`) is **already** named `shop` and does not change.

### 2.3 Deployment + package names

| Before | After |
|---|---|
| workspace package `@effy/edge-store` | `@effy/edge-shop` |
| serverless `service: effy-edge-store` | `service: effy-edge-shop` |
| CloudFormation stack `effy-edge-store-dev` | `effy-edge-shop-dev` |
| provider tag `service: store` | `service: shop` |
| function keys `storePingV1`, `storeMeV1`, `storeManagerPingV1` | `shopPingV1`, `shopMeV1`, `shopManagerPingV1` |
| alarm logical ids `StorePingV1ErrorsAlarm`, `StoreMeV1ErrorsAlarm`, `StoreMeV1DurationP95Alarm`, `StorePingV1ThrottlesAlarm`, `StoreManagerPingV1ErrorsAlarm` | `Shop…` equivalents |
| alarm name strings `${service}-${stage}-store-*` | `${service}-${stage}-shop-*` |

`platformStatusV1` / `platformStatusV2` / `health` function keys are audience-neutral and unchanged.

### 2.4 Database

See [data-model.md](../data-model.md) for the full map, the seeded role-key values, and both migration
strategies. Summary: `store` → `shop`, `store_staff` → `shop_staff`, `store_role` → `shop_role`,
`store_staff_role` → `shop_staff_role`, column `store_id` → `shop_id`, two indexes, one CHECK constraint,
two seeded rows.

### 2.5 RBAC role literals

These four spellings must agree byte-for-byte across four systems (SC-007).

| System | Before | After |
|---|---|---|
| Cognito group name (`infra/envs/dev/auth-shop.tf`) | `store_manager`, `store_staff` | `shop_manager`, `shop_staff` |
| JWT `cognito:groups` claim value | `store_manager`, `store_staff` | `shop_manager`, `shop_staff` |
| `shop_role.key` (DB CHECK + seed) | `store_manager`, `store_staff` | `shop_manager`, `shop_staff` |
| TypeScript union | `StoreRole = "store_manager" \| "store_staff"` | `ShopRole = "shop_manager" \| "shop_staff"` |

### 2.6 Exported symbols — `@effy/shared-types`

`packages/shared-types/src/store.ts` → `shop.ts`; `src/index.ts` re-export line updated.

| Before | After |
|---|---|
| `StoreRole` | `ShopRole` |
| `STORE_ROLES` | `SHOP_ROLES` |
| `StoreStaffStatus` | `ShopStaffStatus` |
| `StoreSummaryDTO` | `ShopSummaryDTO` |
| `StoreStaffRecordDTO` | `ShopStaffRecordDTO` |
| `StoreManagerPingDTO` | `ShopManagerPingDTO` |
| `StoreSummary` | `ShopSummary` |
| `StoreStaffRecord` | `ShopStaffRecord` |
| `toStoreRoles()` | `toShopRoles()` |
| `isStoreManager()` | `isShopManager()` |
| `ManagerPingResult` | *(unchanged — already neutral)* |

Also the **values** inside `ShopManagerPingDTO`: `audience: "store"` → `"shop"`, `scope: "store_manager"`
→ `"shop_manager"`.

The parallel declarations in `apis/edge-api/shop/src/staff/types.ts` (`StoreRole`, `StoreStaffStatus`,
`KNOWN_ROLES`, `StoreSummary`, `StoreStaffRecord`) are renamed identically. They remain duplicated — see
the plan's "Observed, not fixed".

### 2.7 Console — `apps/shop-web`

| Before | After |
|---|---|
| React Query key prefix `["store", …]` | `["shop", …]` |
| `removeQueries({ queryKey: ["store"] })` | `["shop"]` |
| telemetry event `shop_store_assignment_missing` | `shop_assignment_missing` |
| type `ShopAnalyticsEvent` | *(unchanged)* |
| nav group label `"Store"` | `"Shop"` |
| copy `"Store management"` | `"Shop management"` |
| copy `"Your store record"` | `"Your shop record"` |

### 2.8 Operator surface

| Before | After |
|---|---|
| `make edge-deploy SERVICE=store` | `make edge-deploy SERVICE=shop` |
| `make edge-offline SERVICE=store` | `make edge-offline SERVICE=shop` |
| usage strings `SERVICE=admin\|store` | `SERVICE=admin\|shop` |
| env var `EXPECT_STORE` | `EXPECT_SHOP` |
| *(new)* | `make edge-remove SERVICE=<name> ENV=<env>` |
| *(new)* | `make verify-naming` |

---

## 3. Exclusions — the word survives here, and nowhere else

The guard treats any occurrence matching a category below as permitted. Anything else is a failure.

| # | Category | Why it survives | Examples |
|---|---|---|---|
| **a** | **TanStack Store / client state** | Third-party library name and a state-management term of art. Unrelated to the audience. | `ui-store.ts`, `@tanstack/react-store`, `new Store<UiState>`, `useStore`, `uiStore`, "TanStack Store", "client store", "server-state store" |
| **b** | **"storefront"** | Names the *customer* surface and the product model. `customer-web` is the "customer storefront"; the brief's "no marketplace of named storefronts" is load-bearing. | `storefront`, `storefronts` |
| **c** | **AWS "Parameter Store"** | An AWS product name. | "Parameter Store", `ssm-parameters` docs |
| **d** | **The English verb, and unrelated compounds** | Ordinary language. | "we store the token", "stores Terraform state", "stored in the DB", `no-store` (HTTP cache directive), `.DS_Store`, "data store" |
| **e** | **Historical record** | Text that rewriting would **falsify**. Not live names — records of what was true, or of what someone said. | The constitution's v1.5.0 changelog line and the v1.6.0 Sync Impact Report (which must name the token it retires); 007's superseded research R1; **verbatim user quotes** in every `operator-directives.md` and each spec's `**Input**:` line |
| **f** | **Meta** | Artifacts *about* the rename, which necessarily quote the old name throughout. Path-excluded in the guard, not pattern-matched. | `specs/008-shop-naming-unification/`, `scripts/verify-no-store.sh`, `scripts/store-token-allowlist.txt` |

**Categories (e) and (f) are additions to the spec's FR-002**, which enumerated four. Category (e) was
foreseen by [research.md](../research.md) R6 for a single constitution line; implementation found it
also covers verbatim user quotes and 007's superseded decision record. Category (f) was not foreseen at
all — it exists because a document that *specifies* a rename cannot avoid naming what it retires.

Neither weakens FR-002: both are carve-outs for **records**, not for live names. No file in either
category names a route, a table, a symbol, or a role.

### A note on the guard's matching

The guard greps for the **substring** `store`, case-insensitively — not `\bstore`. A word boundary
would miss `toStoreRoles`, `isStoreManager`, and `getStoreStaff`: exactly the misses that matter. The
cost is noise (`restore`, `truststore`, `zipStoreBase`, `.pnpm-store`), which the (d) patterns buy off
one enumerated phrase at a time. **False positives are cheap; a false negative defeats SC-001.**

### "dark store"

Retained. It names an external retail-industry concept ("dark-store-like"), in the same way "Parameter
Store" names an AWS product. It does not name an Effy entity. It is covered by category (d).

---

## 4. The guard

`scripts/verify-no-store.sh`, exposed as a new standalone `make verify-naming` target.

> It is **not** wired into `make lint`. That target is Terraform-only hygiene (`fmt -check`, `validate`,
> `tflint`, `trivy`) and folding a repo-wide grep into it would misfile the guard. `verify-naming` stands
> alone and is the natural CI hook.

**Behaviour**

1. Walk the repository, excluding `node_modules`, `.git`, `dist`, `build`, `.gradle`, `.turbo`, `.next`,
   `.serverless`, and `pnpm-lock.yaml`.
2. Find every case-insensitive occurrence of the token `store`.
3. Subtract every line matching a pattern in `scripts/store-token-allowlist.txt`.
4. Print the remainder as `path:line: text`. Exit **1** if the remainder is non-empty, **0** otherwise.

**Allowlist format** — one extended-regex per line; `#` comments carry the mandatory justification and
the category letter:

```
# (a) TanStack Store — the client-state library, not the audience
ui-store
@tanstack/react-store
[Cc]lient store
TanStack Store
new Store<
useStore
uiStore

# (b) the customer storefront — the product model's own word
[Ss]torefront

# (c) AWS Parameter Store — an AWS product name
Parameter Store

# (d) the English verb, and unrelated compounds
\b[Ss]tore[sd]?\b (the|it|them|this|that|a|an|Terraform|user|token|secrets?)
no-store
\.DS_Store

# (e) historical record — constitution changelog, v1.5.0 line only
introduced as store_manager / store_staff
```

> The `(d)` pattern above is illustrative, not final. The English verb is the one category a regex cannot
> cleanly capture, so the implementing task MUST enumerate the surviving verb occurrences explicitly
> after the rename and pin each with a narrow pattern. A pattern broad enough to swallow every verb usage
> is broad enough to swallow a missed rename, which would silently defeat SC-001.

**Adding a pattern is a reviewable act.** Every line requires a comment naming its category and reason.
This is the mechanism that keeps the split from re-emerging one reasonable-looking commit at a time.

---

## 5. Invariants the rename must not break

| Invariant | Check |
|---|---|
| Test count does not decrease | `pnpm test` reports **159** |
| No Cognito pool / app client / account replaced | `terraform plan` shows no `aws_cognito_user_pool` action |
| SSM contract unchanged | `/effy/<env>/auth/shop/*` and `/effy/<env>/edge/*` untouched |
| `@effy/api-client` unchanged | zero diff — it never referenced the audience |
| Exactly one deployment unit | `aws cloudformation list-stacks` shows `effy-edge-shop-dev`, not `effy-edge-store-dev` |
| Token claim ≡ persisted role key | `make shop-token-claims` + a `shop_role` select |
| Hot path untouched | zero diff under `apis/core-api/` |
