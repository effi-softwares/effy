# Delivery review (2026-10-18)

What Effy's delivery system is today, how the industry does it, what to change, and in what order.

| File | What it is |
|---|---|
| [01-system-index.md](01-system-index.md) | What we built: the delivery engine, driver operations, driver app, consoles and customer surfaces, mapped to code |
| [02-industry-research.md](02-industry-research.md) | How major delivery platforms and last-mile SaaS work; standards, AU couriers, NSW compliance, buy vs build |
| [03-gap-analysis.md](03-gap-analysis.md) | Comparison: missing, wrong, improve, simplify, remove, and the changes to make |
| [04-backlog.md](04-backlog.md) | The short backlog to a correct delivery system (NOW / NEXT / LATER) |
| [maps/](maps/) | The four detailed code maps behind 01 (file:line, routes, tables) |

Method: five parallel read-only passes over the code on `dev` @ `f9118e04` (delivery engine; driver
operations backend; driver app; back-office + shop + customer surfaces; web research). Claims are from
reading source; nothing was run against a database or a device. Where a finding needs confirming on
dev (e.g. Stripe behaviour, data loaded into `locality`) it says so.
