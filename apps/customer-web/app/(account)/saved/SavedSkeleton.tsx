import { Bone, boneWidth, Loading } from "@/components/ui/skeletons"

/**
 * The saved page while its list reads: the list's head and its buttons, the list tabs, the sort row, then
 * the bordered list of items (picture, name, price, add) — the same shapes `ListTabs` and `SavedList` draw.
 * The title is a bone: the page may be one of the shopper's own lists, whose name is not known yet.
 */
export function SavedSkeleton() {
  return (
    <Loading label="Loading your saved items">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Bone kind="title" className="w-48" />
            <Bone className="w-20" />
          </div>
          <Bone kind="control" className="h-9 w-28" />
        </div>
        <div className="flex gap-2">
          <Bone kind="control" className="h-9 w-24" />
          <Bone kind="control" className="h-9 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort</span>
          <Bone kind="control" className="h-10 w-45" />
        </div>
        <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
          <ul className="divide-y">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 p-4">
                <Bone kind="thumb" className="w-18 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Bone className={`max-w-64 ${boneWidth(i)}`} />
                  <Bone className="w-16" />
                </div>
                <Bone kind="control" className="h-9 w-28" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Loading>
  )
}
