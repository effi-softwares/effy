import { ActionLink } from "@/components/storefront/actions"

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-svh w-full max-w-2xl flex-col items-center justify-center px-4 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 text-muted-foreground">
        It may have moved, or the link may be wrong.
      </p>
      <ActionLink href="/" size="md" className="mt-8">
        Back to the store
      </ActionLink>
    </section>
  )
}
