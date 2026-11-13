# Contract: the Effy sound set (`@effy/design-system/toast`, `sound.ts`)

The platform's **one** place that makes a sound in a web app. Replaces `apps/shop-web/src/lib/chime.ts`.

```ts
type Cue = "success" | "error" | "warning" | "info" | "new-order"

playCue(cue: Cue): void                 // silent no-op if audio is missing, closed or still locked; never throws
previewCue(cue: Cue): void              // on a click: unlocks, then plays (the settings page's "Play")
unlockAudio(): void                     // resume the context (call from a click or key press)
unlockOnFirstGesture(): () => void      // listens for the first pointer/key press; returns the cleanup
subscribeAudio(listener: (ready: boolean) => void): () => void
audioReady(): boolean
```

- One `AudioContext` for the page, created on first use.
- `new-order` is the existing chime, unchanged in pitch, timing and loudness (FR-019).
- The Toaster calls `playCue(kind)` itself according to its `sound` policy; apps call `playCue("new-order")` (the
  new-order banner), `playCue("success")` (back-office scan box: a found label opens its order with no toast) and
  `previewCue` (settings) directly.

## shop-web wiring after the move

| Today (`@/lib/chime`) | After |
|---|---|
| `playChime()` in `NewOrderAlert.tsx` | `playCue("new-order")` |
| `previewChime()` in `NotificationSettings.tsx` | `previewCue("new-order")` |
| `unlockAudio`, `unlockOnFirstGesture` in `SoundChip.tsx` | same names, from `@effy/design-system/toast` |
| `setAudioReady` fed by the context's `statechange` | `consoleStore.audioReady` fed by `subscribeAudio` (once, in `SoundChip`'s effect) |
