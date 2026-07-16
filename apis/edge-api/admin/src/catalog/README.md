# admin `catalog/` — Catalog schema authority (016)

The back-office side of the product catalog: the managed **schema** that drives every shop's
products — **product types**, a reusable **attribute library**, and the platform **category
taxonomy**. Attributes are *data*, not columns (EAV), so the back office adds one without a
deployment (SC-001).

## Routes (`/admin/v1/catalog/*`, back-office authorizer)

| Group | Routes |
|---|---|
| Product types | `GET .` · `GET .{id}` · `POST .` · `PATCH .{id}` · `POST .{id}/status` · `POST .{id}/attributes` · `PATCH .{id}/attributes/{attrId}` · `DELETE .{id}/attributes/{attrId}` |
| Attributes | `GET attributes` · `GET attributes/{id}` · `POST attributes` · `PATCH attributes/{id}` · `POST attributes/{id}/status` · `DELETE attributes/{id}/allowed-values/{valueId}` |
| Categories | `GET categories` · `POST categories` · `PATCH categories/{id}` · `POST categories/{id}/status` |

## Authz (from the `admin.staff` record, fail-closed — `handler-support.guard`)
- **read** = any active `admin.staff` (incl. `csa`).
- **mutate** = active AND role ∈ {`admin`, `manager`}.

## Layering
`functions/catalog-*` (thin: preamble → guard → parse → map) → `service.ts` (hand-written validation:
slug keys, data-type unions, select-needs-values, number/text validation shapes, category no-cycle) →
`repository.ts` (raw SQL, `withTransaction`, an `admin.audit_log` row per mutation). Domain shapes are
mapped to `@effy/shared-types` DTOs in `handler-support.ts` and never leak.

## In-use guards (FR-006)
Retiring an **attribute** referenced by any `product_attribute_value` → 409. Removing an **allowed
value** used by any product → 409. Retiring a **category** with non-archived products → 409. Retiring
a **product type** is always allowed (existing products keep their type).

## Audit
Every mutation writes `admin.audit_log` (`target_type ∈ {product_type, attribute_definition,
category}`) in the same transaction as the change (verified 009 pattern).
