# Order Console — operator guide

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

---

## Reading the list

**Next step** is the working column:

- **Needs handover** — collected, standard, not yet handed over. Your queue.
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

## What this console deliberately cannot do

No refunds, no cancellations, no returns, no editing an order, no re-sending the receipt. None of it
is built yet — the routes do not exist, so no button can appear here without a spec first.

If a customer is owed money, that is still a manual conversation. The **Feedback** console is where
their message lands.

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
