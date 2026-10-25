import type { ReactNode } from "react";
import { XIcon } from "lucide-react";

import { cn } from "@effy/design-system";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@effy/design-system/ui";

/**
 * A long form or a picker (Patterns board, "Overlays"): a right drawer on a desktop that blurs the page,
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
    <Drawer open={open} onOpenChange={onOpenChange} direction={isMobile ? "bottom" : "right"} handleOnly={!isMobile}>
      <DrawerContent
        className={
          isMobile
            ? "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
            : cn(
                "data-[vaul-drawer-direction=right]:w-[calc(100%-1rem)]",
                wide ? "data-[vaul-drawer-direction=right]:sm:max-w-140" : "data-[vaul-drawer-direction=right]:sm:max-w-115",
              )
        }
      >
        {isMobile ? <span aria-hidden="true" className="mx-auto mt-3 h-2 w-12 shrink-0 rounded-full bg-muted" /> : null}
        <div className={cn("flex flex-col gap-1", isMobile ? "px-4 pt-3 pb-2" : "px-6 pt-5 pb-3 pr-12")}>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
        </div>
        {isMobile ? null : (
          <DrawerClose className="absolute top-3 right-3 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DrawerClose>
        )}
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
      </DrawerContent>
    </Drawer>
  );
}
