# Order Console — operator guide

> ⚠ **PARTLY OUT OF DATE (2026-10-10, feature 083).** There is now ONE delivery model: an order is
> **Delivered by Effy** in a window (today, or one of the next delivery days) or sent by **Courier
> delivery**. Anything below about a same-day/standard method choice, a standard day handed to a carrier,
> the carrier lead time, the standard look-ahead, same-day zones or per-shop same-day exceptions, or a
> driver cleared "for same-day" describes the arrangement that was removed. The current model is in
> "Delivery model" in [CLAUDE.md](../CLAUDE.md); the old one in
> [archive/delivery-model-v1.md](archive/delivery-model-v1.md). This guide has not yet been rewritten.

**Back-office → Orders.** Added by [053-order-lifecycle-completion](../specs/053-order-lifecycle-completion/).

Before this console existed, nobody at Effy could look up an order. A customer told *"contact support
and we'll sort it out"* reached people who could not see what they were being asked about.

---

## Who can do what

| Action | admin | manager | csa |
|---|:--:|:--:|:--:|
| Find an order, read it, read its history | ✅ | ✅ | ✅ |
| Record a carrier handover | ✅ | ✅ | ❌ |
| Record an arrival | ✅ | ✅ | ❌ |

Reading is open to every active staff member because triage is a CSA's work. Recording is not, and the
reason is worth knowing: **with no carrier integration, "arrived" is an assertion, not an
observation** — somebody is recording that a package they never saw reached a customer they never met,
and that assertion finishes a financial record and emails the customer.

The buttons are hidden for a CSA, and the backend refuses the request independently. Neither is the
gate on its own.

---

## The two things you record

### 1. Handover — the package left us

A **standard** package is collected from its shop, checked in at the hub, and handed to an outside
delivery company. Record that here.

- **Carrier** and **consignment reference** are both **optional**, and leaving them blank is normal.
  Effy has no carrier contract yet, so most handovers genuinely have no number to record. A handover
  with no reference is a **complete** record — nothing will warn you, and nothing is missing.
- A **same-day** package never appears here. An Effy driver delivers it and closes it with proof.

### 2. Arrival — it reached the customer

Once you know the package arrived, record it. This is the step that finishes the order.

- It requires a handover first. Without one, nobody can say who had the package, and the console
  refuses with that reason.
- **Record it only when you actually know.** Nothing else on the platform checks this. Recording an
  arrival tells the customer their shopping came, in an email and a push notification, and it releases
  their account for deletion.
- Pressing twice is safe. The second press changes nothing — no second email, and the recorded arrival
  time stays as it was.

**An order is finished only when every one of its packages has arrived.** An order split across two
shops stays open until both are in. The customer is told once, at the end, not once per package.

### The day the customer chose (069)

A customer now chooses **the day a standard delivery arrives**, and a **time window** for same-day.
Each package row on an order shows what it was promised:

- **Promised** — the day (and, for same-day, the window, in Melbourne time).
- **Hand over by** — for a standard package not yet handed over: its day minus the carrier lead time.
- **At risk of missing its day** — that day has passed and the package has not been handed over, or it
  was handed over late.
- **Arrived on time / Arrived late** — once it has arrived: inside its window for same-day, on or
  before its day for standard.
- **Slot over capacity** — a late payer was honoured in a full slot; see the delivery guide.

An order placed **before this feature** was promised no day. Its row shows none of these — that is
not missing data.

**Orders → Carrier handover** lists every standard package still to be handed over, in three tabs:
**Due today**, **Overdue** and **Upcoming**. "Not at the hub yet" means it is due out but a driver
has not collected it from the shop. Every role can read the list; you record the handover on the
order itself, as before.

> ⚠ "Hand over by" rests on the **carrier lead time**, which is an estimate (Delivery → Delivery
> days). If packages handed over on time keep arriving late, that number is wrong.

---

## Reading the list

**Delivery** (079) says who delivers the order: **Delivered by Effy** or **Courier delivery** — the same
two names the customer reads. The filter beside the work-queue filter narrows the list to either, or to
**Placed before delivery types**: older orders have no type and show a dash, because nothing about an
old order is guessed. Their packages still say who delivered them, on the order page.

On an order, **Delivery type** shows who delivers it, **why** (the address is in Effy's area; it is
outside; no Effy window was available; changed by staff), what a courier customer **was told** — the
estimate as it stood when they ordered — and a short history: how it was decided at checkout, then any
change with who and why. Since 081 an admin or a manager can change it — see *Moving an order between
Effy and courier* below.

A **courier order** was promised no day. Since 080 a parcel at the hub is due out by **its courier
service's next pickup** (the service's pickup days and cut-off), counted from when it was checked in.

### The Courier tab (080 — was "Handover")

Every courier parcel, in five views:

