# Test plan: Reaching the Right Place (116)

A simple, step-by-step check of the three things 116 adds. Tick each box as you go. Android now; the iPhone part is at
the end, for after the paid Apple account.

**You need:**
- an Android phone (or the emulator) with the customer app built from this code;
- a computer with `adb`, and the phone connected (USB debugging on);
- a customer test account you can sign in to on the phone AND on the website (`https://dev.effyshopping.com`);
- back-office access (to send yourself a message).

Time: about 30 minutes.

---

## Part 0 - Set up (once)

- [x] **0.1 Get the app's signing fingerprint.** In `apps/customer-mobile`:
  ```
  ./gradlew :androidApp:signingReport
  ```
  Under the `debug` variant, copy the **SHA-256** line (looks like `AB:CD:…`, 32 pairs).
- [x] **0.2 Put it in Terraform.** In `infra/envs/dev/dev.tfvars`:
  ```
  android_app_cert_sha256 = ["AB:CD:…"]
  ```
  Then:
  ```
  AWS_PROFILE=ef make apply ENV=dev
  ```
- [x] **0.3 Redeploy customer-web** (the link file is written when it builds).
- [x] **0.4 Check the website now publishes it.** On the computer:
  ```
  curl -i https://dev.effyshopping.com/.well-known/assetlinks.json
  ```
  ✅ Expect: `200`, `content-type: application/json`, and your fingerprint in the text.
  ❌ A `404` means 0.2 or 0.3 didn't take.
- [x] **0.5 Tell the app its host.** In `apps/customer-mobile/secrets.properties` add:
  ```
  WEB_SITE_HOST=dev.effyshopping.com
  ```
  Build and install the app on the phone (uninstall the old one first).
- [x] **0.6 Check Android trusts the link.** On the computer:
  ```
  adb shell pm get-app-links com.effyshopping.customer.mobile
  ```
  ✅ Expect: `dev.effyshopping.com: verified`.
  If it says `legacy_failure` or `none`, run `adb shell pm verify-app-links --re-verify com.effyshopping.customer.mobile`, wait
  30 seconds, and check again.
- [ ] **0.7 Sign in** to the app with the test customer, and allow notifications when asked.

---

## Part 1 - Links open the app

Find the id of one of the test customer's orders (open it on the website: the address ends `/orders/<id>`).

Open each link below on the phone. Two ways - use either:
- **Real email:** tap the button in an Effy email in Gmail on the phone.
- **From the computer:**
  ```
  adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "<link>"
  ```

