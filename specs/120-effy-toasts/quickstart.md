# Quickstart: validating Effy's own toasts (120)

No migration, no backend deploy, no Terraform. Only the three web apps change.

## 1. Automated checks (local)

```bash
pnpm --filter @effy/design-system test        # token, shape and usage guards + check-toast-size.mjs (first load ≤ 4 KB gz)
pnpm --filter @effy/design-system exec vitest run src/toast   # store rules, sound policy, announcer (contract guarantees 1-9)
make toast-guard                              # no sonner, no toast-store, no second toast region in any web app
make live-guards                              # still no timers (the arrival hook must not add one)
pnpm --filter @effy/shop-web test && pnpm --filter @effy/back-office test && pnpm --filter @effy/customer-web test
pnpm typecheck
```

## 2. Storefront budget

```bash
pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size     # every guest page ≤ 174 KB
pnpm --filter @effy/customer-web depcruise                                    # no radix/vaul/sonner on first load
```

Expected: each guest page grows by about 2 KB (measured 2026-11-13: search 168.1 → 170.1 KB; see FEATURE-HISTORY 120).

## 3. Walk - shop console (`pnpm --filter @effy/shop-web dev`, Sound on)

1. Mark several orders ready from the queue: the toast arrives from the top centre as a mark, opens, changes in place
   to the result, success settles with a pulse and a rising tone (US1 #1-2).
2. Make one fail (switch the network off in DevTools, then act): a failure shakes, plays the falling tone and stays.
   While it shows, save something that succeeds: the failure stays; close it and the success appears (US1 #3, SC-002).
3. Click the same action twice quickly: "×2", not a second toast (FR-009).
4. Turn Sound off with the header button: no tone at all (US1 #4). The new-order banner still chimes when Sound is on
   and "Play" on Settings › Notifications plays the same chime as before (FR-019).
5. macOS: System Settings › Accessibility › Display › Reduce motion: toasts only fade (US1 #5, SC-004).
6. Alt+T moves focus into the toast; Tab reaches its button; Escape closes it and focus returns (US4 #3).
7. Start a guided tour (Help), trigger a toast: it is above the dimming and clickable (FR-027). Open a dialog and
   trigger one from inside it: it shows above the dialog and is read out (R5).
8. Narrow the window to phone width and swipe a toast down: it goes (FR-012).
9. Dark appearance: the toast follows it.

## 4. Walk - back-office (`pnpm --filter @effy/back-office dev`)

1. Save a setting, assign a driver, credit points: each toast plays its tone (after the first click in the tab).
2. Scan box: a known label and an unknown one - each with its tone after the first click in the tab (US2 #2).

## 5. Walk - storefront (`pnpm --filter @effy/customer-web dev`)

1. As a guest: add to cart, save an item - the toast at the bottom centre, no sound ever (US3 #1).
2. Signed in: remove a cart line, press Undo - the toast changes in place to say so (US3 #2).
3. Screen reader (VoiceOver: Cmd+F5): each toast is read once; a failure is read straight away; a progress-only change
   is not read (US4, SC-006).

## 6. Phase 2 - arrivals

1. Shop console on the Orders page. In back-office › People › Messages, send that shop a direct message: within a few
   seconds a toast names it with "Open"; Open goes where the inbox would (US5 #1, SC-008).
2. Send two at once: one toast, "2 new notifications", Open goes to the inbox (US5 #2).
3. Stay on the Notifications page and send another: no toast (US5 #3).
4. Place a storefront order for that shop: only the new-order banner appears, no arrival toast (US5 #4).
5. Storefront, signed in, on the home page: a message to that customer shows the same toast, silently.

## Operator steps

None beyond deploying the three web apps (no backend change, no order dependency): push to `dev` and Amplify builds
them (`.github/workflows/amplify-deploy.yml`), or run that workflow by hand with apps
`apps/shop-web apps/back-office apps/customer-web`.
