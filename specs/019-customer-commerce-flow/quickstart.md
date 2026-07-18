# Quickstart: Customer Commerce Flow (019)

End-to-end validation guide — how to prove the slice works from browse to a placed, paid, fanned-out order,
on both surfaces, with Stripe **test mode**. Implementation detail lives in `tasks.md`; this is a run/verify
guide. Commands are illustrative of the existing Makefile/pnpm conventions.

## Prerequisites (operator)

1. **DB up with the new schema**: commit `db/migrations/<ts>_customer_commerce.sql`, then
   `make db-up ENV=dev` (the 003 commit-guard requires it committed first).
2. **Catalog data present**: at least a handful of `status='active'` products across ≥ 2 shops and ≥ 2
   categories, each with ≥ 1 `product_media` row (author via the shop/back-office catalog, or the 016
   `perf-seed.sql`). Multi-shop verification needs products owned by **two different shops**.
3. **Stripe test account**: obtain `pk_test_…`, `sk_test_…`. Create a webhook endpoint (see below) to get
   `whsec_…`. Put the secret + webhook secret in **Secrets Manager** under the platform contract; the
   publishable key goes into the client env/secret files:
   - `apps/customer-web/.env.local`: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…` (+ `NEXT_PUBLIC_CORE_API_BASE_URL`).
   - `apps/customer-mobile/secrets.properties`: `STRIPE_PUBLISHABLE_KEY=pk_test_…` (+ existing `CORE_API_BASE_URL`).
4. **core-api role** granted `s3:GetObject` on `arn:aws:s3:::effy-dev-product-media/*` (product images);
   locally the `ef` AWS profile already resolves S3 + Cognito.
5. **Run core-api**: `make core-run ENV=dev` (injects `DB_DSN`, `AUTH_CUSTOMER_*`, and now
   `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `AWS_MEDIA_BUCKET` at invocation — fail-closed if unset).
6. **Webhook tunnel (local)**: `make cm-ngrok-core` (or `stripe listen --forward-to
   localhost:8080/v1/stripe/webhook`); register the URL in the Stripe **test** dashboard; copy the `whsec_…`
   into `STRIPE_WEBHOOK_SECRET` and restart core-api.

## Backend smoke (curl)

```
# public reads (no token)
curl -s $CORE/v1/storefront/home | jq '.rails[].title'
curl -s "$CORE/v1/storefront/products?q=milk&limit=10" | jq '.items | length, .nextCursor'
curl -s $CORE/v1/storefront/products/$PID | jq '.gallery[0].imageUrl'   # a presigned S3 URL

# customer reads/writes (Bearer = a real customer access token)
curl -s -H "$AUTH" -XPOST $CORE/v1/cart/items -d '{"productId":"'$PID'","quantity":2}' | jq '.grandTotalAmount'
curl -s -H "$AUTH" -XPOST $CORE/v1/checkout/intent -d '{"addressId":"'$AID'"}' | jq '{orderNumber, clientSecret}'
```
`clientSecret` present, `sk_`/`whsec_` **never** in any response or log (grep to confirm).

## Web flow (Playwright + manual)

Run against a production build (`pnpm build && pnpm start` in `apps/customer-web`, per its Playwright config).

1. **Home (US1)** — `/` shows banner/carousel, search entry, category chips, and Featured / category /
   On-sale rails of product cards (image, price, sale badge with struck-through original).
2. **Product (US2)** — open a card → `/product/[id]`: gallery, price, description, **attributes as
   sectioned detail rows (no cards)**; set qty, **Add to cart** → cart badge increments.
3. **Search (US4)** — `/search?q=…`: results as cards, **infinite scroll appends** at the end; apply
   category + price + sale filters (removable chips); empty state on no match. Facets are `?query=params`
   and Disallowed in `robots.txt`.
4. **Cart (US3)** — `/cart`: lines with image/unit price/qty/subtotal, order summary (items + **flat
   delivery fee** + grand total); change qty / remove updates totals; **Checkout** as a guest → sign-in →
   returns with cart intact (SC-009).
5. **Checkout + pay (US3)** — enter/select a delivery address; **Payment Element** with test card
   `4242 4242 4242 4242`, any future expiry/CVC → pay → `/checkout/complete` shows the **receipt** (order
   number, items, address, amount paid, paid status). Use `4000 0027 6000 3184` to exercise the **3DS**
   challenge; `4000 0000 0000 9995` (declined) → clear error, **no order placed**, cart preserved (SC-007).
6. **Idempotency (SC-006)** — double-submit checkout / retry the request → exactly one order, one charge
   (verify in `public.order` + the Stripe test dashboard).
7. **Orders (US5)** — `/orders` lists most-recent-first; open → full receipt.
8. **Favorites (US6)** — save from a product page (guest → sign-in prompt), appears in `/favorites`,
   persists across sign-out/in; remove reflects on the product page.

## Mobile flow (Android + iOS)

Build both apps (`STRIPE_PUBLISHABLE_KEY` in `secrets.properties`). Same journey as web, native:
Home rails → product detail (swipeable gallery, sectioned attributes) → add to cart → cart → checkout →
**PaymentSheet** (test card `4242…`) → receipt. Verify the adaptive layout (phone bar / tablet rail) and
that Orders/Account remain gated for guests (deferred sign-in returns to intent). iOS uses the
`SwiftPaymentBridge` PaymentSheet; Android uses the native PaymentSheet.

## Multi-shop fan-out verification (SC-005) — the headline check

1. Build a cart with items from **two different shops** (products with distinct `product.shop_id`), pay.
2. In the DB confirm the split:
   ```sql
   SELECT shop_id, item_count, subtotal_amount FROM public.shop_fulfillment WHERE order_id = :oid;
   -- exactly 2 rows, one per shop, each only its own items
   SELECT (SELECT SUM(subtotal_amount) FROM public.shop_fulfillment WHERE order_id=:oid)
        = (SELECT item_subtotal_amount FROM public."order" WHERE id=:oid);   -- true
   SELECT event_type, payload->'shops' FROM public.event_outbox WHERE aggregate_id = :oid; -- one order.placed row
   ```
3. The customer still sees **one** order + **one** receipt whose totals equal the sum of the shop portions.

## Reconciliation & safety checks

- **SC-008**: receipt total == Stripe charge (test dashboard) == `/v1/orders/{id}` total, to the cent.
- **SC-012**: `grep -ri "4242\|sk_test\|client_secret\|whsec" <core-api logs>` → nothing; PostHog events
  carry no PII beyond the subject id.
- **Webhook resilience**: replay a Stripe test event → `stripe_event` dedup makes it a no-op (order stays
  paid once). Kill the app right after payment, reopen → order shows paid (webhook authority).

## Automated gates (must be green)

- `pnpm -r typecheck` + `pnpm -r test` (web-kit / customer-web vitest incl. cart math + mappers).
- `apps/customer-web` Playwright E2E (checkout with test card, deferred-signin, idempotent re-submit, SSR/SEO).
- `make core-test` (storefront/cart/checkout/orders service + handler tests + the `PaymentGateway` fake;
  testcontainers repo tests with `FULL=1`).
- customer-mobile `commonTest` (cart totals, price-change detection, DTO↔domain mappers) + both apps build
  (Android + iOS frameworks link).
- `terraform validate` / `fmt` if the core-api role/media grant is expressed in Terraform; secret/PII sweep
  clean.
