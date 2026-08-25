# Quickstart: Customer Payment Experience (051)

**Date**: 2026-08-25 · Validation guide. Implementation detail belongs in `tasks.md`.

Everything marked **[operator]** is run by a person against live AWS, live Stripe or a device. Claude
authors the code and hands these over — it does not run them (CLAUDE.md § Mode of work).

---

## 0. Prerequisites — the two blockers, first

Nothing below works until these are done, and neither is code.

### 0a. Register the payment method domains **[operator]**

⚠ **This is why the wallet row has never appeared.** Apple Pay and Link are switched on in the account
and still cannot render on an unregistered domain.

```bash
stripe get /v1/payment_method_domains        # expect: {"data": []} before, one entry per domain after

stripe post /v1/payment_method_domains -d domain_name=dev.effyshopping.com
```

Repeat for `effyshopping.com` and `www.effyshopping.com` when production is brought up. Registering in
live mode also registers in sandboxes. Stripe handles Apple's merchant validation — no Apple Merchant ID
or CSR is required.

**Verify**: re-run the `get`; the domain is listed and `enabled: true`.

### 0b. Move the constitution amendment **[operator]**

`/speckit-constitution` — widen Principle V's third-party-mark exception from *sign-in marks* to
*third-party marks generally*, keeping every existing bound (asset role only; never a UI accent, fill,
border or text colour; never a design token; never surfaced to the mobile Compose themes). MINOR bump.

**If declined**: drop FR-031, render the marks monochrome, and change nothing else.

### 0c. Optional, but it gates two acceptance walks **[operator]**

Activate the Stripe account (`details_submitted`) so Google Pay and Afterpay become available. Until then
they must not be offered (FR-010).

---

## 1. Database

```bash
git add db/migrations/<ts>_customer_stripe_reference.sql && git commit   # 003 commit-guard first
make db-status ENV=dev
make db-up ENV=dev            # [operator]
```

**Verify**:
```sql
\d public.customer                                   -- stripe_customer_id text, nullable, UNIQUE
SELECT count(*) FROM public.customer WHERE stripe_customer_id IS NOT NULL;   -- expect 0 before any payment
```

⚠ The column is nullable **by design** — a customer has no provider record until their first payment.
A non-zero count before anyone has paid means something is creating provider customers eagerly.

---

## 2. Hot path

```bash
make core-test                # go build / vet / test / gofmt
make core-run                 # [operator] — local Docker
./scripts/stripe-listen.sh    # [operator] — syncs the webhook secret, then forwards
```

**Verify the contract change is additive** — every pre-existing field is still present:
```bash
curl -s -X POST localhost:8080/v1/checkout/intent -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' -d '{"addressId":"…"}' | jq 'keys'
# expect the six original keys PLUS customerSessionSecret and billingDetails
```

**Verify the negatives** — each of these is a requirement, not a nicety:

| Check | Expected | Requirement |
|---|---|---|
| `stripe_customer_id` anywhere in the response | absent | data-model § 1 |
| `billingDetails` sent in the **request** | ignored; response carries the address the shopper confirmed | contract § 1 |
| Two intent calls for one order | one provider customer, one intent | FR-038 |
| `GET /v1/payment-methods` for a customer who has never paid | `200 {"paymentMethods": []}` | contract § 2 |
| `DELETE /v1/payment-methods/{someone else's id}` | `403`, and the card still exists | contract § 3 |
| `GET /v1/payment-methods` with the provider unreachable | an error, **never** `[]` | FR-036 |

---

## 3. Web

```bash
pnpm --filter @effy/customer-web typecheck && pnpm --filter @effy/customer-web test
pnpm --filter @effy/customer-web build
node apps/customer-web/scripts/bundle-budget.mjs      # /checkout is not gated; guest routes must not move
```

⚠ **Deploy `core-api` before `customer-web`** (047's lesson — a reversed order briefly blocked dev
checkout).

### The walk **[operator]** — `https://dev.effyshopping.com/checkout`

**US1 — card**
1. The step shows the amount and **no** basket line, address or delivery row. → SC-004, FR-003
2. The card form asks for **three** things. No country. No postcode. No name. → SC-001, FR-014/FR-015
3. Pay with `4242 4242 4242 4242`. Order reaches paid; charged amount == displayed amount. → SC-005
4. Switch to dark and reload. Every region follows, **including the card fields**. → SC-008, FR-030
5. Tab through the whole step and complete it with the keyboard alone. → SC-010, FR-034

**US2 — wallets** (needs § 0a)
6. On Safari/macOS with a card in Wallet, an Apple Pay button appears **above** the card form. → FR-008
7. In a browser with no wallet, no button, no gap, no apology. → US2 scenario 2
8. Dismiss the wallet sheet without paying: nothing charged, basket intact. → US2 scenario 4

