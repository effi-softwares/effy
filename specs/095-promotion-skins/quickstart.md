# Quickstart: validating Promotion Skins (095)

## Before

- Dev migrated through the 095 migration (`AWS_PROFILE=ef make db-status ENV=dev`).
- `admin`, `storefront`, `commerce` deployed ([plan.md](plan.md#deploy-order)); back-office and customer-web built
  from this branch; the customer app built from this branch AND the 094 build kept for the compatibility check.
- Screenshots of Home, Offers, cart and the aisles menu on web and app taken BEFORE deploying (SC-002).

## Automated

```
pnpm --filter @effy/shared-types test         # validateSkin, skinContrast, geometry fixtures
pnpm --filter @effy/edge-admin test            # skins, pictures, group defaults, fits, conflicts, usage
pnpm --filter @effy/edge-storefront test       # resolved skin on the group read; picture fallback
pnpm --filter @effy/web-kit test               # <PromoSkin> per layout against the fixtures
make bo-test && make cw-test
(cd apps/customer-mobile && ./gradlew :shared:allTests)   # PromoSkin.kt against the same fixtures
```

Container tests: migration seeds (five skins pass contrast; every group has a fitting default), FK RESTRICT on skin
delete, `image_id` nulled when a picture is removed.

## Walk

1. **Nothing changed** - compare the BEFORE screenshots: identical on web and app (SC-002).
2. **Picture** - on a promotion, upload a wide and a square picture with descriptions; set a focus point (US1).
   Try a PDF and a 20 MB file: refused with a sentence.
3. **Build** - Skins → New → Full picture. Pick a pale headline colour on a weak tint: the pair fails and Save is
   refused, naming it (US2). Raise the tint: passes. Save as "Winter photo".
4. **Place** - put promotion A in `home-hero` wearing "Winter photo" and in `mega-nav` wearing "Tile - Effy blue"
   (US3). Try "Winter photo" in `mega-nav`: not offered (does not fit small).
5. **See it** - within a minute: website Home hero shows the photo skin; the aisles menu shows the tile; the app Home
   shows the photo skin; app in dark appearance shows the same colours (US4, US6).
6. **Copy code** - on a panel skin with a code, tap Copy code on web and app: copied, confirmed.
7. **Fallback** - remove the wide picture: the hero uses the square one; remove both: colour + decorations (FR-016).
8. **Change everywhere** - edit "Panel - Effy blue (code)": the editor names how many placements change; confirm;
   Offers updates within a minute. Open the same skin in two tabs, save both: the second is refused (FR-014).
9. **Remove** - try to delete a skin in use / a group default: refused with where it is used (FR-013).
10. **Old app** - the 094 app build shows promotions exactly as before (US7, SC-007).
11. **Readers** - VoiceOver/TalkBack on a promotion reads headline, supporting line, picture description, action.
12. **Shops** - shop-web order screens: nothing about skins or pictures (FR-024).
