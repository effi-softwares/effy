# Quickstart: Messages That Do More (115)

## Before the walk (operator)

1. **Approve or edit the marketing-email consent wording**:
   `packages/legal-content/src/consent/marketing-email.json` (draft `marketing-email-2026-11`). Do 111's draft
   (`marketing-2026-11`) at the same time.
2. `make db-up ENV=dev`: `20261113090000_messages_email_automation.sql`.
3. `make edge-deploy ENV=dev SERVICE=notifications`: the drain must know the `message` email template and suppression,
   and the worker must know automations, before anything writes them.
4. `make edge-deploy ENV=dev SERVICE=customer`: unsubscribe, undo, the email switches.
5. `make edge-deploy ENV=dev SERVICE=admin-messages`: the automation routes.
6. `make edge-deploy-all ENV=dev`: the shared library (`notify`, inbox filling, the policy).
7. customer-web, back-office through their pipelines. Then the customer app.

No Terraform change: SES, the configuration set and the deliverability consumer exist. The `messages` worker already runs
every minute.

You need:
- back-office as admin, manager and CSA;
- customer A (said yes to offers, email for offers ON, given name "Sam");
- customer B (yes to offers, email OFF, no given name);
- customer C (never answered);
- a mailbox you can read for A.

## Local checks (Claude, before hand-off)

- **Container suites**:
  - the consent × email × suppression matrix (SC-003);
  - unsubscribe, one-click, undo and a wrong token;
  - the 111 view still deciding offers only from notification rows;
  - triggers over 7 simulated days (SC-004), with the reset after a new order and after the cart empties, and no backlog
    blast;
  - repeats over 4 simulated weeks (SC-005), waiting while sending, and pause/resume not catching up;
  - the report adding up with email (SC-007).
- **Unit tests**:
  - `fillFirstName` (push always the fallback, SC-006);
  - `nextRunAt` across a daylight-saving change;
  - the `message` template (marketing has the unsubscribe and headers; service kinds don't).
- **Guards**: `notifications.guard` (one writer), `messages.test` (kinds and CHECKs), gateway capacity (189 / 240),
  `change-map`, activity, tours (107 inventory + ME version).
- **Suites and builds**:
  - shared-types, email-kit and legal-content checks;
  - back-office, customer-web (vitest, build, depcruise first-load rule for `/email/unsubscribe`);
  - customer app host tests and compiles.
- Goose up / down-to / up.

## The walk (dev)

### Email (US1)

1. Back-office › Messages › New. Choose Offer, Customers, all who said yes.
   - Tick Email and preview it.
   - Send me a test to A: a "Test: …" email arrives, from Effy, with the footer and Unsubscribe.
2. Send it.
   - A gets the inbox item and the email.
   - B gets the inbox item and no email.
   - C gets nothing.
   - The report's Email section adds up.
3. Send an Important message with Email: A and B both get the email, with no unsubscribe in it.

### Unsubscribe (US2)

4. In a private window, open A's Unsubscribe link: "You won't get offers and news by email any more".
   - Tap Undo, then unsubscribe again.
   - A's settings show email off for both, and push is unchanged.
   - Back-office › A › Consent history shows "Email: no - from an email".
5. In Gmail, use the "Unsubscribe" button at the top of a new offer email: the same result.
6. Change one letter of the token: "That link didn't work", and nothing changes.

### Automatic (US3, US4)

7. Messages › Automatic › New.
   - Offer, trigger "hasn't ordered for 30 days", words "Hi {first name}, we miss you - 10% off from Effy", email on.
   - In psql, make A's last order 30 days old and after the automation's `activated_at`.
   - At the next 07:00 run (or trigger the worker), A gets it once.
   - The run shows on the automation page. Re-running sends nothing more.
8. A trigger "items left in the cart for 2 hours": leave items in B's cart and age them. The next hourly run sends once.
   Empty the cart, refill it and age it: it sends again.
9. A repeating News message every day at a time 5 minutes from now.
   - It sends, and appears in Messages with its own report.
   - Pause it, let a time pass, then resume: nothing is caught up.

### First name (US5)

10. A sees "Hi Sam" in the inbox and the email. B sees "Hi there". A's phone notification says "Hi there".
11. Typing `{first name}` in the title is refused with the reason.

### Database spot checks

```sql
-- nobody twice for one occurrence
select automation_id, customer_id, occurrence_key, count(*) from message_automation_recipient
 group by 1,2,3 having count(*) > 1;   -- expect 0 rows

-- no name stored in any notification
select count(*) from notification where body ~* '\{first name\|';   -- placeholders only; never a filled name
```
