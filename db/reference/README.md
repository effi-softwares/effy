# Delivery reference data — Australian localities (`au-localities.csv`)

The place record for the delivery serviceability + zone-composition features (spec
`047-delivery-shipping-engine`). Loaded into `public.locality` by the operator command
`make load-localities ENV=dev` (idempotent upsert on the `(name, state, postcode)` triple).

## Columns

`postcode, locality, state, latitude, longitude, address_count`

- `latitude` / `longitude` may be blank (a locality with no G-NAF point) → stored NULL; such a locality
  does not contribute to a zone's ring suggestion.
- `address_count` lets the platform pick a postcode's **primary** locality (the most-addressed one) for
  display when a bare postcode is entered.

## ⚠ Provenance & licence (MUST travel with the data)

This dataset is **derived from the Geoscape Geocoded National Address File (G-NAF)**, released as
**Open G-NAF** under an End User Licence Agreement based on **Creative Commons Attribution 4.0
International (CC BY 4.0)**, via data.gov.au.

**Required attribution** (do not remove): *"Incorporates or developed using G-NAF © Geoscape
Australia."* The Open G-NAF use restriction applies: the data MUST NOT be used to generate or compile an
address for the sending of mail unless each address has been verified against a secondary source.

## ⚠ The committed file here is a SAMPLE, not the full dataset

The file in this repo is a small, representative sample (a handful of VIC localities that cover the
launch area, plus a few interstate rows) so the loader and the container-backed tests are runnable
without a large download. It is **not** whole-of-Australia coverage.

**To load the full dataset** (operator/data step): obtain a current G-NAF-derived
postcode/locality/state/lat-lng/address-count CSV — either a maintained open wrapper of Open G-NAF
(e.g. a `postcodes-au`-style release, MIT over the Open-G-NAF terms) or a direct re-derivation from the
Open G-NAF download on data.gov.au (~1.7 GB) — place it at `db/reference/au-localities.csv` (same
header), and run `make load-localities ENV=dev`. Whole-of-Australia is loaded even though only VIC /
Greater Melbourne is composed into served zones at launch (spec FR-012), so expanding coverage later is
composing new zones, not loading new data.
