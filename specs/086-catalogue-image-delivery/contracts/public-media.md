# Contract: the public picture address (CDN)

**Feature**: 086 · R1–R4 in [research.md](../research.md)

## Address

```text
https://media.<env-zone>/<storage key>
e.g. https://media.dev.effyshopping.com/products/3f2c…/9b1e…a4.jpg
     https://media.dev.effyshopping.com/renditions/products/3f2c…/9b1e…a4/w320.webp
```

- Base URL: SSM `/effy/<env>/media/public_base_url` (no trailing slash) → env `MEDIA_PUBLIC_BASE_URL`
  in every service that builds an address (`storefront`, `commerce`). Declared in each `serverless.yml`;
  the services' config-contract tests read it from there. Not set → the service fails at first use.
- Built only by `publicImageUrl(storageKey)` in `@effy/edge-shared`.

## `publicImageUrl(storageKey)` — behaviour

| Input | Result |
|---|---|
| `null`, `undefined`, `""` | `null` |
| key whose first segment is in `PUBLIC_MEDIA_PREFIXES` (`products`, `promotions`, `renditions`) | `<base>/<key>`, the key's segments URI-encoded, `/` kept |
| key under `proof/`, `courier-label/`, or any other prefix | `null`, and a `warn` log naming the prefix only |
| key containing `..`, `//`, a leading `/` or a control character | `null` |
| `MEDIA_PUBLIC_BASE_URL` unset | throws `Error("MEDIA_PUBLIC_BASE_URL is not configured")` |

Pure: no network call and no signing.

## Responses from the CDN

| Request | Status | Notes |
|---|---|---|
| `GET` an existing key under a public prefix | 200 | `Cache-Control: public, max-age=31536000, immutable`; `Content-Type` as stored |
| `GET` a missing key under a public prefix | 403 | same as a refusal: existence is not revealed |
| `GET` any key under a private prefix (`proof/…`, `courier-label/…`, other) | 403 | the bucket policy does not cover it |
| `GET /` or any listing-shaped request | 403 | no `s3:ListBucket` is granted |
| `PUT`, `POST`, `DELETE` | 403 | allowed methods are `GET`, `HEAD` only |
| `http://…` | 301 → `https` | |

The bucket policy (Terraform `media.tf`):

```text
Effect  Allow
Principal  Service cloudfront.amazonaws.com
Action  s3:GetObject
Resource  arn:aws:s3:::<bucket>/<prefix>/*   for each prefix in local.public_media_prefixes
Condition  AWS:SourceArn = <this distribution's ARN>
```

The bucket's public-access block stays fully on: OAC access is not public access.

## Guards

- `PUBLIC_MEDIA_PREFIXES` (TS) == `local.public_media_prefixes` (Terraform), by a test that reads `media.tf`.
- The set never contains `proof`, `courier-label`, or `PROOF_MEDIA_PREFIX`.
- `storefront` and `commerce` call no `presignRead` / `imageUrlOrNull`.
- `orders`, `shop`, `driver`, `fleet`: no `publicImageUrl(` on a line naming a label or proof key.
