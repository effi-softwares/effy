# Contract: Home Layout — read and authoring

**Feature**: `042-storefront-home-composer` · **Date**: 2026-08-09

Two audiences, two paths, per Principle III:

| | Path | Auth | Why |
|---|---|---|---|
| **Read** the published layout | **Hot path** — `apis/core-api` | none (public) | Every shopper, every home page view. Latency-sensitive public traffic. |
| **Author** the layout | **Cold path** — `apis/edge-api/admin` | back-office pool | One operator, low frequency, back-office CRUD. |

This is the identical split 028 made for promotions.

---

## 1. Public read (hot path)

The layout rides on the **existing** home payload rather than a new endpoint — one round trip, no new latency.

```
GET /v1/storefront/home
```

```jsonc
{
  "layout": [
    { "id": "b_01J…", "type": "hero", "props": { … } },
    { "id": "b_02K…", "type": "product_rail", "props": { "railKey": "on_sale", "title": "On sale" } }
  ],
  "rails":   [ … ],   // unchanged
  "banners": [],      // ⚠ RETAINED AND EMPTY — see §4
  "categories": [ … ] // unchanged
}
```

**Rules**

- Only the **published** body is ever served here. There is no query parameter, header or flag that can make this endpoint return a draft. Draft content is reachable only through §3.
- **Hidden blocks are omitted server-side** — a hidden block is never on the wire, so no client can render one by mistake.
- **Blocks are omitted, never fatal** (FR-042): an unknown `type`, a `props` shape the server cannot read, or a reference that has since disappeared drops that block and serves the rest. ⚠ Each omission increments `storefront_home_blocks_omitted_total` labelled by reason — otherwise a page quietly losing a section is invisible.
- **References are resolved server-side.** A `product_rail` block carries a `railKey`; the response carries the rail's products. The client never resolves a reference, so it can never render a dead one.
- Ordering is **array order**. There is no `position` field. (The field that exists today is authored, stored, transmitted and ignored by web — one mechanism cannot disagree with itself.)

**Caching**: ⚠ **the layout is read through a CACHED path tagged `home-layout`; the rails and products alongside it stay `uncached()`.**

This is not an optimisation — it is what keeps FR-037's prerendered shell true. Block order and existence now come from the layout, so an uncached layout read would move the **entire page body** behind request time; `AppPromo`, `NewsletterForm` and the page's `h1` prerender today precisely because they sit outside the Suspense boundary.

The layout body carries **no time predicate** (research R8), which is what makes it cacheable at all. Invalidation is explicit:

```
publish / revert  →  admin service  →  POST <storefront>/api/revalidate   { tag: "home-layout" }
                                        Authorization: shared secret
```

⚠ **A TTL is not an acceptable substitute.** An operator who publishes and sees no change will publish again; FR-015a exists because "it appears within the hour" is not publishing.

---

## 2. Authoring (cold path)

All routes behind the back-office JWT authorizer. **Read** = any active staff member (including `csa`); **mutate** = active AND role ∈ `{admin, manager}`, decided from the `admin.staff` record — a valid claim never overrides it (Principle IV). Fail-closed.

| Route | Purpose |
|---|---|
| `GET /admin/v1/home-layout` | Both bodies + `revision` + publish metadata |
| `PUT /admin/v1/home-layout/draft` | Replace the draft body (whole-body write, see below) |
| `POST /admin/v1/home-layout/publish` | Validate, then draft → published |
| `POST /admin/v1/home-layout/revert` | published → draft |
| `POST /admin/v1/home-layout/preview` | Mint a short-lived signed preview token (§3) |
| `POST /admin/v1/home-layout/artwork/presign` | Presigned S3 PUT for one block's artwork |
| `GET /admin/v1/home-layout/artwork/:key/view` | Presigned **read**, so the composer can show attached artwork |
| `GET /admin/v1/home-layout/audit` | Publish/revert history from `admin.audit_log` |

⚠ **Publish and revert additionally call the storefront's revalidation endpoint** with a shared secret, so the cached layout is invalidated the moment it changes. A failure to revalidate MUST be surfaced to the operator — a silent failure here means they believe they published and shoppers see the old page.

