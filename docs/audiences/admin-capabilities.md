# Back-office (admin) capabilities

The capability register for the **admin audience** — Effy back-office staff working in
`apps/back-office` over `apis/edge-api/admin`.

## Why this file exists

`docs/audiences/` held registers for **customer** and **shop** because each of those audiences has
**two surfaces kept at parity** (a web build and a mobile build), and a register is what stops them
drifting apart.

The admin audience has **one** surface, so there is no parity to police — which is why no register was
written. But the other purpose of these documents turned out to matter anyway: **recording what an
audience can do, and what it deliberately cannot.** Feature 031 was the first time that gap was felt,
when a task said "update the parity register" and there was nowhere to put it. Appending an admin
capability to the shop register would have been worse than having none.

⚠ **This is a capability register, not a parity register.** There is no second column, and adding one
would mean the platform had grown an admin mobile app — which is not planned.

---

## Earlier admin capabilities

Not retrofitted here. The back office also carries staff identity and RBAC (005/006), shop management
(009), the catalog schema (016), and the promotions console (027).
Each is documented in its own slice under `specs/`.
