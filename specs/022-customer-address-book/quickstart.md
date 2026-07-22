# Quickstart: Customer Address Book (022)

Validation runbook. **Claude authors; the operator runs anything touching live state.** 🧑‍💻 =
operator-run. This is a small, mostly-frontend slice over the existing 019 address CRUD — most of it is
locally verifiable.

**Prerequisites**: a signed-in dev customer (customer pool) · `make core-run` (the address CRUD is on
the hot path) · the two customer surfaces runnable locally.

---

## 1. Build & unit verification (no cloud)

```bash
pnpm install
pnpm -r typecheck
pnpm --filter @effy/design-system test      # the new Drawer / ResponsiveModal
pnpm --filter @effy/edge-customer test       # the addresses slice: access decision + delete-default guard (10 tests)
pnpm --filter @effy/customer-web test        # address-book list/add/edit/set-default/delete + responsive container
cd apis/core-api && go build ./... && go vet ./... && go test ./... && cd -   # core still builds after the addresses removal
cd apps/customer-mobile && ./gradlew :shared:allTests && cd -
pnpm turbo build
```
Expected: all green. No `commerce-contract` regen needed (no DTO change). The address book management CRUD
now lives on the **cold path** (`apis/edge-api/customer/src/addresses/`); it was removed from core-api.

## 2. Deploy the cold path + run the clients 🧑‍💻

The address book is on **edge-api/customer** (serverless), so unlike a core-api-local slice it needs a
**deploy** to exercise end-to-end. It rides the existing customer service — no new infra (the customer
authorizer, gateway, and DB contract already exist):

```bash
make edge-deploy SERVICE=customer ENV=dev       # ships the 4 new /customer/v1/addresses routes
pnpm --filter @effy/customer-web dev            # EDGE_API_BASE_URL already points at the dev gateway
# and/or the mobile app on a simulator/device (edgeApiBaseUrl → dev gateway)
```
No migration and no Terraform change — `public.customer_address` (019) and the customer pool/authorizer
are already in place.

## 3. Walk the success criteria

| SC | Prove | Expected |
|---|---|---|
| **SC-001** | Add an address from the book | appears in the list < 30s, both surfaces |
| **SC-006** ⭐ | Open the add form on web at a wide viewport, then a narrow one; on mobile tap the FAB | wide → **dialog**; narrow → **drawer**; mobile → **bottom sheet** |
| **SC-002** | Set a non-default as default, then start checkout | checkout pre-selects the new default |
| **SC-003** | After any add/set-default, inspect the list | exactly **one** default, always |
| **SC-010** ⭐ | Try to delete the default with other addresses present — via UI **and** a direct API call | blocked both ways (UI disables/redirects; API returns **409**); never defaultless-with-addresses |
| **SC-004** | Delete an address a past order used; re-open that order | the order's address is **unchanged** |
| **SC-005** ⭐ | As customer A, attempt to read/delete customer B's address id directly | refused (scoped server-side) |
| **SC-009** | Open add/edit, enter data, dismiss the dialog/drawer/sheet | **nothing** saved |
| **SC-011** | Edit an address (tap the row body), change a field, save | updated in the list; default unchanged |
| **SC-007** | Repeat the above on **both** customer-web and customer-mobile | each satisfies its acceptance scenarios |
| **SC-008** | Inspect emitted analytics events | **zero** address fields in properties |

### The delete-default server proof (SC-010) 🧑‍💻

```bash
API=…   # the edge gateway base (dev) ; CUST = a customer ID token for an account with ≥2 addresses, one default
# direct API delete of the DEFAULT while others exist → 409, not 204
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Authorization: Bearer $CUST" "$API/customer/v1/addresses/$DEFAULT_ID"
# expect 409 (blocked). A non-default id → 204. The sole remaining address → 204.
```

### The edit entry-point check (FR-017a)

Tapping/clicking the **row body** opens the editor; tapping **set-default** or **delete** does **not**
open the editor. Verify on both surfaces.

---

## 4. Sign-off 🧑‍💻

- Update the parity register
  ([docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md)) with §022:
  view / add / edit / set-default / delete on both surfaces.
- Commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code.

## Known limits at sign-off

- **The address book is now on the deployable cold path** — unlike a core-api-local slice, it CAN go
  live in dev with `make edge-deploy SERVICE=customer ENV=dev` (no migration, no Terraform). Checkout's
  address *read* is still on core-api (local-only) — but that is the existing 019 checkout, unchanged.
- **The checkout inline `AddressForm` is not reconciled** to the new richer shared form (R8) — deliberate
  scope boundary; checkout keeps working unchanged.
- **`customer-web` guest bundle** — the address book lives in the `(account)` (signed-in) tree, not the
  guest pages, so it does not touch the pre-existing 160 KB guest-bundle breach.
