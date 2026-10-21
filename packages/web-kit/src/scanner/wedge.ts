/**
 * 096 — handheld scanners that type like a keyboard ("keyboard wedge", research R13).
 *
 * A page cannot tell a scan from typing, so a scan is recognised by its SHAPE: a burst of printable keys,
 * each within `interKeyMs` of the last, ending in Enter or Tab or a short idle, whose text the screen
 * accepts (a label token, an order number). Slow typing never forms a burst. A stray key before the scan
 * is dropped (the gap resets the buffer), Caps Lock is forgiven (`EFY1:` tokens are upper-cased), and the
 * characters a burst typed into a focused text field are taken back out of it (FR-051).
 *
 * Pure, with the clock and the timer injected, so the rule is tested without a browser.
 */

export interface WedgeOptions {
  /** Whether a completed burst is something this screen reads. */
  accept: (text: string) => boolean
  /** Called once per recognised scan, with the normalised text. */
  onScan: (text: string) => void
  /** The longest gap between two keys of one scan. Scanners send a key every few ms. */
  interKeyMs?: number
  /** A scan with no Enter/Tab suffix ends after this much silence. */
  idleMs?: number
  /** The shortest text that can be a scan. */
  minLength?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface WedgeKey {
  key: string
  /** Milliseconds, monotonic (KeyboardEvent.timeStamp). */
  at: number
  /** The element the key went to, when it is an editable field. */
  field?: { value: string; set: (v: string) => void } | null
}

/** Upper-case an `EFY1:` token typed with Caps Lock on; anything else as read. */
export function normaliseScan(text: string): string {
  const t = text.trim()
  return /^efy1:/i.test(t) ? t.toUpperCase() : t
}

export function createWedge(opts: WedgeOptions) {
  const inter = opts.interKeyMs ?? 35
  const idle = opts.idleMs ?? 60
  const min = opts.minLength ?? 6
  const setT = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT = opts.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  let buffer = ""
  let last = -Infinity
  let timer: unknown = null
  let field: WedgeKey["field"] = null

  const reset = () => {
    buffer = ""
    field = null
    if (timer !== null) clearT(timer)
    timer = null
  }

  /** Finish the burst: a scan when the screen accepts it. Returns whether it was one. */
  const finish = (): boolean => {
    const text = normaliseScan(buffer)
    const leaked = field
    const typed = buffer
    reset()
    if (text.length < min || !opts.accept(text)) return false
    // Take the burst's characters back out of the field they were typed into.
    if (leaked && leaked.value.endsWith(typed)) leaked.set(leaked.value.slice(0, -typed.length))
    opts.onScan(text)
    return true
  }

  /**
   * Feed one key. Returns true when the key ended a scan and should be swallowed (preventDefault), so a
   * scanner's Enter never submits a form.
   */
  return function onKey(k: WedgeKey): boolean {
    if (k.key === "Enter" || k.key === "Tab") {
      if (buffer.length === 0) return false
      return finish()
    }
    if (k.key.length !== 1) return false // Shift, CapsLock, arrows… are not characters
    if (k.at - last > inter) {
      reset()
      field = k.field ?? null
    }
    last = k.at
    buffer += k.key
    if (timer !== null) clearT(timer)
    timer = setT(() => {
      timer = null
      finish()
    }, idle)
    return false
  }
}
