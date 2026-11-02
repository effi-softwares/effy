import { useEffect, useState } from "react"

import { useMotionValueEvent, useReducedMotion, useSpring } from "motion/react"

/** A number that rolls to its new value. Motion's own `AnimateNumber` is a paid add-on. */
export function RollingNumber({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const calm = useReducedMotion()
  const spring = useSpring(value, { stiffness: 140, damping: 24 })
  const [shown, setShown] = useState(value)
  useEffect(() => spring.set(value), [spring, value])
  useMotionValueEvent(spring, "change", (v) => setShown(Math.round(v)))
  return <>{format(calm ? value : shown)}</>
}
