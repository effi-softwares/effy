import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { ErrorState, useHeaderBack } from "@effy/web-kit/console"

import { EffyProductForm, EffyProductFormSkeleton } from "./EffyProductForm"
import { productQuery } from "./queries"

const BACK = { label: "Products", link: { to: "/products" } } as const

/** Catalogue › Products › New product: Effy creates a product for a shop (102). */
export function NewProductScreen() {
  const navigate = useNavigate()
  useHeaderBack(BACK)
  return (
    <EffyProductForm
      mode={{ kind: "create" }}
      onCancel={() => void navigate({ to: "/products" })}
      onDone={(productId) => void navigate({ to: "/products/$productId", params: { productId } })}
    />
  )
}

/** Finish a product Effy created: pictures, details, anything the form asks for. */
export function FinishProductScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const product = useQuery(productQuery(productId))
  useHeaderBack({ label: "Product", link: { to: "/products/$productId", params: { productId } } } as never)
  const back = () => void navigate({ to: "/products/$productId", params: { productId } })

  if (product.isError) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />
  if (product.isPending) return <EffyProductFormSkeleton />
  if (!product.data.effySettingUp) {
    return <ErrorState error={new Error("This product is the shop's now; Effy can no longer edit its content.")} />
  }
  return (
    <EffyProductForm
      key={product.data.version}
      mode={{ kind: "finish", product: product.data }}
      onCancel={back}
      onDone={back}
    />
  )
}
