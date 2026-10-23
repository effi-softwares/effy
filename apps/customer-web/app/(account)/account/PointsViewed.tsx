"use client"

import { useEffect } from "react"

import { capture } from "@/lib/telemetry"

/** `points_viewed`, once per visit to the tab. No amounts. */
export function PointsViewed() {
  useEffect(() => {
    capture({ name: "points_viewed" })
  }, [])
  return null
}
