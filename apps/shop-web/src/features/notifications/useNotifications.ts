import { useCallback, useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { track } from "@/lib/telemetry"

import { preferencesQuery, registerDevice, unregisterDevice, useSetMutedTypes } from "./api"
import { forgetToken, obtainToken, permissionState, pushSupport, requestPermission } from "./messaging"

type NotificationStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on"

interface NotificationsState {
  status: NotificationStatus
  fcmToken: string | null
  mutedTypes: string[]
  availableTypes: Array<{ type: string; label: string; group: string; requiresRole?: string }>
  busy: boolean
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
        setHint(
          "Permission was granted, but this device has not finished registering. Close the app fully and open it again.",
        )
        return
      }
      setFcmToken(token)
      await registerDevice({ fcmToken: token, platform: "web" })
      track({ name: "notif_enabled" })
      await prefs.refetch()
    } finally {
      setBusy(false)
    }
  }, [prefs])

  const disable = useCallback(async () => {
    if (!fcmToken) return
    setBusy(true)
    try {
      await unregisterDevice(fcmToken)
      await forgetToken()
      setFcmToken(null)
      track({ name: "notif_disabled" })
    } finally {
      setBusy(false)
    }
  }, [fcmToken])

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
