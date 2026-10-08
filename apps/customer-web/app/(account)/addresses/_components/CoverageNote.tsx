import { COVERAGE_LABEL, COVERAGE_REFUSAL_SENTENCE, type CoverageKind } from "@effy/shared-types"

/**
 * Who delivers to an address — "Delivered by Effy", "Courier delivery" — or the one sentence that
 * says nobody does (076).
 *
 * ⚠ THE WORDS ARE NOT WRITTEN HERE. They come from `@effy/shared-types`, the same constants the
 * server puts in a checkout refusal and the mobile app mirrors, because the spec requires the
 * refusal to be the SAME sentence wherever a customer meets it (FR-022). Before 076 the website had
 * its own wording and the server another.
 *
 * ⚠ It shows the answer and nothing about WHY — no group, no distance, no reason (FR-023). There is
 * no prop through which one could arrive.
 *
 * Renders nothing when the server did not say (an API older than 076).
 */
export function CoverageNote({ coverage, className = "" }: { coverage: CoverageKind | undefined; className?: string }) {
  if (!coverage) return null
  if (coverage === "none") {
    return (
      <p className={`text-sm text-destructive ${className}`} data-testid="coverage-refusal">
        {COVERAGE_REFUSAL_SENTENCE}
      </p>
    )
  }
  return (
    <p className={`text-sm text-muted-foreground ${className}`} data-testid="coverage-label">
      {COVERAGE_LABEL[coverage]}
    </p>
  )
}
