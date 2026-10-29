import { Bone, boneWidth, Loading } from "@/components/ui/skeletons"

/** The rail before its facets arrive: groups of a heading and ticked-box rows, as `Section` draws them. */
export function FilterRailSkeleton() {
  return (
    <Loading label="Loading filters">
      {[0, 1, 2].map((g) => (
        <div key={g} className="border-b py-4 first:pt-0">
          <Bone className="mb-3 w-24" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex items-center gap-2">
                <Bone className="size-4 rounded-sm" />
                <Bone className={`max-w-36 ${boneWidth(g + i)}`} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </Loading>
  )
}
