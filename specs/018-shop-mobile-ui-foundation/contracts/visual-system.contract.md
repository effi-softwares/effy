# Contract: Shop Mobile Visual System

## Theme source

- `packages/design-system/src/tokens.css` is the only authored token source.
- `compose-shop/EffyTokens.kt` is generated and never hand-edited.
- Generator changes regenerate customer/shop/driver outputs and pass the drift guard.
- No screen declares a hex color or app-local palette.

## Color use

- Background/surface/foreground/muted/border/input roles carry normal hierarchy.
- Emerald carries primary action, selected/focus, and brand meaning—not general decoration.
- Secondary/muted/accent carry lower-emphasis controls, selection surfaces, metadata, and interaction feedback.
- Terracotta/error carries destructive/critical meaning.
- Unsupported success/warning/info colors are not invented; icon/text/shape plus an existing neutral role
  communicates the state.
- Every Material color role requested by foundation components resolves to an Effy token; default purple or
  other library palette leakage is a failure.

## Typography, spacing, shape

- Nunito Sans regular/semibold/bold is self-hosted and supplies the app type scale.
- Generated `EffySpacing` establishes 4/8/12/16/20/40 rhythm; platform minimum control dimensions may be
  structural constants but visual padding/gaps use the scale.
- Generated radii establish standard shapes; pills use a full shape rather than an improvised numeric radius.
- No fixed-height container clips larger text.

## Motion

- Stable chrome; fade-through between peer tabs; directional transition only for hierarchy.
- Press/selection feedback begins immediately; normal transitions complete within the planned motion budget.
- State-driven animations are interruptible and contain no decorative infinite loop.
- Reduced motion removes translation/scale and retains immediate/non-motion feedback.

## Accessibility

- Minimum 48dp target; icon+label navigation merges into one node.
- Persistent labels, headings, roles, selected state, error semantics, logical focus order.
- No meaning by color, motion, icon fill, or position alone.
- Large text, grayscale, high contrast, TalkBack, VoiceOver, hardware keyboard, and switch navigation are
  validation postures.

## System UI

- Status bar and system navigation/home indicator are always visible.
- Effy background reaches the window edge; interactive content respects safe/IME regions.
- Icon contrast tracks resolved Light/Dark/System, including Effy forced opposite to OS appearance.
- Gesture and 3-button Android navigation both retain readable system affordances.
