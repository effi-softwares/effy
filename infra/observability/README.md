# `infra/observability/` — where the platform's alarms actually are

**Alarms live in Terraform**, beside the infrastructure they watch, and are delivered to the alerts
topic (`aws_sns_topic.alerts`, `infra/envs/<env>/alerts.tf`) whose subscriber is the operator's
approved operational mailbox.

| File | Watches |
|---|---|
| `infra/envs/<env>/commerce-alarms.tf` | delivery quotes, stock at checkout, refunds (submission, bank rejection, stuck), same-day slots over capacity, payment-provider notifications |
| `infra/envs/<env>/dispatch.tf` | wave planning and custody |
| `infra/envs/<env>/catalog-review.tf` | products waiting on review |
| `infra/envs/<env>/dns.tf` | certificates and mail deliverability |
| `infra/envs/<env>/edge-gateway.tf` | **a server error on any route of any service** — the one "a route is failing" alarm |
| a service's `serverless.yml` (`resources:`) | only what the gateway cannot see: a function run by a schedule, queue or topic, or a failure that is not a 5xx |

Metrics are **CloudWatch metrics**. Backend services emit them in embedded metric format through one
helper (`apis/edge-api/shared/src/lib/metrics.ts`); nothing is scraped and nothing runs to collect them.

## What used to be here, and why it is gone

Until feature 070 this directory held four Prometheus alerting-rule files (`alerts/032…`, `054…`,
`055…`, `069…`) and a README explaining that **nothing loaded them**: the platform's documents
described a Prometheus + Grafana stack self-hosted on ECS, and that stack was never built. The
rules were specification, not monitoring — every threshold in them was documentation.

070 retired the always-on backend those rules were written against and replaced them with the
alarms in `commerce-alarms.tf`, which run. The constitution (v3.0.0, Principle VII) now names
CloudWatch metrics and alarms as the standard.

⚠ **An alarm with no action is not an alarm.** Until 2026-10-05 the `admin`, `shop` and `fleet`
services declared 78 per-function error alarms, and the gateway one more, none of which notified
anyone — about $8 a month to turn red in a console nobody watched. The 78 are deleted and the
gateway alarm is wired. Every alarm carries `alarm_actions` / `AlarmActions`, or it is not added.

⚠ **Adding a counter is not adding an alarm.** A metric nobody alarms on is a number in a console
nobody is looking at. When a feature adds a signal that should reach a person, it adds the alarm in
the same change — and proves delivery once (`aws cloudwatch set-alarm-state`), because an alarm
with a dead notification path is the defect 037 was written to fix.
