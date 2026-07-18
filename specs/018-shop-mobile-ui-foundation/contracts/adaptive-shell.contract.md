# Contract: Responsive Shop Shell

## Session gate

- `Restoring`, `SignedOut`, and `Refused` expose no shell content.
- Only `SignedIn(operator)` creates the shop shell.
- Session expiry swaps out the entire protected graph.
- Sign-out clears all tab stacks before leaving the shell.

## Primary destinations

Fixed order: Home, Catalog, Orders, Account.

Each item has:

- outlined/selected production vector icon;
- persistent visible label;
- merged role, label, and selected semantics;
- at least 48dp target;
- non-color selection indicator;
- no letter glyph fallback.

## Responsive policy

| Usable window | Navigation |
|---|---|
| width < 600dp | bottom bar |
| width ≥ 600dp | side rail |

Usable means the current app constraint after the owning horizontal safe-area treatment. Orientation and
resizing recompute the presentation live. The existing `TabBackStacks` instance is never replaced because
the navigation chrome changed.

## Insets

- The window background may draw behind system bars; status/navigation/home indicators stay visible.
- Top content, navigation controls, and interactive rows remain within safe drawing/gesture regions.
- Bottom navigation owns its bottom/navigation inset; side rail owns vertical/start system insets.
- Content consumes shell padding exactly once; no root+component double inset.
- Auth uses IME insets so the focused field and primary action stay reachable.

## Destination contract

- Home: operator/shop context and a small set of genuine actions; no metrics or cards.
- Catalog: polished placeholder only; no list/detail/new-product route.
- Orders: polished placeholder only; no invented order data/actions.
- Account: sectioned identity rows, appearance selector, sign-out.
- ManagerArea: visible only to manager-role UI courtesy; always calls backend-authoritative gate and renders
  checking/granted/uniform-denied without dashboard filler.

## Navigation behavior

- Switching tabs retains per-tab state.
- Re-select active tab pops it to its root.
- Back pops current tab; at tab root returns Home; at Home root delegates to the system.
- Repeated taps during transition cannot stack routes or corrupt selected state.
- No `CatalogProductRoute` can serialize, restore, or be pushed.

## Absence proof

Reachable semantics/text/routes contain none of the retired Catalog list, New product, product detail/Edit,
or bottom-sheet actions. Catalog domain/data presence does not count as reachability.
