/**
 * The busy indicator.
 *
 * ⚠ `motion-reduce:animate-none` is not optional. A spinner is the single most common trigger for
 * vestibular discomfort on the web, and `prefers-reduced-motion` is a stated accessibility need, not
 * a preference. The ring still reads as "something is happening" when it stops turning.
 *
 * ⚠ It is DECORATIVE — `aria-hidden`. The label belongs on the region that is busy (`role="status"`
 * with an sr-only sentence), not on the animation, so a screen reader hears what is loading rather
 * than that a circle is spinning.
 */
export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-none`}
    />
  )
}

/**
 * A centred busy region — the spinner plus the announcement that belongs with it.
 *
 * `min-h` rather than a fixed height so the box holds its ground while content swaps without
 * pinning it to a size the incoming content may not want.
 */
export function LoadingArea({
  label,
  className = "min-h-[240px]",
  testId,
}: {
  /** What is loading, said in a sentence. Announced; never shown. */
  label: string
  className?: string
  testId?: string
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className={`flex ${className} items-center justify-center`}
    >
      <Spinner />
      <span className="sr-only">{label}</span>
    </div>
  )
}
