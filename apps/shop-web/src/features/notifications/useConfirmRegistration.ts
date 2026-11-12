import { useEffect } from "react"

import { registerDevice } from "./api"
import { obtainToken, permissionState, pushSupport } from "./messaging"

/** Once per page load: the console is opened far less often than it re-renders. */
let confirmed = false

/**
 * 113 FR-020: each time the console opens on a device that has notifications on, it confirms its registration, which
 * refreshes when it was last seen. A registration nobody confirms for 270 days is removed by the daily purge, so a
 * device that stopped using the console stops being sent to. Sends no mutedTypes, so the device's choices are kept.
 * Silent: it never asks for permission and never shows an error.
 */
export function useConfirmRegistration(): void {
  useEffect(() => {
    if (confirmed) return
    if (!pushSupport().supported || permissionState() !== "granted") return
    confirmed = true
    void obtainToken()
      .then((token) => (token ? registerDevice({ fcmToken: token, platform: "web" }) : undefined))
      .catch(() => {
        // Tried again on the next page load.
        confirmed = false
      })
  }, [])
}

/** Tests only. */
export function resetConfirmedRegistration(): void {
  confirmed = false
}
