# Quickstart: Back-Office Messages (112)

## Before the walk (operator)

1. `make apply ENV=dev`: the `messages` worker's failure alarm (`infra/envs/dev/background-functions.tf`).
2. `make db-up ENV=dev`: the additive migration `20261111090000_backoffice_messages.sql`.
3. `make edge-deploy ENV=dev SERVICE=notifications`: the drain and purge read the new columns, and the `messages`
   worker starts.
4. `make edge-deploy-all ENV=dev`: `notify()` knows the message types in every service, plus the new `admin-messages`
   stack, the inbox `imageUrl`, and the `orders` settings field.
5. back-office, shop-web and customer-web through their pipelines. Then the customer and driver apps.

Accounts you need:
- back-office users: one manager, one CSA and one admin;
- two drivers, one signed in on a phone and one never signed in;
- two shops, each with a manager and a staff member;
- three customers: A said yes to offers, B said no, C never answered. A and B use the app.

```sh
psql "$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)"
```

## Local checks (Claude, before hand-off)

- `pnpm --filter @effy/edge-shared test`:
  - messages guard;
  - kinds test;
  - notify message cases;
  - 109's guard with the withdraw writer added;
  - the change map.
- Container suites on the local Postgres recipe (see memory "container tests without Docker"):
  - `shared/src/notifications/messages/*.container.test.ts`: every audience filter against a hand query, the count and
    consent count, and withdraw;
  - `notifications/src/messages/*.container.test.ts`: pages, stop, resume with no duplicate, 20,000 recipients, not
    sent for too many people, and the withdrawal announcement;
  - `admin/src/messages/*.container.test.ts`: routes, roles, versions and refusals;
  - `notifications/src/purge`: freezing.
- `pnpm --filter @effy/shared-types test`, plus the contract regeneration.
- Every service's `tsc` and vitest, and `gateway-capacity.contract.test.ts` (staff 231/300).
- back-office: vitest (tours 56, nav, skeletons, list screens), and the build.
- shop-web and customer-web: vitest and build. customer-web also runs depcruise.
- Customer and driver apps: host tests, Android and iOS compile, and the mobile and driver guards.
- Goose up/down/up on the local Postgres.

## The walk (dev)

### Drivers and shops (US1)

1. As the manager, open People › **Messages**. The tour ML starts. Choose **New message**: the tour ME starts.
2. Make an Announcement to Drivers, filtered to "all", with the title "Hub opens at 7 tomorrow", text naming the day,
   and the destination **Today**.
   - The count says 2 drivers.
   - The previews show the iPhone and Android lock screens, the inbox row, and the opened item.
3. Type a long title. The counter warns, and the lock-screen preview shows where it is cut off.
4. **Send to me** to your own driver account. It arrives with "Test: " at the start, and the report later does not
   count it.
5. **Send**. The sheet says "Send to 2 drivers?"; confirm.
   - Within a minute both drivers have it in their inbox.
   - The signed-in driver's phone shows it, and a tap opens the detail, then **Open** goes to Today.
6. Make an Announcement to Shops, chosen shop 1, managers only. Only shop 1's manager gets it, live in the console bell.
7. Add a picture to a new announcement. It shows in the opened item on the driver app and in the shop console, and in
   the expanded Android notification.

### Schedule, cancel, stop, withdraw (US2)

8. Schedule an announcement for 5 minutes from now, edit its text, and wait. The edited text arrives.
9. Schedule another and **Cancel** it. Nobody gets it, and the status is Cancelled.
10. Withdraw step 5's message. The sheet warns that phone notifications already shown stay.
    - Re-open the driver inbox: it's gone.
    - With the inbox open on the second phone, it disappears within a minute.
11. Stop sending (with the local recipe, or the 20,000 container test): status Stopped, with the count reached so far.

### Report (US3)

12. Open step 5's message. It shows: for 2, reached 2; push sent 1 and no phone 1; seen and opened as the drivers acted.
    The tour MS starts.
13. The list shows the message with reached and opened %. Filter by kind, audience and status, then reload: the filters
    are kept in the address.
14. In the activity drawer: created, test sent, sending, sent and withdrawn, with who did each.

### Direct (US4)

15. As the CSA, open customer B, then More → **Send message**: "We've added 500 points for the late delivery", leading
    to Points. B gets it under Support even with every switch off. More → **Messages received** lists it.
16. As the CSA, try **New message** in Messages. The button isn't shown, and a direct POST of an announcement gives 403.
17. Send a direct message to driver 1 and to shop 2 (everyone). Each one arrives.

### Important to customers (US5)

18. As the manager, make an Important message to customers in A's postcode. A gets it pinned at the top, at any hour,
    including B if B's address matches.
19. Choose all customers with no filter. **Send** requires typing the count.

### Offers and news (US6)

20. Make an Offer to all customers with the words "Effy: 20% off fruit this weekend", leading to the sale page.
    - The count shows "3 match, 1 said yes". Send to 1 customer.
    - Only A gets it, with "Stop offers like this" in the detail.
    - The report shows for 3, reached 1, no yes 2.
21. Change the words to drop "Effy". Send is refused with "Offers and news must say they're from Effy."
22. Send a second offer the same day. A gets it in the inbox only, and the report shows over the limit 1.
23. After 21:00, send a News message. A's inbox has it at once, the push arrives at 08:00, and the report shows held for
    the night until then.
24. **Send to me** to customer C (no yes). The answer is "This customer hasn't said yes to offers", and nothing arrives.

### Duplicate and limits (US7, safeguards)

25. **Duplicate** step 20's offer. A new draft has the same words, audience and destination, with no schedule.
26. Settings › Checkout › Notification limits: the tour CN version 2 shows the new step.
    - As the admin, set Largest message to 2. A message to 3 customers is refused with too many people.
    - As the manager, the field is read-only.
    - Set it back to 20,000.

### Database spot checks

```sql
-- every recipient row of one message, by audience and push outcome
select n.audience, d.status, count(*) from notification n
  left join notification_delivery d on d.notification_id = n.id and d.channel = 'push'
 where n.message_id = '<id>' group by 1, 2 order by 1, 2;

-- no row for anyone without a yes
select count(*) from notification n join customer c on c.cognito_sub = n.recipient_sub
 where n.message_id = '<offer id>'
   and not exists (select 1 from marketing_consent_current m
                    where m.customer_id = c.id and m.category = 'offers' and m.granted);   -- expect 0

-- the activity log
select event, actor, detail, created_at from message_event where message_id = '<id>' order by created_at;
```
