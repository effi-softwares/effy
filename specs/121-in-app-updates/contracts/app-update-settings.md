# Contract: the app update settings file (121)

## Address

```
GET https://media.<zone>/app-updates/customer.json
GET https://media.<zone>/app-updates/driver.json
```

- `<zone>` is the environment's namespace: `dev.effyshopping.com` for dev, and production's zone when prod exists.
- The app gets the full URL at build time as `APP_UPDATES_URL` in `secrets.properties` (from `make output ENV=<env>`, output `app_updates_url_<app>`).
- No sign-in, no cookies, no query string.

## Response

| Case | Status | Body |
|---|---|---|
| First read, or changed | `200`, `Content-Type: application/json`, `ETag`, `Cache-Control: public, max-age=60` | the file |
| `If-None-Match` matches | `304` | empty |
| Not published yet | `403` (the bucket gives no ListBucket, so a missing key is 403) | the phone treats it as no answer |

## Body (schema 1)

```json
{
  "schema": 1,
  "ios": {
    "minimum": 0,
    "recommended": 0,
    "latest": 0,
    "storeUrl": null
  },
  "android": {
    "minimum": 0,
    "recommended": 0,
    "latest": 0,
    "storeUrl": null
  }
}
```

Example once the apps are in the stores (customer):

```json
{
  "schema": 1,
  "ios": {
    "minimum": 12,
    "recommended": 14,
    "latest": 15,
    "storeUrl": "https://apps.apple.com/au/app/id<operator-supplied>"
  },
  "android": {
    "minimum": 12,
    "recommended": 14,
    "latest": 16,
    "storeUrl": "https://play.google.com/store/apps/details?id=com.effyshopping.customer.mobile"
  }
}
```

Rules (validator `validateAppUpdateSettings`; the same rules on the phone):

1. `schema` is `1`. Unknown top-level or platform keys are refused by the validator; the phone ignores unknown keys only under a known schema.
2. Every build number is an integer ≥ 0, with `minimum ≤ recommended ≤ latest`.
3. In `prod`, `storeUrl` is non-null when any build number is > 0. In `dev` it may be null (the app then offers no
   Update now). The validator takes the environment from the file's folder (`config/app-updates/<env>/`).
4. iOS `storeUrl` matches `^https://apps\.apple\.com/[a-z]{2}/app/(?:[a-z0-9-]+/)?id\d+$`.
5. Android `storeUrl` matches `^https://play\.google\.com/store/apps/details\?id=<id>$`, where `<id>` is the app's own id (customer: `com.effyshopping.customer.mobile` or its `.dev` id; driver likewise).
6. ⚠ Store ids are **real-world identifiers**: the operator supplies them, and a placeholder (`id0000…`, `<…>`) is refused (constitution, Real-World Identifiers).

## Publishing (operator)

```
make app-updates-check                 # validate every file, no AWS
make app-updates ENV=dev [APP=customer] # validate, refuse uncommitted, upload, invalidate
```

The upload sets `Content-Type: application/json`, `Cache-Control: public, max-age=60` and `x-amz-meta-commit=<sha>`, then invalidates `/app-updates/*`.

## Infrastructure added (dev now; prod with the prod environment)

All in `infra/envs/<env>/media.tf`:

- **Bucket policy statement** `CdnReadsAppUpdateSettings`: `s3:GetObject` on `app-updates/*` for the media distribution only. `local.public_media_prefixes`, the pictures list, is unchanged.
- **CloudFront ordered cache behaviour** `/app-updates/*`:
  - cache policy `…-app-updates`: `min_ttl 0`, `default_ttl 60`, `max_ttl 60`, path-only key, gzip and brotli on;
  - response headers policy `…-app-updates`: `Cache-Control: public, max-age=60` override, no CORS.
- **Outputs and SSM**: `app_updates_url_customer`, `app_updates_url_driver`, and `/effy/<env>/app_updates/distribution_id` for the publish script (the bucket is 086's `/effy/<env>/media/bucket`).