⚠ **`artwork/:key/view` exists because it is missing today.** The back office currently returns a raw storage key with a comment saying a presigned read "is a separate presigned read" — and that read was never built, so the operator sees a text placeholder instead of their own image.

**Whole-body draft writes, not per-block patches.** A layout is ~20 blocks read and written as a unit; per-block routes would need their own ordering and conflict semantics for no gain. The `revision` field makes the whole-body write safe.

### Optimistic concurrency (FR-017)

Every mutating request carries the `revision` last read. The update is `WHERE revision = $n` and bumps it; zero rows affected → `409` with `layout_revision_stale`. A second operator's publish cannot silently discard the first's work.

### Refusal codes

All returned as `application/problem+json`, naming the offending **block id** and, where applicable, the **field**:

| Code | Meaning |
|---|---|
| `layout_block_unknown` | A block `type` outside the catalogue |
| `layout_field_required` | A required prop is absent or empty |
| `layout_field_invalid` | An enumerated field outside its allowed set |
| `layout_too_many_blocks` | > 20 blocks, or > 6 tiles in one offers block |
| `layout_artwork_required` | A block that requires artwork has none |
| `layout_artwork_wrong_size` | Artwork does not match its canvas |
| `layout_alt_text_required` | Alt text absent and not explicitly decorative |
| `layout_reference_missing` | Referenced rail / category / promotion missing or inactive |
| `layout_heading_order` | The assembled page's heading sequence would be invalid |
| `layout_field_too_long` | A copy field exceeds the length limit stated in the catalogue |
| `layout_revision_stale` | Concurrent modification |

⚠ **Every one of these is enforced in the service, not the form** (FR-032). SC-007 proves it by issuing a violating publish **directly against the API**, bypassing the composer entirely, and observing the identical refusal.

---

## 3. Preview

```
POST /admin/v1/home-layout/preview   →  { "url": "https://<storefront>/api/preview?token=…" }
GET  <storefront>/api/preview?token=…  →  enables draft session, redirects to "/"
POST <storefront>/api/preview/end      →  ends it
```

**A new tab, not an iframe** (research R5): the back office and the storefront are different origins, so an iframed draft session depends on a **third-party cookie** — blocked by default in Safari and restricted in Chrome. It would work on a developer's machine and fail for the operator.

**Security rules, adopted verbatim from Next.js's own guidance:**

- Enable is **`GET`** (something opens a tab); end is **`POST`**.
- The post-enable redirect target is **fixed server-side, never read from `searchParams`** — otherwise this is an open redirect.
- ⚠ The end route must **never be reachable from a `<Link>`**: Next prefetches, so the session would clear before the operator clicks.
- The token is short-lived, single-purpose and signed. Draft content is reachable **only** with a valid token (FR-022).
- The draft route is `noindex`.

**The preview renders the real page with the real components.** There is no second renderer — FR-018 forbids one, because a preview that approximates the page teaches the operator to trust something wrong.

---

## 4. Compatibility and removals

**`banners` stays on the wire, present and empty**, for at least one release. ⚠ Removing the key outright is a **wire break** for any `customer-mobile` build already in the field — it would fail to parse rather than degrade to "no banners".

**Removed** (research R6):

- `GET /v1/storefront/promotions/:id` and `PromotionDTO` — they exist only because a cart-level code had nowhere to point. An offer tile carries a real destination. ⚠ **FR-045 is not satisfied by deleting the route**: that yields a bare 404 for an address a shopper may have bookmarked or been sent. `/promotions/:id` must serve a short "this offer has ended" page with a route back into the store — the shape 029 already chose for an expired promotion.
- The six advertising columns on `promo_code`, one index, one CHECK. Cart and checkout reference none of them.

**Cross-language agreement**: the block schema is generated from `packages/shared-types` and pinned by the platform's existing **byte-identical wire-contract test** — a shared JSON literal asserted from both Go and the TS contract. That pattern already exists here (028 built it for banners); this feature extends it rather than inventing a second mechanism.
