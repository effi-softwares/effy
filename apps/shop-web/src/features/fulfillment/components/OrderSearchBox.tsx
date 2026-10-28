import { useEffect, useState } from "react"
import { Search, X } from "lucide-react"

import { Button, Input } from "@effy/design-system/ui"

export function OrderSearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (text === value) return
    const t = setTimeout(() => onChange(text), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the text only
  }, [text])

  return (
    <label className="relative flex w-72 max-w-full items-center max-md:w-full md:order-last md:ml-auto">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <Input
        aria-label="Search"
        type="search"
        placeholder="Order, customer or SKU…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pr-10 pl-9"
      />
      {text ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          onClick={() => {
            setText("")
            onChange("")
          }}
          className="absolute right-0.5"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </label>
  )
}
