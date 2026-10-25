import { createRoute } from "@tanstack/react-router"

import { ExceptionsScreen } from "@/features/exceptions/ExceptionsScreen"

import { appRoute } from "./app"

export const exceptionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "exceptions",
  component: ExceptionsScreen,
})
