import { Toaster as Sonner, toast } from "sonner"
import type { ToasterProps } from "sonner"

/** The toast surface: sonner's Toaster styled from the tokens, so it follows the `.dark` class. Mount once; call `toast(...)`. */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster, toast }
