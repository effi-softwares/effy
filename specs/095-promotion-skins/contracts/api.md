# Contract: HTTP (095)

Errors are RFC 9457 as everywhere (`code`, optional `fields[]`). Staff routes: staff gateway, back-office authorizer;
writes need `admin` or `manager`, reads any staff role.

## Skins (admin, staff gateway) — 6 routes

| Method & path | Body / query | Answer |
|---|---|---|
| `GET /admin/v1/promotion-skins` | `?layout=&fits=<size>` | `{ items: AdminSkinListItemDTO[] }` (id, name, layout, version, updatedAt, usageCount) |
| `POST /admin/v1/promotion-skins` | `{ name, settings }` | 201 `AdminSkinDTO` · 422 `invalid_skin` / `skin_unreadable` (fields name the pair) · 409 `name_taken` |
| `GET /admin/v1/promotion-skins/{id}` | | `AdminSkinDTO` = skin + `usage: { placements, groups: {key,name,members}[], defaultOf: {key,name,forCode}[] }` |
| `PUT /admin/v1/promotion-skins/{id}` | `{ name?, settings?, expectedVersion }` | `AdminSkinDTO` · 409 `skin_changed` · 422 as POST, plus `skin_does_not_fit` when a layout change strands a placement |
| `POST /admin/v1/promotion-skins/{id}/duplicate` | `{ name }` | 201 `AdminSkinDTO` |
| `DELETE /admin/v1/promotion-skins/{id}` | | 204 · 409 `skin_in_use` with `usage` |

## Promotion pictures (admin, staff gateway) — 4 routes

| Method & path | Body | Answer |
|---|---|---|
| `POST /admin/v1/promotions/{id}/images/uploads` | `{ contentType, fileSize }` | `{ uploadUrl, storageKey }` · 422 `invalid_upload` |
| `POST /admin/v1/promotions/{id}/images` | `{ storageKey, alt, focusX?, focusY? }` | 201 `AdminPromotionImageDTO` · 422 `not_uploaded` / `not_a_picture` · 409 `too_many_images` |
| `PATCH /admin/v1/promotions/{id}/images/{imageId}` | `{ alt?, focusX?, focusY?, position? }` | `AdminPromotionImageDTO` |
| `DELETE /admin/v1/promotions/{id}/images/{imageId}` | `?confirm=true` when in use | 204 · 409 `image_in_use` with `{ groups[] }` when not confirmed |

`AdminPromotionDTO` (094) gains `images: AdminPromotionImageDTO[]`
(`id, url, imageWidths?, width, height, alt, focusX, focusY, position, usedIn: {key,name}[]`).

## Groups (admin, extended — no new routes)

- `AdminPromotionGroupDTO` gains `size`, `defaultSkin: {id,name,layout}`, `defaultCodeSkin: {...} | null`.
- `PATCH /admin/v1/promotion-groups/{id}` accepts `size?`, `defaultSkinId?`, `defaultCodeSkinId?` → 422
  `skin_does_not_fit`; a size change answers `reset: {promotionId}[]` (members moved back to the default).
- `PUT /admin/v1/promotion-groups/{id}/members` accepts, besides `promotionIds` (094, still valid),
  `members?: { promotionId, skinId?: string | null, imageId?: string | null }[]` in display order. When `members`
  is sent it wins. 422 `skin_does_not_fit` / `image_not_on_promotion`.
- `AdminPromotionGroupMemberDTO` gains `skinId`, `imageId`, and `resolved: ShopperPromotionDTO` (with `skin`) for
  the preview.
- `GET /admin/v1/promotion-groups/{id}/preview` (094) returns `shown[]` with `skin` resolved.

## Shopper reads (storefront public / commerce personal — unchanged routes)

`ShopperPromotionDTO` gains, additively:

```ts
skin?: {
  id: string; version: number; layout: SkinLayout; settings: SkinSettings;
  picture?: { url: string; imageWidths?: number[]; width: number; height: number; alt: string; focusX: number; focusY: number };
};
```

Absent only for a group with no resolvable skin (never after the migration). All 094 fields unchanged.
`PROMOTION_GROUP_KEYS` gains `megaNav: "mega-nav"`.
