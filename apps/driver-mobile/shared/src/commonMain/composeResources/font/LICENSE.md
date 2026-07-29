# General Sans — licence record

**Family**: General Sans
**Foundry**: Indian Type Foundry (ITF)
**Designer**: Frode Helland
**Copyright**: Copyright 2017–2021 Indian Type Foundry. All rights reserved.
**Trademark**: "General" is a trademark of the Indian Type Foundry.
**Full terms**: <https://fontshare.com/terms>
**Source**: <https://www.fontshare.com/fonts/general-sans>

## ⚠ The download ships no licence file

Fontshare's desktop package (`general-sans.zip`, 12 × OTF) contains **font files only** — no LICENCE,
no README. Everything below is transcribed from the fonts' own `name` and `OS/2` tables, which is the
only licence statement that travelled with the files. **It is a record, not the licence itself** — the
authoritative terms live at the URL above and should be read before any public release.

## Embedded licence statement (`name` ID 13)

> This Font Software is protected under domestic and international trademark and copyright law. You
> agree to identify the ITF fonts by name and credit the ITF's ownership of the trademarks and
> copyrights in any design or production credits.

## ⚠ ATTRIBUTION IS REQUIRED

That statement is not a formality: it obliges the product to **name the font and credit ITF's
ownership in any design or production credits**. Effy therefore needs a place where that credit lives
— a Legal/Credits entry on the web storefront and in the mobile app's account area — before the
typeface ships publicly. Tracked as spec 026 **FR-008 / SC-018**.

## Embedding permission

`OS/2.fsType = 0` — **Installable Embedding, no restriction**. This is the permissive value: the
foundry places no bit-level restriction on embedding the font in applications or documents, which
covers both the web `@font-face` route and bundling inside the Android/iOS apps.

## What is committed here, and why it differs from the download

Fontshare ships **CFF/PostScript OTF** only. Two derivations are committed:

| Committed | Format | Operation |
|---|---|---|
| `general_sans_{regular,medium,semibold}.ttf` | TrueType (`glyf`) | **Real conversion** — cubic → quadratic curves via the maintained `otf2ttf`. |
| `../../src/fonts/general_sans_*.woff2` | WOFF2 (CFF retained) | **Lossless repackage** — WOFF2 carries CFF outlines natively. |

Only three of the twelve shipped weights are used: **Regular 400, Medium 500, Semibold 600**. The
design language never uses Bold 700, and no italic is used.

Verified after conversion: `usWeightClass` 400/500/600, `unitsPerEm` 1000, 436 glyphs, 384 cmap
entries, full Latin + punctuation + currency coverage.
