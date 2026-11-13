# Contract: the toast API (`@effy/design-system/toast`)

The only way any web surface shows a toast. Also re-exported from `@effy/design-system/ui` for the consoles.

## Mounting

```tsx
import { Toaster } from "@effy/design-system/toast"

<Toaster position="top-center" sound={soundOn ? "on" : "off"} />    // shop-web  (components/console/ShopToaster.tsx)
<Toaster position="top-center" sound="on" />                         // back-office (routes/__root.tsx)
<Toaster position="bottom-center" sound="never" />                   // customer-web (StorefrontChrome.tsx)
```

- Exactly **one** `Toaster` per app. A second mounted Toaster logs a console error in development and renders nothing.
- `sound`: `"on" | "off" | "opt-in" | "never"` (research R4). Changing the prop applies to the next cue.
- Server-rendered: renders the viewport and the two live regions, empty; motion starts only in the browser.
- The app imports `@effy/design-system/toast.css` once (consoles get it through `console.css`).

## Showing

```ts
import { toast } from "@effy/design-system/toast"   // consoles may keep importing from "@effy/design-system/ui"

toast(title, options?)            // information (sonner-compatible default)
toast.info(title, options?)
toast.success(title, options?)
toast.error(title, options?)      // a failure: stays until closed, never replaced by a lesser message
toast.warning(title, options?)
toast.loading(title, options?)    // in progress: stays until changed
toast.message(title, options?)    // = toast.info (kept so existing call sites need no edit)
```

Each returns a **handle** (`string`): the caller key - `options.id` when given, otherwise a fresh one.

```ts
interface ToastOptions {
  description?: string
  action?: ToastButton
  secondary?: ToastButton
  progress?: number          // 0-1
  image?: string
  meta?: string
  duration?: number          // ms; 0 = until closed
  sound?: boolean            // ask for a cue under "opt-in"
  id?: string                // caller key
}
interface ToastButton {
  label: string
  /** Return a patch to change the toast in place (e.g. Undo → "Restored"); return nothing to close it. */
  onClick: () => void | ToastPatch
}
```

## Changing and closing

```ts
toast.update(handle, patch: ToastPatch)   // owner: in place · stale: only a failure gets through (R3)
toast.dismiss(handle?)                    // one, or whatever is visible and waiting when omitted

toast.promise(promise | () => promise, {
  loading: string,
  success: string | ((value) => string),
  error: string | ((error) => string),
}): Promise<T>                            // returns the same promise

interface ToastPatch {                    // every field optional; null removes it
  kind?: Kind; title?: string; description?: string | null
  action?: ToastButton | null; secondary?: ToastButton | null
  progress?: number | null; image?: string | null; meta?: string | null; duration?: number
}
```

## Guarantees (each is a test in `toast/store.test.ts`)

1. At most one toast is on screen.
2. A visible failure is never replaced by success, information, in progress or warning from another caller; the newest
   such message waits and is shown when the failure closes.
3. A caller that has lost the toast cannot change it, except to report a failure.
4. The same message again shows a count and restarts its time.
5. Lives: 5 s for success/info/warning without buttons; failure, in progress and any toast with a button stay; hover and
   focus pause; resume continues with what was left.
6. Every appearance and every change of words is announced once (failures assertively); progress-only changes are not.
7. No cue for in progress or progress-only changes; no cue at all under `never`; under `opt-in` only with `sound: true`.
8. With reduced motion: no spring is started.
9. A cue the browser blocks, or a missing audio context, never throws.

## Not offered

- Stacking several toasts, custom icons (sonner's `icon`), custom JSX content, positions per toast, rich colours per
  toast. Each kind has one look.

## Migration from today

| Today | Becomes |
|---|---|
| consoles: `import { toast, Toaster } from "@effy/design-system/ui"` | unchanged (re-export) |
| consoles: `<Toaster position="bottom-right" />` | add `sound` (above) |
| customer-web: `import { toast } from "@/lib/toast-store"` | `import { toast } from "@effy/design-system/toast"` |
| customer-web: `toast(msg)` (tone success by default) | `toast.success(msg)` |
| customer-web: `toast(msg, { tone: "error" })` | `toast.error(msg)` |
| customer-web: `action: { label, run }` | `action: { label, onClick }` |
| shop-web: `toast(msg, { icon })` (one site) | `toast(msg)` |
| `import { Toaster, toast } from "sonner"` (`NeedsYou.tsx`) | from `@effy/design-system/ui` |
