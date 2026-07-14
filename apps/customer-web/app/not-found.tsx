import Link from "next/link"

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-svh w-full max-w-2xl flex-col items-center justify-center px-4 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 text-muted-foreground">
        It may have moved, or the link may be wrong.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Back to the store
      </Link>
    </section>
  )
}
