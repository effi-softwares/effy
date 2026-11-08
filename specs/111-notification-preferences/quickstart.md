# Quickstart: Notification Preferences & Marketing Consent (111)

A walk on dev after the deploy (plan › Deploy order). It uses two customer accounts:
- **A**, who has never ordered;
- **B**, who already has a paid order from before 111.

It also needs one Android phone with the customer app, one with the driver app, the website, the shop console and
back-office.

No offer or news message type exists yet: spec 4 adds the first. The rules for marketing sends (steps 6–7) are therefore
proved by container tests against real PostgreSQL in this spec and walked on dev in spec 4, with its first real offer.
Every other step is walked now.

## 1. Defaults and settings (Story 1)

1. As **A** in the app: Account → Notification settings.
   - **Expect**: Order updates and Points have push and email on; Offers and News are off with their footnote; Important
     and Support are fixed, each with its reason.
2. Turn off **push** for Order updates. Open the website as A → Account → Notification settings.
   - **Expect**: the same choice shows (SC-007).
3. Phone Settings → Effy → turn notifications off, then return to the app's settings.
   - **Expect**: "Notifications are off for Effy on this phone" with **Open settings**, which opens the phone's page for
     the app. Turn them back on.

## 2. A muted channel still lands in the inbox (Story 1, SC-004)

1. As A, place an order and pay.
   - **Expect**: no "Order confirmed" push; the email (if on) arrives; the inbox has "Order confirmed", unread.
2. In back-office › the order, check the notification's deliveries (DB, read-only):
   `SELECT channel, status FROM notification_delivery …`.
   - **Expect**: push `skipped`, email `sent`.

## 3. The offers ask (Story 2)

1. As A, after the step-2 order is placed, the confirmation shows **"Hear about offers from Effy?"** with **Yes, tell me**
   and **Not now**, both equally prominent. Choose **Not now**.
   - **Expect**: no ask on the website or app afterwards; settings still show Offers and News off.
2. As **B** on the website, place an order.
   - **Expect**: the ask appears on `checkout/complete` (B ordered before 111). Choose **Yes, tell me**. Open the app as B.
   - **Expect**: no ask; Offers and News are on, each with its push switch on.
3. Back-office › Customers › B › More › **Consent activity**.
   - **Expect**: "Said yes to offers" and "Said yes to news", "On the website, on the order confirmation", "Wording
     marketing-2026-11". There is no control to change them (Story 7).

## 4. Refusals (FR-009, SC-008)

1. With B's session, send `PATCH /customer/v1/notification-preferences` with `{"surface":"app","via":"settings","changes":
   [{"category":"important","channel":"push","enabled":false}]}`.
   - **Expect**: `400 category_required`.
2. Send consent with `"wordingVersion":"old"`.
   - **Expect**: `409 consent_wording_changed`.

## 5. Driver and shop (Story 4)

1. Driver app → Account → Notifications.
   - **Expect**: Work, Announcements, Important, each fixed with its reason; the phone's on/off works as before.
2. Shop console → Settings → Notifications.
   - **Expect**: "Always in your inbox" lists the five categories as fixed; the per-device switches work as before. The
     tour (NS v2) replays with the new step 3.

## 6. Consent, quiet hours and limits (Story 2, Story 3)

Container tests (automated, below) prove:
- a customer with no yes gets nothing at all (SC-001);
- the second promotion in a day is `capped` (SC-006);
- a promotion at 22:00 is held until 08:00 and released by the drain (SC-005);
- withdrawing consent before 08:00 makes the held push `skipped`;
- an order update at 22:00 is sent at once.

**Walk on dev now**: in back-office › Settings › Notifications, set 2 per day and 5 per week. The activity drawer shows
the change. Try a week value of 1.
- **Expect**: refused with the reason.

Set the limits back to 1 and 3.

**Walk in spec 4**: steps for the first real offer (consent, the cap, quiet hours, "Stop offers like this").

## 8. Android channels (Story 5)

On the customer app's Android phone: Settings → Apps → Effy → Notifications.
- **Expect**: Order updates, Points, Offers & news, Important.

Mute Points; send an order update.
- **Expect**: it still sounds, filed under Order updates.

The driver app lists Work, Announcements, Important.

## 9. Privacy policy (Story 6)

Open Legal › Privacy Policy on the website and in the app.
- **Expect**: version 2, whose Marketing section matches the approved wording.

## Automated checks (run by Claude during implement)

- `pnpm --filter @effy/shared-types test`: category policy, fixtures, Kotlin copies.
- `pnpm --filter @effy/edge-shared test`, plus the container tests on the local Postgres (`notify` rules, limits,
  quiet hours, the drain re-check, purge erasure).
- Real `goose up` / `down-to` / `up` of the migration against the local Postgres (the 109 Stage B lesson).
- The customer, orders and notifications services' unit tests and tsc; the gateway capacity contract test (shared 187,
  staff 218).
- shop-web, back-office and customer-web tests and builds (tours, skeletons, list screens, first-load rule).
- Kotlin host tests and Android/iOS compiles for both apps; `scripts/mobile-guard.sh` and `scripts/driver-guard.sh`.
