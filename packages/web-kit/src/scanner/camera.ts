/**
 * 096 — reading labels with a camera (research R13): the native `BarcodeDetector` where the browser has
 * one (Chrome on Android, ChromeOS, macOS), otherwise the `barcode-detector` ponyfill over zxing-wasm,
 * which exposes the same API. Formats are limited to what an Effy label carries: QR and Code 128.
 *
 * ⚠ THE WASM IS SELF-HOSTED. It is imported as a Vite asset, so the build emits it beside the app and
 * nothing is fetched from a CDN at run time (the ponyfill's default is jsDelivr).
 */
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url"

type Detected = { rawValue: string }
interface Detector {
  detect(source: CanvasImageSource): Promise<Detected[]>
}

const FORMATS = ["qr_code", "code_128"]

let detector: Promise<Detector> | null = null

async function getDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector & { getSupportedFormats?: unknown } })
    .BarcodeDetector
  if (native) return new native({ formats: FORMATS })
  const mod = await import("barcode-detector/ponyfill")
  mod.prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  })
  return new mod.BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector
}

/** True where a camera can be asked for at all (a secure context with media devices). */
export function cameraAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}

/**
 * Start reading from the back camera into `video`. Each distinct value is reported once per
 * `repeatMs` (a label held in view is one read). Returns a stop function.
 */
export async function startCamera(video: HTMLVideoElement, onRead: (raw: string) => void, repeatMs = 2000): Promise<() => void> {
  detector ??= getDetector()
  const d = await detector
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
  video.srcObject = stream
  video.setAttribute("playsinline", "true")
  await video.play()
  let running = true
  const lastSeen = new Map<string, number>()
  const tick = async () => {
    if (!running) return
    try {
      if (video.readyState >= 2) {
        for (const r of await d.detect(video)) {
          const now = performance.now()
          if ((lastSeen.get(r.rawValue) ?? -Infinity) + repeatMs < now) {
            lastSeen.set(r.rawValue, now)
            onRead(r.rawValue)
          }
        }
      }
    } catch {
      // A frame that cannot be read is not an error; the next one is tried.
    }
    if (running) setTimeout(tick, 120)
  }
  void tick()
  return () => {
    running = false
    for (const t of stream.getTracks()) t.stop()
    video.srcObject = null
  }
}
