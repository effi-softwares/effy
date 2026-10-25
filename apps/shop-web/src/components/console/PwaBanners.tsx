import { useEffect, useState } from "react"
import { useStore } from "@tanstack/react-store"
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { dismissInstall, installStore, promptInstall } from "@/lib/install"
import { onlineStore } from "@/lib/online"
import { applyUpdate, pwaStore } from "@/lib/pwa"
import { track } from "@/lib/telemetry"

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
  return (
    <div
      className={`flex min-h-12 items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm text-foreground ${tone === "warning" ? "font-medium" : ""}`}
      role="status"
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  )
}

function OfflineBanner() {
  return (
    <Strip tone="warning" icon={<WifiOff className="size-4" />}>
      <span className="font-medium">You are offline.</span>
      <span className="opacity-90">
        Everything below was last loaded while you were connected. Changes cannot be saved until the connection returns.
      </span>
    </Strip>
  )
}

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
          <span className="inline-flex items-center gap-1 opacity-90">
            Tap <Share className="inline size-4" aria-label="Share" /> Share, then
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

function DismissButton() {
  return (
    <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={() => dismissInstall()}>
      <X className="size-4" />
    </Button>
  )
}
