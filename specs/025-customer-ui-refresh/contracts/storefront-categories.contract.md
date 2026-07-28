# Contract: Storefront Categories (enriched projection)

**Feature**: 025-customer-ui-refresh | **Path**: hot path (`apis/core-api`) | **Auth**: none (public)

> ⚠ **This is the G1 boundary interpretation.** Spec FR-001a authorises exactly two new read
> capabilities, and this is neither of them. It is an **enrichment of the existing**
> `GET /v1/storefront/categories` projection — same resource, same caller, same public authorisation,
> no new endpoint. That reading is a judgement call, recorded in `plan.md` and `research.md` so the
> operator can overrule it. **The strict-reading fallback**: drop both new fields; browse becomes a
> typographic category index. Complies exactly, materially weaker for a food-first store, and a
> genuinely small reversal — see "Why the fallback is cheap" below.

## Endpoint

```http
GET /v1/storefront/categories
```

Unchanged path, unchanged method, unchanged auth.

### Response — two new fields per category

```json
[
  {
    "key": "fresh-produce",
    "name": "Fresh produce",
    "parentKey": null,
    "productCount": 128,
    "imageUrl": "https://…signed…"
  }
]
```

| Field | Status | Notes |
|---|---|---|
| `key`, `name`, `parentKey` | **existing** | Unchanged. |
| `productCount` | **new** | Count of `status = 'active'` products whose `primary_category_id` is this category. |
| `imageUrl` | **new** | Derived (see below). `null` → the client renders a brand-mark tile, never a broken frame. |

## Why the fallback is cheap

`parentKey` **already exists** in `StorefrontCategoryDTO`
(`packages/shared-types/src/storefront.ts:86`). The browse hierarchy therefore needs no contract
change at all — only imagery and counts are new. Reverting G1 removes two fields and one derivation;
it does not touch navigation, routing, or the page's structure.

## Derived imagery

`public.category` has **no image column** (`20260716092105_product_catalog.sql:71`), and FR-001 forbids
adding one. The representative image is therefore derived from a product in the category.

**Selection is deterministic**: lowest `display_order`, then oldest `created_at`, then lowest `id`,
among active products in the category that have primary media. A category whose products have no
imagery yields `null`.

Determinism is a requirement, not a nicety. An arbitrarily-chosen image makes a category change its
face between two page loads, which reads as a bug even though nothing is wrong.

## Empty categories

`productCount: 0` is a legitimate state and the client must handle it: the category is shown with its
count, and entering it lands on an explained empty result set with a recovery path (FR-021) — not
hidden, and not a dead end.

## Caching

`Cache-Control: public, max-age=300`. Taxonomy changes at operations pace. Note that `imageUrl` is a
**presigned, expiring S3 URL** — the cache lifetime must stay well inside the signature's validity,
which is the same constraint the existing product-card images already live under.

## Client consumption

- **Web**: `/browse` renders the tree server-side inside a Suspense boundary, preserving the route's
  static shell. Entering a category navigates to the existing filtered result set
  (`/search?category=<key>`), keeping refinements as query parameters (FR-017) and the crawl policy
  unchanged.
- **Mobile**: the Browse destination renders the same tree with the shared tile component.

**Crawlability, stated plainly**: `/browse` is crawlable; individual category result sets are not,
because robots.txt disallows facet params (011's routes contract). This feature **preserves** that
policy rather than changing it. Crawlable category landing pages would need path segments and their
own caching policy — a spec-level decision and a future slice.
