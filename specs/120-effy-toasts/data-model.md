# Data Model: Effy's Own Toasts (120)

Nothing is stored on a server, in a database or in the browser by this feature. These are the in-memory shapes of the
toast core (`packages/design-system/src/toast/`). The one persisted value it reads, the shop console's Sound setting,
already exists (`effy-shop.sound` in `localStorage`, `apps/shop-web/src/lib/console-store.ts`) and is unchanged.

## Kind

`"success" | "error" | "warning" | "info" | "loading"`

| Kind | Rank (R3) | Mark | Colour token | Lives | Cue (R4) | Live region |
|---|---|---|---|---|---|---|
| success | 1 | tick | `--success` | 5 s | rising | polite |
| info | 1 | i | `--primary` | 5 s | one note | polite |
| loading (in progress) | 1 | spinning ring | `--primary` | until changed | none | polite |
| warning | 2 | ! | `--warning` | 5 s | double tap | polite |
| error (failure) | 3 | cross | `--destructive` | until closed | falling | assertive |

A toast with any button lives until closed whatever its kind. A caller's `duration` overrides (`0` = until closed).

## Message (what a caller asks for)

| Field | Type | Rule |
|---|---|---|
| kind | Kind | required |
| title | string | required, non-empty; shown in full (wraps) |
| description | string? | second line |
| action | `{ label, onClick }`? | main button; `onClick` may return a **Patch** to change the toast in place, else it closes |
| secondary | `{ label, onClick }`? | quieter button; same rule |
| progress | number 0-1? | thin bar; progress-only changes are silent and unannounced |
| image | string (URL)? | round picture in place of the mark |
| meta | string? | short trailing note ("now") |
| duration | number ms? | overrides the kind's life |
| sound | boolean? | asks for a cue under an `opt-in` policy; ignored under `never` |
| id | string? | the **caller key**: repeated calls with one id are one caller (sonner-compatible) |

## Toast (what is on screen)

| Field | Notes |
|---|---|
| key | stable for the life of the on-screen toast (React key, motion state) |
| message | the current Message |
| owner | the caller key allowed to change it in place (R3) |
| count | repeat count, starts at 1 (FR-009) |
| phase | `entering → open → closing → gone` |
| life | `{ total, remaining, startedAt, paused }`; `total = 0` means sticky |

## Toaster state

| Field | Notes |
|---|---|
| visible | `Toast | null` - at most one (FR-007) |
| waiting | `Message + caller | null` - the newest lesser message held behind a failure |
| callers | `Map<callerKey, "owner" | "waiting" | "stale">` - who may still change what |
| position | `bottom-right | bottom-center` (and the other four, unused) |
| sound | `on | off | opt-in | never` |
| liveText | `{ polite, assertive }` - what the two regions say |

## Transitions (R3)

```text
show(msg, caller)
  visible = null                         -> visible = new Toast(msg), owner = caller           [announce, cue]
  same kind+title+description, no buttons-> visible.count++, life restarted                     [announce again]
  visible.kind = error, rank(msg) < 3    -> waiting = (msg, caller); earlier waiting caller = stale
  otherwise                              -> visible.message = msg in place, owner = caller,
                                            previous owner = stale                              [announce, cue]

update(caller, patch)
  caller = owner                         -> apply in place                                      [announce unless progress-only]
  caller = waiting                       -> change the waiting message
  caller = stale, patch.kind = error     -> show(patched msg, caller)
  caller = stale, otherwise              -> dropped

dismiss(caller?) / Escape / close / swipe / life ran out
  visible -> closing -> gone; then if waiting: show(waiting) with full life

pointer over / focus in                  -> pause life;  leave -> resume with remaining
```

## Arrival (phase 2, per app)

| Field | Notes |
|---|---|
| highWater | ISO time of the newest inbox item seen by the arrival hook; set on first read |
| excludedTypes | shop: `shop_new_order`; customer: none |
| onInbox | true when the current route is the inbox page |

From the inbox's first page (`InboxPageDTO`, unchanged): items with `createdAt > highWater`, `readAt = null`, type not
excluded, destination not the current page. One → a toast naming it; several → "N new notifications".
