import type { ReactNode } from "react";

import { cn } from "@effy/design-system";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@effy/design-system/ui";

/**
 * A long form or a picker (Patterns board, "Overlays"): a right sheet on a desktop that dims the page,
 * and below 768px the same content rising from the bottom with a handle and the primary action first
 * and full width. Header, a scrolling body, and a footer that stays put.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex flex-col gap-0! p-0",
          isMobile ? "max-h-[92dvh] rounded-t-2xl" : cn("w-full", wide ? "sm:max-w-[560px]" : "sm:max-w-[460px]"),
        )}
      >
        {isMobile ? <span aria-hidden="true" className="mx-auto mt-2.5 h-[5px] w-12 shrink-0 rounded-full bg-muted" /> : null}
        <div className={cn("flex flex-col gap-1", isMobile ? "px-4 pt-3 pb-2" : "px-6 pt-5 pb-3 pr-12")}>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </div>
        <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", isMobile ? "px-4 pt-1 pb-4" : "px-6 pt-1 pb-4")}>{children}</div>
        {footer ? (
          <div
            className={cn(
              "flex gap-2 border-t border-border bg-background",
              isMobile ? "flex-col-reverse px-4 pt-3 pb-5 [&>*]:w-full" : "justify-end px-6 py-3",
            )}
          >
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
