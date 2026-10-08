"use client"

import { useEffect } from "react"

import { capture } from "@/lib/telemetry"

/** 074 — `points_viewed`, once per visit to the tab. No amounts (the taxonomy's rule). */
export function PointsViewed() {
  useEffect(() => {
    capture({ name: "points_viewed" })
  }, [])
  return null
}
