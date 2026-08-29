# `infra/observability/` — alerting rules, ahead of the stack that will run them

⚠ **NOTHING IN THIS DIRECTORY IS DEPLOYED, AND NOTHING LOADS IT YET.**

## What is actually true today

[ARCHITECTURE.md](../../ARCHITECTURE.md) describes Prometheus and Grafana running self-hosted on
ECS/Fargate, scraping the hot path's `/metrics` endpoint and driving dashboards and alerts.

**That stack does not exist.** There is no Prometheus module, no Grafana module, and no scrape
config anywhere in `infra/`. `apis/core-api` genuinely exposes `/metrics` in Prometheus exposition
format — but nothing reads it, and `core-api` has no cloud deployment either, so today the endpoint
is reachable only from a laptop.

⚠ **This is a pre-existing platform gap, not one feature 032 introduced.** It is recorded here rather
than in a slice's notes because it will otherwise be rediscovered by every future feature that adds
a counter and then looks for somewhere to alert on it.

## Why the rules are committed anyway

An alert nobody wrote down is an alert nobody will write. These files are the **specification** of
what must fire, in the format the eventual stack consumes, so that standing the stack up is a wiring
task rather than an archaeology task. They are reviewable now; they are inert now.

⚠ **Do not read a file here as evidence that anything is being watched.** Until an observability
slice provisions Prometheus and points it at these rules, every threshold below is documentation.

## Files

| File | Feature | Status |
|---|---|---|
| `alerts/032-delivery-pricing.yml` | 032 — delivery pricing & same-day | ⚠ written, not loaded |
| `alerts/054-product-inventory.yml` | 054 — product inventory (oversell) | ⚠ written, not loaded |
| `alerts/055-refunds-cancellation.yml` | 055 — refunds failing, and refunds that never settle | ⚠ written, not loaded |