| # | Link | ✅ Expect |
|---|---|---|
| 1.1 | `https://dev.effyshopping.com/orders/<id>` | the **app** opens on that order |
| 1.2 | `https://dev.effyshopping.com/orders` | the app's **Orders** tab |
| 1.3 | `https://dev.effyshopping.com/account/points` | the app's **Points** screen |
| 1.4 | `https://dev.effyshopping.com/offers` | the app's **Offers** |
| 1.5 | `https://dev.effyshopping.com/search?q=milk` | the app's search for "milk" |
| 1.6 | `https://dev.effyshopping.com/` | the app's **Home** |
| 1.7 | `https://dev.effyshopping.com/help` | the **browser**, not the app |
| 1.8 | `https://dev.effyshopping.com/email/unsubscribe?t=x` | the **browser** (says the link didn't work - fine) |

- [ ] 1.1 – 1.8 all as expected.
- [ ] **1.9 Signed out.** Sign out of the app, open link 1.1. ✅ The app asks you to sign in; after signing in it opens that
  order.
- [ ] **1.10 Signed out, public page.** Still signed out, open link 1.4. ✅ Offers open straight away, no sign-in.
- [ ] **1.11 Real emails.** Trigger an order email (place a small order) and tap "View your order" in Gmail on the phone.
  ✅ The app opens on the order. (If Gmail opens its own in-app browser instead, that's a known Android behaviour, not a
  failure.)
- [ ] **1.12 Without the app.** Uninstall the app and open link 1.1. ✅ The website opens the same order. Reinstall and
  sign in again for Part 2.

---

## Part 2 - The badge stays right (Android)

On Android the "badge" is the dot on the app icon and the Effy notifications in the pull-down tray.

- [ ] **2.1 Make three notifications.** In back-office › Messages › New message: kind **Important**, To **Customers**,
  narrowed to your test customer only, title e.g. "Badge test 1". Send it. Do this three times (titles 1, 2, 3).
  ✅ Three Effy notifications in the phone's tray; the app icon shows a dot (or 3).
- [ ] **2.2 Open the inbox on the website - not the phone.** Sign in on the website as the same customer and open
  `/account/notifications`. Put the phone down and don't touch it.
  ✅ Within about **2 minutes** the three notifications disappear from the phone's tray and the dot goes. The phone
  doesn't buzz or light up.
- [ ] **2.3 One at a time.** Send three more (titles 4, 5, 6). Don't open any inbox. In back-office › Messages, open
  "Badge test 6" and **Withdraw** it.
  ✅ Within about 2 minutes "Badge test 6" leaves the phone's tray; 4 and 5 stay.
- [ ] **2.4 Open in the app.** Open the app's inbox. ✅ The remaining notifications leave the tray at once, and the dot
  goes.
- [ ] **2.5 Sign out.** Send one more, see it in the tray, then sign out of the app. ✅ The tray clears.
- [ ] **2.6 Driver app.** See Part 2D.

> If a correction is slow: phones in deep sleep receive silent messages late. Wake the screen and it should catch up.

---

## Part 2D - The driver app

The driver app gets the badge and urgency changes (no links - drivers aren't sent emails that open their app). Drivers
have no web inbox, so the "changed somewhere else" check is a **withdrawal** from back-office.

**You need:** a test driver account (signed in by email code) and back-office access. About 10 minutes.

**Set up**

- [ ] **2D.0 Install the new build.** In `apps/driver-mobile`:
  ```
  ./gradlew :androidApp:installRelease
  ```
  If it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (the old copy was signed with another key), uninstall it first -
  this only signs the driver out on this phone:
  ```
  adb uninstall com.effyshopping.driver.mobile
  ./gradlew :androidApp:installRelease
  ```
- [ ] **2D.1 Sign in.** Open the **driver** app, sign in with the test driver, and **allow notifications** when asked.
  ✅ You reach Today.

**Badge**

- [ ] **2D.2 Two notifications.** In back-office › Messages › New message: kind **Announcement**, To **Drivers**, narrowed
  to that one driver (chosen drivers). Send "Driver badge 1", then "Driver badge 2".
  ✅ Two Effy driver notifications in the tray; the app icon shows a dot.
- [ ] **2D.3 Withdraw one.** Don't open the driver app. In back-office open "Driver badge 2" and **Withdraw** it.
  ✅ Within about **2 minutes** only "Driver badge 2" leaves the tray; "Driver badge 1" stays. No buzz, no sound.
- [ ] **2D.4 Open in the app.** Open the driver app's inbox (the bell).
  ✅ "Driver badge 1" leaves the tray at once; the dot goes.
- [ ] **2D.5 Sign out.** Send one more announcement, see it in the tray, then sign out of the driver app.
  ✅ The tray clears.
- [ ] **2D.6 Reopen after a cold start (no wipe).** Sign in again, send one more, then force-close the app
  (`adb shell am force-stop com.effyshopping.driver.mobile`) and open it again.
  ✅ The notification is still in the tray while the app starts - opening the app alone never clears the badge before
  it knows the count. (Opening the inbox does.)

**Urgency (nothing changes on Android)**

- [ ] **2D.7** Send the driver an **Important** message, then an **Announcement**.
  ✅ The important one arrives with sound in the driver app's **Important** category; the announcement arrives quietly
  in **Announcements** - exactly as before 116.

**After the paid Apple account (iPhone driver app)** - with steps 1–6 of "After paying" done:

- [ ] **2D.8** Repeat 2D.2–2D.3 on an iPhone. ✅ The red number on the icon goes from 2 to 1 within about 2 minutes.
- [ ] **2D.9** With a Focus mode silencing the driver app, send an **Important** message. ✅ It breaks through, labelled
  **Time Sensitive**.

---

## Part 3 - Urgency (nothing changes on Android)

- [ ] **3.1** Send an **Important** message and an **Offer** (to a test customer who said yes to offers).
  ✅ On Android, the important one makes a sound; the offer arrives as an ordinary notification in its "Offers & news"
  category - exactly as before 116.

The iPhone behaviour (important breaks through Focus, offers arrive silently) can only be seen after the paid Apple
account - see Part 4.

---

## Part 4 - iPhone (after the paid Apple account only)

First follow `docs/observability-apple-blockers.md` → "After paying", steps 1–7. Then:

- [ ] **4.1** `curl -i https://dev.effyshopping.com/.well-known/apple-app-site-association` ✅ `200`, JSON, your Team ID in it.
- [ ] **4.2** Repeat Part 1 on the iPhone (tap links in Mail or Notes). ✅ Same results.
- [ ] **4.3** Repeat 2.1–2.2. ✅ The red number on the icon goes from 3 to nothing within about 2 minutes.
- [ ] **4.4** Turn on a Focus mode that silences Effy. Send an **Important** message. ✅ It still appears, labelled
  **Time Sensitive**.
- [ ] **4.5** Send an **Offer**. ✅ No sound and the screen doesn't wake; it's waiting in Notification Centre.

---

## If something doesn't work

| What you see | Most likely cause | Check |
|---|---|---|
| Links open the browser on Android | not verified | 0.4 (file is live?), 0.5 (host set, app rebuilt?), 0.6 |
| `assetlinks.json` is 404 | fingerprint not set, or customer-web not redeployed | 0.2, 0.3 |
| Verified, but one page opens the browser | that page isn't one of the eight | expected for help, legal, unsubscribe, cart, checkout |
| Badge never clears from the website | notifications service not deployed | redeploy: `AWS_PROFILE=ef make edge-deploy SERVICE=notifications ENV=dev` |
| Badge clears only when the app opens | the phone is asleep, or notifications are blocked for Effy | wake the screen; check the phone's notification settings |

Write down anything that fails (step number, what you saw) and send it to me.
