import { Camera, CameraOff, ScanLine } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { Button, Input } from "@effy/design-system/ui"

import { cameraAvailable, startCamera } from "./camera"
import { createWedge } from "./wedge"

export type ScanMethod = "scan" | "typed"

export interface ScanFieldProps {
  /** Which texts this screen reads: a keyboard burst that fails this is ordinary typing. */
  accept: (text: string) => boolean
  /** One read: from a handheld scanner or the camera (`scan`), or typed and submitted (`typed`). */
  onRead: (read: { raw: string; method: ScanMethod }) => void
  /** Listen for a handheld scanner anywhere on the page, not only in this field (default true). */
  listenGlobally?: boolean
  /** Offer the device's camera (default true where one can be used). */
  camera?: boolean
  placeholder?: string
  /** The field's accessible name. */
  label?: string
  /** Larger type, for a station used at arm's length (the hub). */
  size?: "default" | "large"
  disabled?: boolean
}

/** Set a React-controlled input's value the way a person would, so its onChange sees it. */
function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

/** How a web console reads a label: a handheld scanner anywhere on the page, the camera, or a typed code, judged by `judgeRead`. */
export function ScanField({
  accept,
  onRead,
  listenGlobally = true,
  camera = true,
  placeholder = "Scan a label, or type its code",
  label = "Scan or type a code",
  size = "default",
  disabled = false,
}: ScanFieldProps) {
  const [typed, setTyped] = useState("")
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const latest = useRef({ accept, onRead })
  latest.current = { accept, onRead }

  useEffect(() => {
    if (!listenGlobally || disabled) return
    const onKey = createWedge({
      accept: (t) => latest.current.accept(t),
      onScan: (raw) => latest.current.onRead({ raw, method: "scan" }),
    })
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const editable = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ? t : null
      const consumed = onKey({
        key: e.key,
        at: e.timeStamp,
        field: editable ? { value: editable.value, set: (v) => setFieldValue(editable, v) } : null,
      })
      if (consumed) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [listenGlobally, disabled])

  useEffect(() => {
    if (!cameraOn || !video.current) return
    let stop: (() => void) | null = null
    let cancelled = false
    startCamera(video.current, (raw) => latest.current.onRead({ raw, method: "scan" }))
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => {
        setCameraError("The camera could not be started. Allow camera access for this site, or use a scanner.")
        setCameraOn(false)
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [cameraOn])

  function submit(e: FormEvent) {
    e.preventDefault()
    const raw = typed.trim()
    if (!raw) return
    onRead({ raw, method: "typed" })
    setTyped("")
  }

  const big = size === "large"
  return (
    <div className="grid gap-2">
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <ScanLine aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label={label}
            value={typed}
            disabled={disabled}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className={big ? "h-12 pl-9 font-mono text-lg" : "pl-9 font-mono"}
          />
        </div>
        <Button type="submit" variant="outline" disabled={disabled || typed.trim() === ""} className={big ? "h-12" : undefined}>
          Add
        </Button>
        {camera && cameraAvailable() ? (
          <Button
            type="button"
            variant="outline"
            aria-pressed={cameraOn}
            aria-label={cameraOn ? "Stop the camera" : "Use the camera"}
            disabled={disabled}
            onClick={() => {
              setCameraError(null)
              setCameraOn((v) => !v)
            }}
            className={big ? "h-12" : undefined}
          >
            {cameraOn ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
          </Button>
        ) : null}
      </form>
      {cameraOn ? (
        <video ref={video} muted className="border-border aspect-video w-full max-w-md rounded-[var(--radius)] border bg-black object-cover" />
      ) : null}
      {cameraError ? <p className="text-destructive text-xs">{cameraError}</p> : null}
    </div>
  )
}
