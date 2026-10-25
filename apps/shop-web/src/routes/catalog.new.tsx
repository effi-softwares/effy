import { createRoute, useNavigate } from "@tanstack/react-router"

import { ProductCreateFlow } from "@/features/catalog/ProductCreateFlow"

import { appRoute } from "./app"

export const catalogNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/new",
  component: NewProductRoute,
})

function NewProductRoute() {
  const navigate = useNavigate()
  return (
    <ProductCreateFlow
      onCancel={() => void navigate({ to: "/catalog" })}
      onCreated={(productId) => void navigate({ to: "/catalog/$productId", params: { productId } })}
    />
  )
}
