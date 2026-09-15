import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { getAccessToken, openLiveStream } from "@effy/web-kit"

import { config } from "@/lib/env"

import { TODAY_KEY } from "./queries"

/**
 * Keep Today live (058, US2/FR-028).
 *
 * ⚠ THE STREAM CARRIES NO DATA, SO THIS HOOK STORES NONE. Every event means one thing — "refetch" —
 * and the refetch goes through the same cold-path query the screen already uses. That is what makes
 * the two modes indistinguishable to the UI (FR-028): live and polling differ only in WHEN the same
 * query runs, never in what it returns or how the screen renders it.
 *
 * ⚠ ON EVERY (RE)CONNECT WE REFETCH, rather than resuming. A reconnect means we were blind for some
 * interval, and PostgreSQL's NOTIFY is not durable — whatever happened while the listener was away
 * is simply gone. "Rebuild from stored state" is the only honest response; assuming continuity is
 * the failure the brief calls out by name.
 *
 * ⚠ POKES ARE DEBOUNCED. A van-load checked in at the hub is a burst of transactions; the server
 * throttles per shop and this coalesces whatever still arrives together, so a burst costs one read.
 *
 * ⚠ EVERYTHING IS TORN DOWN ON UNMOUNT (FR-029): the stream, its reconnect timer and the debounce.
 */
export function useShopLive(): { connected: boolean } {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const invalidateSoon = () => {
      if (debounce.current !== null) clearTimeout(debounce.current)
      debounce.current = setTimeout(() => {
        debounce.current = null
        void queryClient.invalidateQueries({ queryKey: TODAY_KEY })
      }, 400)
    }

    const stop = openLiveStream({
      url: `${config.coreApiBaseUrl()}/v1/shop/live`,
      getToken: () => getAccessToken(),
      onOpen: () => {
        setConnected(true)
        // A fresh connection knows nothing about the gap it just crossed.
        invalidateSoon()
      },
      onClose: () => setConnected(false),
      // `poke` and `resync` mean the same thing to a client that holds no state: read again.
      onEvent: () => invalidateSoon(),
    })

    return () => {
      stop()
      if (debounce.current !== null) clearTimeout(debounce.current)
      setConnected(false)
    }
  }, [queryClient])

  return { connected }
}
