import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useHeaderBack, type HeaderBack } from "../console/StaffHeader";

/**
 * A page's head (Patterns board): title 24/32 semibold (20 on a phone), one muted line saying what
 * the page is for, actions on the right that go full width on a phone. A record page's back link goes
 * in the console header, before the breadcrumb; outside a console it sits above the title.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: HeaderBack;
  meta?: ReactNode;
}) {
  const inHeader = useHeaderBack(back);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
        {back && !inHeader ? (
          <Link
            {...back.link}
            className="-mt-3 -mb-2 inline-flex min-h-11 w-fit items-center gap-2 text-base text-muted-foreground no-underline hover:text-foreground [&_svg]:size-4"
          >
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-2xl leading-8 font-semibold tracking-[-0.02em] max-md:text-2xl max-md:leading-7">
          {title}
        </h1>
        {description ? (
          <p className="max-w-[72ch] text-base leading-6 text-pretty text-muted-foreground">{description}</p>
        ) : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground [&_svg]:size-4 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-2">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:[&>[data-slot=button]]:grow">{actions}</div>
      ) : null}
    </div>
  );
}