| View | What is in it |
|---|---|
| **Due at the hub** | At (or on its way to) the hub, going via the hub, not handed over. Sorted by when it is due out. |
| **Late at the hub** | Past its service's pickup and still here. Hand it over, or find out why. |
| **Supplier pickups** | Parcels the courier collects from the supplier. Shows the booked pickup; *Late* once the window has gone with no handover. |
| **With the courier** | Handed over, not delivered. *Late* when it has been with the courier longer than the service's usual maximum. |
| **Problems** | Delivery failed, lost, damaged or returned to sender — until resolved. These also show as **Courier problem** in the order list. |

A parcel late at the hub or at a supplier for two hours raises an alarm to the operator (080).

### The consignment (080)

On the order page each courier parcel has a **Courier consignment** block: the service, where it is,
how it reaches the courier, the pickup (supplier pickups), reference, tracking link and label.

- **Book** — choose the service (only active ones; for a supplier pickup only services that collect from
  suppliers), optionally the reference, the tracking link (https) and the label (PDF or PNG, up to 5 MB),
  and for a supplier pickup the day and window. You book with the courier yourself, outside Effy; this
  records it. ⚠ The label carries the customer's name and address — it is stored privately and opened
  only through a short-lived link.
- **Handed over** — via the hub you record it as before (it books with the order's service if you had
  not); from a supplier, the supplier presses *Handed over to courier*. The customer is then emailed —
  once per parcel — with the courier, the reference and the tracking link if there is one.
- **Progress** — In transit, Delivered, Delivery failed, Lost, Damaged, Returned to sender, each with an
  optional note. **Delivered** finishes the parcel exactly like recording an arrival. A problem stays a
  problem until you press **Resolved** (or Delivered). Before handover you can **Cancel booking**.

What the customer sees: one **Track your parcel** link when the order travels as a single parcel and you
gave a link; *"Tracking for each parcel is sent to you by email"* when it travels as more than one.
Never how many, and never who packed it.

**How it reaches the courier** (Delivery type section) can be switched — *via the hub* ⇄ *pickup from
the supplier* — until the first parcel has left. A switch to the supplier is refused while a driver is
assigned to collect a parcel: **Unassign** them (Packages) first. Switching to the hub cancels any
booked-but-not-handed-over supplier pickup. Every switch is kept with who, when and why.

**Next step** is the working column:

- **Needs a refund decision** — a shop said it cannot supply its part.
- **Courier problem** (080) — a courier lost, damaged or returned a parcel, or could not deliver it.
- **Needs handover** — collected, **a courier's package**, not yet handed over. Your queue. A package Effy
  delivers itself — today, or in a window on a later day — never appears here, whatever it is called.
- **Awaiting arrival** — handed over, not yet confirmed.
- **Complete** — every package has arrived.

**Customer sees** is the word the *shopper* is looking at right now, not an internal status. It is what
a support call opens with.

| Customer sees | Means |
|---|---|
| Confirmed | Paid; nothing has moved yet |
| Packing | Being picked, **or packed and waiting at the shop** for the next collection round |
| On the way | It has left the shop — with a driver, at the hub, or with a carrier |
| Delivered | Every package has arrived |

⚠ **"Packing" covers a packed package still sitting at its shop.** That is deliberate. Under the
hub-and-spoke operation a packed package can wait until the next scheduled collection round — possibly
the following day — and telling a customer it is "on the way" before it has left is a claim the
business has not earned.

---

## Assignments across days (082)

**Delivery windows** on the Assignments tab shows any day with windows on sale — today first. For each
window: its parcels, where each is (the same status words as everywhere), and who has the round.

- A **later day's window says "Planned on the day"**. A delivery round is planned on its own day, so
  until then nobody's name is on it. Its parcels are waiting at the hub (or still at the supplier) —
  they are not unassigned, and "Assign to…" for a delivery is refused before the day.
- **Late for its run** — the parcel is still at its supplier after the collection run that would have
  reached the hub in time for its window. It goes on the next run; the window is at risk. (A parcel is
  collected on the latest run that makes its window, so one ready days early is not late.)
- **Needs cold storage** — chilled or frozen goods that reached the hub on a day before the one they
  go out on.

**Needs a driver** in the order list now means: ready at a supplier with nobody to collect it, or — for
any day's window — a parcel Effy delivers, at the hub, whose round has opened with nobody on it.

Drivers' **permissions** (Drivers → a driver) are **Collects** and **Delivers**, each *Everywhere* or
named areas. There is no "same-day" or "standard": a driver who delivers in an area delivers whatever
Effy delivers there, and a postcode in no area can go to any driver who delivers.

## Moving an order between Effy and courier (081)

**For emergencies only** — the van is off the road, a driver is missing. On a paid order Effy delivers,
**Delivery type → Send by courier…** opens a dialog with the figures the server worked out:

