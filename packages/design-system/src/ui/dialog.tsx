import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "../cn"
import { useIsMobile } from "../hooks/use-mobile"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"
import { dialogDrawerClassName, overlayClassName } from "./overlay"

const DialogMobileContext = React.createContext(false)

function useDialogIsMobile() {
  return React.useContext(DialogMobileContext)
}

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const isMobile = useIsMobile()
  return (
    <DialogMobileContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer {...props} />
      ) : (
        <DialogPrimitive.Root data-slot="dialog" {...props} />
      )}
    </DialogMobileContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  if (useDialogIsMobile()) return <DrawerTrigger data-slot="dialog-trigger" {...props} />
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  if (useDialogIsMobile()) return <DrawerPortal data-slot="dialog-portal" {...props} />
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  if (useDialogIsMobile()) return <DrawerClose data-slot="dialog-close" {...props} />
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  if (useDialogIsMobile()) return <DrawerOverlay className={className} {...props} />
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(overlayClassName, className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const isMobile = useDialogIsMobile()
  if (isMobile) {
    return (
      <DrawerContent className={cn(dialogDrawerClassName, className)} {...props}>
        {children}
      </DrawerContent>
    )
  }
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-lg border p-6 shadow-lg duration-(--dur-standard) sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const isMobile = useDialogIsMobile()
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2",
        isMobile ? "pt-4 text-left" : "text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  const isMobile = useDialogIsMobile()
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        isMobile && "mt-auto [&>*]:w-full",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const classes = cn("text-lg leading-none font-semibold", className)
  if (useDialogIsMobile()) return <DrawerTitle className={classes} {...props} />
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={classes}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const classes = cn("text-muted-foreground text-sm", className)
  if (useDialogIsMobile()) return <DrawerDescription className={classes} {...props} />
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={classes}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useDialogIsMobile,
}
