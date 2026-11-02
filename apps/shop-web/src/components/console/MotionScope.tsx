import type { ReactNode } from "react"

import { LazyMotion, MotionConfig } from "motion/react"

const features = () => import("@/lib/motion-features").then((m) => m.default)

/** Where a page animates: the feature set arrives on demand, and reduced motion is honoured everywhere under it. */
export function MotionScope({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
