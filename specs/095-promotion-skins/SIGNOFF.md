# Sign-off notes: 095 — Promotion Skins

✅ **MIGRATED, DEPLOYED TO DEV AND SIGNED OFF BY THE OPERATOR, 2026-10-21** — operator-reported: *"ok seems
like all work! you can sign off this spec if needed"*, after creating a skin and choosing it for a promotion in a
display group through back-office.

⚠ T026 (release-day screenshots compared before/after) was **not recorded as a side-by-side comparison**; the
operator's check was that the site worked and looked right after the deploy. Nothing below was measured on dev
by Claude except the storefront's group read (it returns each promotion's `skin`, Classic by default).

## What shipped
- Migration `20261022090000_promotion_skins.sql` (skins, pictures, group size and defaults, member skin/picture,
  the `mega-nav` group, Classic + six starter skins).
- Back-office: Skins list and editor (live preview, readability check), a Pictures tab on a promotion, "How this
  place looks" and a per-promotion look on each display group.
- Website and customer app draw designed skins; Classic draws exactly what was there before 095.

## Found at deploy — both fixed
1. **The admin stack passed CloudFormation's 500-resource limit (533)** with 095's ten routes, and its deploy was
   refused before changing anything. All 32 promotion routes moved to a second stack from the same source,
   `admin/serverless.promotions.yml` → `make edge-deploy SERVICE=admin-promotions` (admin 373, admin-promotions
   163). ⚠ Deploy `admin` first: a route key may exist once per gateway.
2. **The website's home hero, offers and aisles menu failed to render (React error #441).** `isDesigned()` was
   exported from the `"use client"` `SkinnedPromotion.tsx` and CALLED by server components — a client module's
   export is a reference that throws on the server. Unit tests (one environment) and the build (never renders
   those sections) could not see it. Moved to `_components/skin-designed.ts`; a test holds
   `SkinnedPromotion.tsx` to exporting its component only.

## Still open
- The iOS build of the customer app was not compiled by Claude (Android host tests passed).
- Container tests (skins migration, group skin resolution) need Docker; not run here.
