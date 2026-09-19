import { useEffect, useState } from "react"
import { useStore } from "@tanstack/react-store"
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import {
  dismissInstall,
  installStore,
  isIosSafari,
  promptInstall,
} from "@/lib/install"
import { onlineStore } from "@/lib/online"
import { applyUpdate, pwaStore } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

/**
 * The three pieces of chrome 059 adds to the shell: offline, update-ready, and install (US2/US5).
 *
 * ⚠ ONE STRIP, ONE AT A TIME, IN THAT ORDER OF URGENCY. Three stacked banners would push the
 * console's content down by a third of a tablet's height, which is the screen an operator is trying
 * to read. Offline outranks the rest because it changes what the operator can believe about
 * everything below it; an install suggestion can wait.
 *
 * ⚠ NO CARDS (Principle V). These are full-width notices on the page's own rules, not floating
 * panels — the console's language for "something about this whole screen".
 */
export function PwaBanners() {
  const { updateReady } = useStore(pwaStore)
  const { online } = useStore(onlineStore)
  const { method } = useStore(installStore)

  if (!online) return <OfflineBanner />
  if (updateReady) return <UpdateBanner />
  if (method !== "none") return <InstallBanner method={method} />
  return null
}

function Strip({
  tone,
  icon,
  children,
}: {
  tone: "warning" | "brand"
  icon: React.ReactNode
  children: React.ReactNode
}) {
  // ⚠ Written on the semantic's own `-soft` tint, never as a fill with a label on it. `--warning`
  // deliberately has no `-foreground` pair and `check-tokens.mjs` enforces that absence.
  const toneClass =
    tone === "warning"
      ? "bg-[var(--warning-soft)] text-[var(--warning)]"
      : "bg-[var(--brand-soft)] text-[var(--brand-ink)]"
  return (
    <div
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] ${toneClass}`}
      role="status"
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  )
}

/**
 * FR-033 — offline is said plainly, and distinguishably from any other error.
 *
 * ⚠ It does NOT say "retry". There is nothing to retry: the console recovers on its own when the
 * network returns (FR-037), and offering a button that does nothing an operator can see teaches
 * them the console is broken.
 */
function OfflineBanner() {
  return (
    <Strip tone="warning" icon={<WifiOff className="size-4" />}>
      <span className="font-medium">You are offline.</span>
      <span className="opacity-90">
        Everything below was last loaded while you were connected. Changes cannot be saved until the
        connection returns.
      </span>
    </Strip>
  )
}

/** FR-009/FR-010 — a new version is waiting, and the operator decides when it lands. */
function UpdateBanner() {
  return (
    <Strip tone="brand" icon={<RefreshCw className="size-4" />}>
      <span className="font-medium">A new version of the console is ready.</span>
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        onClick={() => {
          track({ name: "sw_update_applied" })
          applyUpdate()
        }}
      >
        Reload
      </Button>
    </Strip>
  )
}

/**
 * FR-001/FR-006 — install, on the two platforms that do it differently.
 *
 * ⚠ The iOS branch is not a fallback for a missing API, it is the ONLY route on iPadOS — which is
 * also the only platform where the Push API requires a home-screen app. An operator who never sees
 * these instructions cannot be asked for notification permission at all.
 */
function InstallBanner({ method }: { method: "prompt" | "ios-manual" }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    track({ name: "pwa_install_prompted", method })
  }, [method])

  return (
    <Strip tone="brand" icon={<Download className="size-4" />}>
      {method === "prompt" ? (
        <>
          <span className="font-medium">Install Effy Shop on this device</span>
          <span className="opacity-90">
            Open it from the home screen, and receive notifications when new orders arrive.
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const accepted = await promptInstall()
                setBusy(false)
                if (accepted) track({ name: "pwa_installed" })
              }}
            >
              Install
            </Button>
            <DismissButton />
          </div>
        </>
      ) : (
        <>
          <span className="font-medium">Add Effy Shop to your home screen</span>
          {/* ⚠ Named steps, not "install this app". On iPadOS there is no install API and no prompt
              to fire — the operator has to find Share → Add to Home Screen themselves, and a vague
              instruction is the same as none. */}
          <span className="inline-flex items-center gap-1 opacity-90">
            Tap <Share className="inline size-3.5" aria-label="Share" /> Share, then
            <span className="font-medium">Add to Home Screen</span>. Notifications need this.
          </span>
          <div className="ml-auto">
            <DismissButton />
          </div>
        </>
      )}
    </Strip>
  )
}

/** FR-006 — asked once, not on every visit. */
function DismissButton() {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Dismiss"
      onClick={() => dismissInstall()}
      className="size-8 p-0"
    >
      <X className="size-4" />
    </Button>
  )
}

/** Exported for the test that asserts the iOS branch is chosen by platform, not by absence. */
export const __testables = { isIosSafari }
