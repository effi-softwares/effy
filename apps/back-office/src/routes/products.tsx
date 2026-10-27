import { createRoute } from "@tanstack/react-router"

import { parseProductSearch, type ProductSearch } from "@/features/products/model"
import { FinishProductScreen, NewProductScreen } from "@/features/products/EffyProductScreens"
import { ImportScreen, ImportsScreen } from "@/features/products/ImportScreens"
import { ProductPage } from "@/features/products/ProductPage"
import { ProductsListScreen } from "@/features/products/ProductsListScreen"

import { appRoute } from "./app"

export const productsIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "products",
  validateSearch: (search: Record<string, unknown>): ProductSearch => parseProductSearch(search),
  component: ProductsIndexRouteComponent,
})

export const productDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "products/$productId",
  component: ProductDetailRouteComponent,
})

export const productNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "products/new",
  component: NewProductScreen,
})

export const productImportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "products/imports",
  component: ImportsScreen,
})

export const productImportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "products/imports/$importId",
  component: ProductImportRouteComponent,
})

function ProductImportRouteComponent() {
  const { importId } = productImportRoute.useParams()
  return <ImportScreen importId={importId} />
}

export const productFinishRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "products/$productId/finish",
  component: ProductFinishRouteComponent,
})

function ProductFinishRouteComponent() {
  const { productId } = productFinishRoute.useParams()
  return <FinishProductScreen productId={productId} />
}

function ProductsIndexRouteComponent() {
  return <ProductsListScreen search={productsIndexRoute.useSearch()} />
}

function ProductDetailRouteComponent() {
  const { productId } = productDetailRoute.useParams()
  return <ProductPage productId={productId} />
}
