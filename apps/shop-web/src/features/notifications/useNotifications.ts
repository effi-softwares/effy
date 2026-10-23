import { useCallback, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { track } from "@/lib/telemetry"

import {
  preferencesQuery,
  registerDevice,
  unregisterDevice,
  useSetMutedTypes,
} from "./api"
import {
  forgetToken,
  obtainToken,
  permissionState,
  pushSupport,
  requestPermission,
} from "./messaging"

/**
 * The console's notification state, as one screen needs to render it.
 *
 * Five states, and collapsing any two is how an operator concludes the feature is broken:
 *
 *  unsupported — this browser cannot do it. Nothing to offer; say so and stop.
 *  needs-install — iOS/iPadOS in a tab. The Push API exists only for a home-screen app there, so
 *  permission cannot even be requested. The remedy is installing, not a toggle.
 *  blocked — the operator denied it, and this is not recoverable in-app on any browser.
 *  Showing a toggle here teaches them the console is broken; the only honest
 *  thing is to name the situation and point at browser settings.
 *  off — permission not yet asked, or asked and no registration. Offer it.
 *  on — registered. Show the per-type toggles.
 */
export type NotificationStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on"

export interface NotificationsState {
  status: NotificationStatus
  fcmToken: string | null
  mutedTypes: string[]
  availableTypes: Array<{ type: string; label: string; group: string; requiresRole?: string }>
  busy: boolean
  /** Set when enabling was attempted and produced no token — see below. */
  hint: string | null
}

export function useNotifications() {
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>(() => permissionState())
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const support = pushSupport()
  const prefs = useQuery(preferencesQuery(fcmToken))
  const setMuted = useSetMutedTypes()

  // On mount, recover this browser's existing token without prompting — permission may already be
  // granted from a previous session, and re-asking is impossible anyway (there is one prompt ever).
  useEffect(() => {
    if (!support.supported || permission !== "granted") return
    let cancelled = false
    void obtainToken().then((t) => {
      if (!cancelled) setFcmToken(t)
    })
    return () => {
      cancelled = true
    }
  }, [support.supported, permission])

  const status: NotificationStatus = !support.supported
    ? support.reason === "needs-install"
      ? "needs-install"
      : "unsupported"
    : permission === "denied"
      ? "blocked"
      : permission === "granted" && fcmToken
        ? "on"
        : "off"

  /**
   * Turn notifications on for this device.
   *
   * Only ever called from a deliberate operator action. There is exactly one permission
   * prompt per browser per lifetime and a denial cannot be undone from inside the app, so it is
   * spent after the operator has been told what they would receive — never on load.
   */
  const enable = useCallback(async () => {
    setBusy(true)
    setHint(null)
    try {
      track({ name: "notif_permission_requested" })
      const result = await requestPermission()
      setPermission(result)
      track({ name: "notif_permission_result", result })
      if (result !== "granted") return

      const token = await obtainToken()
      if (!token) {
        // A documented iOS behaviour, not an error. On iOS the token is sometimes unobtainable
        // until Safari has been closed and reopened after permission is granted. We
        // cannot fix it from here; what we can do is say the true thing instead of "something went
        // wrong", which would send the operator looking for a fault that is not theirs.
        setHint(
          "Permission was granted, but this device has not finished registering. Close the app fully and open it again.",
        )
        return
      }
      setFcmToken(token)
      // NO `mutedTypes` in this call. Omitting the key preserves whatever this registration
      // already had; sending `[]` would clear the operator's choices every time they re-enabled.
      await registerDevice({ fcmToken: token, platform: "web" })
      track({ name: "notif_enabled" })
      await prefs.refetch()
    } finally {
      setBusy(false)
    }
  }, [prefs])

  /** Turn notifications off for this device. */
  const disable = useCallback(async () => {
    if (!fcmToken) return
    setBusy(true)
    try {
      await unregisterDevice(fcmToken)
      await forgetToken()
      setFcmToken(null)
      track({ name: "notif_disabled" })
      // The browser permission is deliberately not revoked — it cannot be, programmatically, and
      // the next operator on this shared tablet should not have to spend the one prompt again.
    } finally {
      setBusy(false)
    }
  }, [fcmToken])

  /** Mute or unmute one type on this device only. */
  const toggleType = useCallback(
    async (type: string, muted: boolean) => {
      if (!fcmToken) return
      const current = prefs.data?.mutedTypes ?? []
      const next = muted ? [...new Set([...current, type])] : current.filter((t) => t !== type)
      await setMuted.mutateAsync({ fcmToken, mutedTypes: next })
      track(muted ? { name: "notif_type_muted", type } : { name: "notif_type_unmuted", type })
    },
    [fcmToken, prefs.data?.mutedTypes, setMuted],
  )

  const state: NotificationsState = {
    status,
    fcmToken,
    mutedTypes: prefs.data?.mutedTypes ?? [],
    availableTypes: prefs.data?.availableTypes ?? [],
    busy: busy || setMuted.isPending,
    hint,
  }

  return { ...state, enable, disable, toggleType }
}
