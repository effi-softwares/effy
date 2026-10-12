import { CircleX, Package, Truck } from "lucide-react"
import { COVERAGE_LABEL, COVERAGE_REFUSAL_SENTENCE, type CoverageKind } from "@effy/shared-types"

/**
 * Who delivers to an address, in the platform's own words (076): "Delivered by Effy" in green,
 * "Courier delivery" in blue, or the ONE refusal sentence.
 *
 * ⚠ The refusal is black with a glyph, not a hue — there is no red on the storefront. The words are
 * never retyped here: they come from `@effy/shared-types`, where a test pins them.
 */
export function CoverageNote({ coverage, className = "" }: { coverage: CoverageKind | undefined; className?: string }) {
  if (!coverage) return null
  if (coverage === "none") {
    return (
      <p className={`flex items-center gap-1.5 text-sm font-medium ${className}`} data-testid="coverage-refusal">
        <CircleX aria-hidden="true" className="size-4 shrink-0" />
        {COVERAGE_REFUSAL_SENTENCE}
      </p>
    )
  }
  const Icon = coverage === "effy" ? Truck : Package
  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-medium ${coverage === "effy" ? "text-brand" : "text-primary"} ${className}`}
      data-testid="coverage-label"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {COVERAGE_LABEL[coverage]}
    </p>
  )
}
