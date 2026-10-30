# Data Model: Promotion Skins (095)

One goose migration, `db/migrations/2026102xxxxxxx_promotion_skins.sql`. No trigger that can abort a write (platform
rule); every rule below that is not a CHECK or FK is enforced in the admin service.

## `public.promotion_skin` (new)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| name | text | 1–60 chars, UNIQUE (case-insensitive) |
| layout | text | `classic` \| `panel` \| `header_card` \| `full_picture` \| `picture_beside` \| `tile` \| `strip` (`classic`: the one built-in skin, settings `{}`, never updated or deleted - service) |
| settings | jsonb | shape per layout, `SkinSettings` (contracts/skin-settings.md); validated + contrast-checked by the service |
| version | int | starts 1; +1 per update; update requires `expectedVersion` |
| created_by / updated_by | text | staff sub |
| created_at / updated_at | timestamptz | |

`effy_shopper`: SELECT only (the group reads join it).

## `public.promotion_image` (new)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| promotion_id | uuid FK → promotion ON DELETE CASCADE | ≤ 10 per promotion (service, under the promotion row lock) |
| storage_key | text | `promotions/<promotionId>/<uuid>.<jpg\|png\|webp>`; UNIQUE |
| width, height | int | > 0, read from the uploaded object |
| alt | text | 1–150 chars |
| focus_x, focus_y | numeric(4,3) | 0–1, default 0.5 |
| position | int | ≥ 0, order on the promotion |
| created_by, created_at | | |

Index `(promotion_id, position)`. `effy_shopper`: SELECT only.

## `public.promotion_group` (extended)

| Column | Type | Rule |
|---|---|---|
| size | text NOT NULL | `large` \| `medium` \| `small` \| `strip`; seeded per group |
| default_skin_id | uuid NOT NULL FK → promotion_skin ON DELETE RESTRICT | layout fits `size` (service) |
| default_code_skin_id | uuid NULL FK → promotion_skin ON DELETE RESTRICT | NULL = `default_skin_id`; layout fits `size` |

## `public.promotion_group_member` (extended)

| Column | Type | Rule |
|---|---|---|
| skin_id | uuid NULL FK → promotion_skin ON DELETE RESTRICT | NULL = the group default; layout fits group size |
| image_id | uuid NULL FK → promotion_image ON DELETE SET NULL | must belong to the member's promotion (service) |

## Resolution (read side, one query per group read)

```
skin    = member.skin_id
          ?? (promotion has a shared code ? group.default_code_skin_id : null)
          ?? group.default_skin_id
picture = member.image_id (if the skin's layout shows a picture)
          ?? the promotion's picture whose width/height is closest to LAYOUT_RATIO[layout] (lowest position on a tie)
          ?? none → colour background + decorations
```

## Seeds (migration)

1. The built-in **Classic** skin, and five starter skins (research R8).
2. `promotion_group.size` for the five 094 groups; every default = Classic.
3. Group `mega-nav` (name "Aisles menu", size `small`, default Classic), members = today's `home-hero` then
   `home-between` members, deduplicated, in that order.
4. Members keep `skin_id = NULL` (they wear the group default - FR-025).

Migration order: create `promotion_skin`, insert seeds, add group columns NULL, set them, then `SET NOT NULL`.

## Layout facts (shared-types, not stored)

| Layout | Fits sizes | Shows picture | Preferred ratio |
|---|---|---|---|
| classic | all | as before 095 | - |
| panel | large, medium | optional (background) | 16:9 (large) / 4:3 (medium) |
| header_card | medium, small | optional (header) | 16:9 |
| full_picture | large, medium | required (falls back to colour) | 16:9 |
| picture_beside | large, medium, strip | required (falls back to colour) | 1:1 |
| tile | small, medium | optional | 1:1 |
| strip | strip | optional (small square) | 1:1 |

## History

`admin.audit_log`: `promotion_skin` (create, update with changed keys, duplicate, delete); `promotion` (image added,
edited, removed); `promotion_group` (size/defaults changed, member skin/picture changed).