**US3 — saved cards**
9. Tick "save this card", pay, sign out, sign in, return: the card is listed and pre-selected. → SC-002
10. ⚠ **The negative that matters**: pay with a *different* card and leave the box **unticked**. Return.
    That card is **absent**. → SC-013, FR-020/FR-021

**US4 — pay over time**
11. Klarna states payments, amount each, and whether interest applies **before** selection. → FR-012
12. Complete at Klarna → returns paid. Abandon at Klarna → nothing charged, basket intact, reason
    stated, every method available again. → SC-016, US4 scenario 5
13. A basket below a provider's minimum: the option is absent or shown unavailable **with the reason** —
    never offered then refused. → FR-011, US4 scenario 2

**US5 — failure**
14. `4000 0000 0000 0002` (decline) → named cause, nothing charged, basket intact, another method
    offered. → SC-007, FR-036/FR-037
15. `4000 0025 0000 3155` (3DS) → told the bank will ask, returned to Effy, order paid. → FR-040
16. Double-click pay → one charge. Reload mid-payment → one charge. Redeliver the webhook
    (`stripe events resend <id>`) → one charge. → **SC-006**, FR-038
17. Kill the network after pressing pay, restore it, return: never shown a failure for a payment that
    succeeded. → FR-039

**US6 — account**
18. `/account/payment-methods` sits beside Addresses; remove a card; it is gone from the payment step. → FR-024a
19. Remove the default: another kept card is selected next time. → FR-024b

**Receipt**
20. The receipt itemises delivery, and Items + Delivery == Total paid. → FR-043

---

## 4. Mobile

```bash
cd apps/customer-mobile
./gradlew :shared:compileAndroidMain :shared:testAndroidHostTest
./gradlew :shared:compileKotlinIosSimulatorArm64 :shared:compileTestKotlinIosSimulatorArm64
./gradlew :androidApp:assembleDebug
make cm-guard && make cm-tokens-check && make cm-contract-check
```

⚠ **`compileTestKotlinIosSimulatorArm64` is a separate gate from the main compile** and 033 found it had
never run. Both, every time.

### The walk **[operator]** — on a device, not a simulator, for the wallet steps

21. Repeat steps 1–5, 9–17 from § 3 on iOS **and** on Android. → FR-044
22. ⚠ **Look at the typeface in the payment element.** If it is the system font rather than General Sans,
    the `R.font` resource is missing (research R8) — this fails silently and nothing errors.
23. Google Pay on Android and Apple Pay on iOS. → FR-008 (needs § 0a and § 0c)
24. A card kept on web is offered on mobile, and the reverse. → SC-015, FR-045
25. Rotate, then set the largest system text size: no clipped row, no unreachable control. → FR-033
26. VoiceOver and TalkBack: choose a method, choose a card, pay. → SC-010, FR-034

⚠ **Android has never been looked at across 028, 029, 033 and 035.** It is a payment screen. Look at it.

---

## 5. Sweeps — every one of these is a requirement

```bash
# SC-012 — no card data anywhere, in any environment
rg -n "cardNumber|cvc|card_number|pan\b" apps/ apis/ packages/ --glob '!*/node_modules/*' --glob '!*/build/*'

# the provider customer reference must never reach a client
rg -n "stripe_customer_id|stripeCustomerId" apps/

# FR-031 containment — the colour must NOT be in the design system
make tokens-check           # must pass UNCHANGED — this is the proof
./scripts/check-no-emerald.sh && ./scripts/check-no-jade.sh
```

Then **read a real payment's logs** and confirm they carry the method and the outcome and nothing else —
no PAN, no CVC, no payment-method id, no provider customer id. A grep is necessary, not sufficient.

---

## 6. Definition of done

- [ ] § 0a domains registered; § 0b amendment moved (or FR-031 formally dropped)
- [ ] Migration committed and applied; `stripe_customer_id` nullable + UNIQUE
- [ ] Every check in § 2 passes, **including the four negatives**
- [ ] SC-001 … SC-016 walked on **both** surfaces and recorded
- [ ] The three unticked/abandoned/refused negatives (steps 10, 12, 13) confirmed — these are the ones a
      happy-path walk misses
- [ ] SC-006 proven by causing it four ways (step 16)
- [ ] § 5 sweeps clean, and `tokens:check` passes **unchanged**
- [ ] `docs/audiences/customer-capabilities.md` updated with every parity gap and its reason (FR-044)
- [ ] SIGNOFF.md records what was **not** walked — deferrals are recorded, never implied
