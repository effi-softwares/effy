import { Bone, Loading } from "@/components/ui/skeletons"

/**
 * An auth step while its form loads (it reads the address bar, so it is behind Suspense): the step's own
 * title and line - they are fixed - the email field, the button, and Google where the step offers it.
 * Drawn on `StepShell`'s spacing without importing it, so the fallback stays out of the client bundle.
 */
export function AuthFormSkeleton({
  title,
  subtitle,
  google = false,
}: {
  title: string
  subtitle: string
  google?: boolean
}) {
  return (
    <Loading>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl leading-[1.1] font-semibold tracking-[-0.025em] text-balance">{title}</h1>
          <div className="text-muted-foreground">{subtitle}</div>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Email</span>
            <Bone kind="control" />
          </div>
          <Bone kind="control" />
          {google ? (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                OR
                <span className="h-px flex-1 bg-border" />
              </div>
              <Bone kind="control" />
            </>
          ) : null}
        </div>
      </div>
    </Loading>
  )
}
