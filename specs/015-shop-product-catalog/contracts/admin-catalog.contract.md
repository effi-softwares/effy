# Contract: Admin Catalog Schema Authority

**Service**: `apis/edge-api/admin` (cold path) · **Gateway**: shared HTTP API ·
**Authorizer**: `back-office` JWT (`${ssm:/effy/<env>/edge/authorizer/back-office_id}`) ·
**Base path**: `/admin/v1/catalog` · **DTOs**: `@effy/shared-types` (`catalog.ts`)

**Authz** (from the `admin.staff` record, backend-authoritative, fail-closed — the verified
`shops/authz.ts` `guard` pattern):
- **read** = any `admin.staff` with `status='active'` (incl. `csa`).
- **mutate** = `status='active'` AND role ∈ {`admin`,`manager`}.

**Errors**: RFC 9457 `application/problem+json`; `validation`→400 (+`errors[]`), `not_found`→404,
`conflict`→409, unknown→503 (cause logged, withheld). Every mutation writes an `admin.audit_log` row
in the same transaction.

---

## Product types

| Method | Path | Authz | Body → Response |
|---|---|---|---|
| GET | `/admin/v1/catalog/product-types` | read | → `ProductTypeDTO[]` (incl. assigned attributes) |
| GET | `/admin/v1/catalog/product-types/{id}` | read | → `ProductTypeDTO` |
| POST | `/admin/v1/catalog/product-types` | mutate | `CreateProductTypeRequest` → `201 ProductTypeDTO` |
| PATCH | `/admin/v1/catalog/product-types/{id}` | mutate | `UpdateProductTypeRequest` → `ProductTypeDTO` |
| POST | `/admin/v1/catalog/product-types/{id}/status` | mutate | `ChangeSchemaStatusRequest` (`active`/`retired`) → `ProductTypeDTO` |
| POST | `/admin/v1/catalog/product-types/{id}/attributes` | mutate | `AssignAttributeRequest` (`attributeId`, `isMandatory`, `displayOrder`, `groupLabel?`) → `ProductTypeDTO` |
| PATCH | `/admin/v1/catalog/product-types/{id}/attributes/{attrId}` | mutate | update assignment → `ProductTypeDTO` |
| DELETE | `/admin/v1/catalog/product-types/{id}/attributes/{attrId}` | mutate | → `204` (unassign; blocked 409 if the attribute is mandatory-in-use? no — unassigning only affects future creation) |

## Attribute definitions

| Method | Path | Authz | Body → Response |
|---|---|---|---|
| GET | `/admin/v1/catalog/attributes` | read | → `AttributeDefinitionDTO[]` |
| GET | `/admin/v1/catalog/attributes/{id}` | read | → `AttributeDefinitionDTO` |
| POST | `/admin/v1/catalog/attributes` | mutate | `CreateAttributeDefinitionRequest` (name, dataType, unit?, helpText?, validation?, allowedValues?) → `201` |
| PATCH | `/admin/v1/catalog/attributes/{id}` | mutate | `UpdateAttributeDefinitionRequest` → `AttributeDefinitionDTO` |
| POST | `/admin/v1/catalog/attributes/{id}/status` | mutate | retire/activate → `409` if retiring an **in-use** attribute (FR-006) |
| DELETE | `/admin/v1/catalog/attributes/{id}/allowed-values/{valueId}` | mutate | → `409` if the value is used by any product (FR-006) |

## Categories (taxonomy)

| Method | Path | Authz | Body → Response |
|---|---|---|---|
| GET | `/admin/v1/catalog/categories` | read | → `CategoryDTO[]` (flat list w/ `parentId`; tree built client-side) |
| POST | `/admin/v1/catalog/categories` | mutate | `CreateCategoryRequest` (name, parentId?, displayOrder?) → `201` |
| PATCH | `/admin/v1/catalog/categories/{id}` | mutate | `UpdateCategoryRequest` → `CategoryDTO` |
| POST | `/admin/v1/catalog/categories/{id}/status` | mutate | retire/activate → `409` if retiring a category with active products (FR-006) |

---

## Handler conventions (all functions)

`preamble(event,context)` first → `guard(event, scope, 'read'|'mutate')` (deny short-circuits) →
`parseJsonBody` for writes → service → `json(status, toDTO(...), scope)` → `mapCatalogError(err, scope)`.
No SQL/domain in handlers; domain shapes never leak (map to DTOs in `handler-support.ts`). Register
each function in `admin/serverless.yml` under the paths above with
`authorizer.id: ${ssm:/effy/<env>/edge/authorizer/back-office_id}` + a per-function `Errors>0`
CloudWatch alarm (and a `Duration p95` alarm on the list/tree reads).

**Field validation** (service, hand-written — no schema lib): non-empty name; `dataType` ∈ the union;
`validation` shape; allowed-value uniqueness; category `parentId` exists and is not self/descendant
(no cycles).
