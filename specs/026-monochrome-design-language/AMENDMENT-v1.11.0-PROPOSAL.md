# Constitution Amendment Proposal — v1.10.0 → v1.11.0

**Status**: ⚠ **PROPOSAL ONLY — NOT APPLIED.** `.specify/memory/constitution.md` is untouched and
still reads v1.10.0. This file exists so task **T004** is a review-and-accept rather than a
write-from-scratch. Applying it is the operator's decision (Principle I).

**Feature**: 026-monochrome-design-language · **Bump**: MINOR · **Date**: 2026-07-29

---

## What changes

Exactly one bullet of **Principle V**, plus the version footer and a new sync-impact block. Nothing
else in the constitution is touched.

### Before (v1.10.0, lines 277–281)

```
- Brand color is Effy Emerald — accent `#065f46` (emerald-800) with a white label in both modes, over
  neutral-scale surfaces (no brand tint), with a terracotta accent `#d0735a`. The full token set —
  this palette (light + dark), the Nunito Sans typeface, and the spacing + radius scales — comes from the
  design-system package (the SSOT), never hardcoded per surface. (Superseded Jade `#0FB57E` / fill
  `#047857` as of v1.10.0.)
```

### After (proposed v1.11.0)

```
- The brand is MONOCHROME: a ten-step neutral ramp from `#1A1A1A` to `#FFFFFF`, in which the accent
  role is carried by the ramp itself and there is NO brand hue. The accent INVERTS between
  appearances — near-black `#1A1A1A` on light, near-white `#F5F5F5` on dark, each with the opposite
  as its label. (A neutral accent cannot hold one value across both appearances the way a hue can:
  near-black on a near-black ground is invisible.)
- Exactly TWO semantic colours exist alongside the ramp: error/destructive `#e01010` and success
  `#0C9409`. Neither may be used decoratively or as an accent; success is a NON-TEXT indicator only
  (it measures 4.00:1 on white — above the 3:1 bar for UI components, below the 4.5:1 bar for text).
  No third hue may be introduced. The single exception is a third-party sign-in mark whose provider's
  brand guidelines require its own colours; that is an asset, not a token.
- The full token set — this ramp (light + dark), the two semantic colours, the General Sans typeface,
  and the spacing + radius scales — comes from the design-system package (the SSOT), never hardcoded
  per surface.
- RETIRED: Effy Emerald `#065f46` + terracotta `#d0735a` (as of v1.11.0), and Jade `#0FB57E` / fill
  `#047857` (as of v1.10.0). Both are swept out of live source by `scripts/check-no-emerald.sh` and
  `scripts/check-no-jade.sh`.
```

### Footer

```
**Version**: 1.11.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-07-29
```

---

## Why MINOR, not MAJOR

The same reasoning v1.10.0 used when it retired Jade:

- **No principle is added or removed.** Principle V keeps its design-system-SSOT rule, its
  dark-mode-REQUIRED-and-user-selectable rule, its native-feel rule, its **touch-target and
  micro-animation requirements**, its reference-platform doctrine, and its **no-card doctrine**. All
  remain binding and unedited.
- **No committed plan's structure is invalidated.** Every surface still consumes the one
  design-system package; only the brand VALUES change.
- **No surface is left non-compliant.** Feature 026 rebrands all six in the same slice, exactly as
  017 did.

## What is genuinely new versus v1.10.0

Two things the previous amendment did not have to say, and which are load-bearing:

1. **The accent inverts between appearances.** Emerald never needed this rule because a hue reads
   against both grounds. Stating it in the constitution prevents a future contributor "simplifying"
   the theme back to a single accent value and making every primary button vanish in one mode.
2. **The palette is bounded at two semantic hues.** Without this, "monochrome" erodes one
   well-intentioned status colour at a time.

## Dependent updates required when this is applied

- ✅ `packages/design-system/src/tokens.css` + its `package.json` description — feature 026 tasks
  T014/T014a/T015/T017.
- ✅ `CLAUDE.md` § Design system — currently states Effy Emerald + Nunito Sans.
- ✅ `packages/brand` — colourway axis becomes polarity (T033–T035).
- ✅ `scripts/check-no-emerald.sh` — **already written and proved** (T006–T009).
- ⏳ Historical notes in `CLAUDE.md` for features 005/017/024 are retained as history, not rewritten.

## To apply

Edit `.specify/memory/constitution.md`: replace the Principle V brand bullet with the "After" block,
update the version footer, and prepend a sync-impact report in the established format. Then check off
**T004** in [tasks.md](tasks.md).
