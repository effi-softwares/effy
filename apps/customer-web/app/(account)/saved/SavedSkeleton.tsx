import { Skeleton } from "@/components/ui/misc"

/** The saved page's shape while its list is read (reference: the page's own header, tabs and rows). */
export function SavedSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="divide-y rounded-lg border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="size-[72px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
