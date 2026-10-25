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
    <label className="ef-toolbar__search">
      <Search aria-hidden="true" />
      <Input
        aria-label="Search"
        type="search"
        placeholder="Order, customer or SKU…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pr-11!"
      />
      {text ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          onClick={() => {
            setText("")
            onChange("")
          }}
          className="absolute right-2"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </label>
  )
}
