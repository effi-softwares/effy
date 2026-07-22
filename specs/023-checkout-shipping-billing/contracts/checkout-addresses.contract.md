# Contract: Checkout Shipping & Billing Addresses (023)

**Paths**: checkout intent + order/receipt → **`core-api` (hot)**, `/v1/checkout/*` and `/v1/orders/*` ·
saved-address list read + new-address create → **`edge-api/customer` (cold)**, `/customer/v1/addresses`
(022, reused) · shop exposure → **`edge-api/shop` (cold)**, unchanged.
**Errors**: RFC 9457 problem+json.

No new endpoints. The change is **two DTO fields** (one request, one response) and one migration column.
The address **list** and **create** at checkout reuse 022's endpoints verbatim.

---

## Reused (022, cold path) — the checkout address picker & add-new

- `GET /customer/v1/addresses` — the saved-address list the checkout picker renders (shipping and, when
  diverged, billing). Default first.
- `POST /customer/v1/addresses` — "add a new address" at checkout writes here; the returned `AddressDTO.id`
  is then used as the shipping (or billing) selection. `makeDefault` may be false at checkout (adding a
  one-off address should not silently change the default — the client decides).

No change to these endpoints or their DTOs.

---

## `POST /v1/checkout/intent` — extended (hot path, 019/021)

**Request** — `CreateCheckoutIntentRequest` gains one optional field:

```
addressId:        string          // the SHIPPING address (required, unchanged)
selections:       DeliverySelectionDTO[]   // per-package delivery (021, unchanged)
billingAddressId?: string | null  // NEW — the billing address when the customer diverged.
                                   //   absent / null / equal to addressId  → billing = shipping (stores NULL)
```

**Behaviour**:
- The shipping address is validated and snapshotted as today (`delivery_address`).
- If `billingAddressId` is present, non-null, and **≠ `addressId`**, it is validated (customer-scoped) and
  snapshotted into `billing_address`. Otherwise `billing_address` is left **NULL** ("same as shipping").
- Re-pricing/serviceability key off the **shipping** address only (021) — billing never affects the amount.

**Errors**: `400` invalid/again-missing shipping address (unchanged); `400` a `billingAddressId` that is
not the customer's (same validation as the shipping id). Billing never changes the amount, so it cannot
cause a re-quote `409`.

> The client only sends address **ids**. It never sends address contents to the hot path — the snapshot is
> read server-side from `public.customer_address` (FR-021).

---

## `GET /v1/orders/{id}` and `GET /v1/orders` — extended receipt (hot path, 019)

**Response** — `OrderDTO` (and history summary where addresses appear) gains:

```
deliveryAddress: OrderAddressDTO        // the SHIPPING snapshot (unchanged field/shape)
billingAddress?: OrderAddressDTO | null // NEW — the billing snapshot; null = "same as shipping"
```

The client renders shipping in full; billing in full when non-null, else "Billing: same as shipping"
(FR-016). `OrderAddressDTO` is reused for both — no billing-specific shape.

---

## Shop fulfilment (edge-api/shop) — UNCHANGED, guarded

The shop reads **only** `o.delivery_address` (the shipping snapshot) and never selects or returns
`billing_address` (FR-018). This is enforced structurally (separate column) and **locked by a guard test**
asserting no shop-side SQL or DTO names `billing`. The 020 contract is amended by note; no shop endpoint,
DTO, or payload changes.

---

## Client responsibilities (both surfaces, parity)

- **Shipping**: pre-select the default saved address; a **picker** switches it; **add-new** opens the 022
  responsive form (dialog/drawer web; bottom sheet mobile) → `POST /customer/v1/addresses` → select. The
  chosen id is sent as `addressId`; changing it re-quotes before pay (FR-005).
- **Billing**: a **"Billing same as shipping"** toggle, ON by default. OFF reveals the same picker/add-new
  for billing; the chosen id is sent as `billingAddressId`. ON (or a billing equal to shipping) sends no
  `billingAddressId` (→ NULL). Toggling back ON discards the divergent selection (FR-013).
- **Receipt/history**: show both; "same as shipping" when `billingAddress` is null.
- **No card layouts** — a list/picker (FR-022). Identity is never sent — it comes from the token (FR-021).