- what the customer **paid for delivery**, what **courier delivery costs** for this order today, and
  the **difference** (never below zero — if the courier costs more, Effy bears it and the customer pays
  nothing more);
- the courier service and how the parcels will reach it (the platform default, or **via the hub** once
  a parcel has left a supplier), and the timeframe the customer will be told;
- **how to make it right**, chosen by you — nothing is decided for you:
  - **Points for the difference** (recommended, preselected);
  - **Free delivery, as points** — the whole delivery charge as points;
  - **Free delivery, back to the card** — the whole charge refunded;
  - **Refund the difference to the card** — the last resort;
  - **Nothing** — say why.

Write **why** (staff only — the customer never sees it) and confirm. In one step: the window is given up
(someone else can book it at once), the order leaves drivers' delivery rounds (and their collection
rounds too when the courier collects from the supplier), the customer is credited or refunded, and they
are emailed and notified that it now arrives by courier, with what they received.

If the figures changed while the dialog was open, the confirm is refused and the new figures are shown —
check them and confirm again. A refund that the payment provider has not answered is retried
automatically; one it refused is shown, and can be issued from Refunds.

**Refused** while a parcel is out for delivery on a round under way (wait until the driver settles it),
once a parcel has been handed to a courier or delivered, and for an order placed before delivery types.
Courier delivery must be set up (a courier fee table and a default courier service).

**Deliver by Effy…** on a courier order moves it back, before any parcel is with the courier and only
to an address on Effy's list: choose one of the windows open with room now. No money moves either way,
and anything given when it went to courier stays with the customer.

Every move is listed under Delivery type — when, who, why, the window given up or taken, the figures
and what the customer received — for every role. Customer-service agents can read it; only admins and
managers can move. More than 5 moves to courier in a day raises an alarm.

## Refunds and cancellation (055)

⚠ **This console now moves real money.** Read this section before using it.

**Issuing a refund.** Pick the items, or choose *Goodwill* and type an amount with a reason. The
amount for items is **computed and cannot be edited** — if it could, the figure and the lines could
disagree, and the record would claim a refund covered items it did not. A confirmation names the
amount before anything happens.

⚠ **Refunding is irreversible.** There is no un-refund; a correction would be a new charge, which the
platform cannot make. That is why the control asks first, and why `csa` cannot use it.

⚠ **"On its way" is not "refunded".** The provider accepting a refund only means it has been
submitted; the bank can reject it **up to thirty days later**. Watch the state:

| What you see | What it means | What to do |
| --- | --- | --- |
| On its way to the customer | Submitted, not yet settled | Nothing — this is normal |
| Refunded | The money actually landed | Nothing |
| **Failed — needs attention** | The bank rejected it | Read the reason; a retry may work |
| **Refused — cannot be retried** | The provider would not accept it | Do not retry; the answer will not change |
| **No answer from the bank — needs checking** | We never got a reply — the refund may or may not exist | ⚠ **Check before doing anything.** Re-issuing could refund twice |

**Owed but not refunded.** When a shop records a shortfall, the console proposes a refund for it
automatically. You either issue it or **dismiss it with a reason** — dismissing is not the harmless
half: deciding a customer is *not* owed money they paid for is exactly as consequential as paying
them, and nobody comes back to check it.

**Customer requests.** A shopper can now ask for a refund from their own order, in their own words,
attached to that order. Answer it by issuing a refund (which closes it automatically) or by declining
with a reason. There is no reply box — this is one statement and one outcome, not a conversation. ⚠ A
decline is **not emailed**; the shopper sees the outcome on their order.

**Cancelling.** A customer can cancel until a shop starts preparing. **You can cancel later** — right
up until the package leaves the shop — because a phone call arrives after their control has gone.
⚠ Cancelling **is** refunding: the money was captured at payment, so there is no "cancel before we
charge them".

**"Needs a refund decision"** in the list means a shop said it cannot supply its portion. It ranks
above handover and arrival because it is the only one where a customer is out of pocket while the
queue waits.

---

## What this console deliberately cannot do

No returns, no replacements, no editing an order. ⚠ **Effy cannot send a replacement** — there is no
mechanism and no way to create an order from here; if the customer wants the item rather than the
money, that is a manual conversation. Disputes and chargebacks are the bank's process, not this one.

---

## Known gaps

- **Recording arrivals is manual, and nothing chases you.** With no carrier signal, an order finishes
  only when somebody presses the button. The `OrderCompleted` metric (`Effy/Orders`) is how you can see
  whether that is actually happening.
- **A failed same-day delivery still strands its order.** If a driver could not hand a package over,
  the drop is marked failed but the package stays where it was and the customer is told nothing. That
  is the last remaining way an order gets stuck, and it needs its own slice.
- **The customer never sees a tracking reference.** Recorded here for you to chase a carrier on their
  behalf; deliberately not surfaced to them, because references are per-package and packages are
  per-shop — listing them would tell a customer how many shops served them.
