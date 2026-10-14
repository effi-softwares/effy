import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CatalogImage } from "./CatalogImage"

const SRC = "https://media.dev.effyshopping.com/products/o1/t1.jpg"

describe("CatalogImage (086)", () => {
  it("offers no copy when none exist — the original only", () => {
    const { container } = render(<CatalogImage src={SRC} alt="" sizes="10rem" />)
    expect(container.querySelector("source")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(SRC)
  })

  it("offers the WebP copies first, and the original underneath for a browser without WebP", () => {
    const { container } = render(<CatalogImage src={SRC} widths={[160, 320]} alt="Milk" sizes="45vw" />)
    const source = container.querySelector("source")!
    expect(source.getAttribute("type")).toBe("image/webp")
    expect(source.getAttribute("srcset")).toBe(
      "https://media.dev.effyshopping.com/renditions/products/o1/t1/w160.webp 160w, https://media.dev.effyshopping.com/renditions/products/o1/t1/w320.webp 320w",
    )
    expect(source.getAttribute("sizes")).toBe("45vw")
    const img = container.querySelector("img")!
    expect([img.getAttribute("src"), img.getAttribute("alt")]).toEqual([SRC, "Milk"])
  })

  it("loads lazily unless it is the page's largest picture", () => {
    const lazy = render(<CatalogImage src={SRC} alt="" sizes="1px" />).container.querySelector("img")!
    expect([lazy.getAttribute("loading"), lazy.getAttribute("fetchpriority")]).toEqual(["lazy", "auto"])
    const eager = render(<CatalogImage src={SRC} alt="" sizes="1px" priority />).container.querySelector("img")!
    expect([eager.getAttribute("loading"), eager.getAttribute("fetchpriority")]).toEqual(["eager", "high"])
  })

  it("fill covers the positioned parent", () => {
    const img = render(<CatalogImage src={SRC} alt="" sizes="1px" fill className="object-cover" />).container.querySelector("img")!
    expect(img.className).toBe("absolute inset-0 size-full object-cover")
  })
})
