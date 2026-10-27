import { useState } from "react"

import { Link } from "@tanstack/react-router"
import { Hand, PencilLine, Undo2 } from "lucide-react"

import type { BackOfficeProductDTO } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canManageProducts } from "./access"
import { HoldDialog, ReleaseDialog } from "./HoldDialog"
import { ProductScreen } from "./ProductScreen"
import { SizeActions } from "./SizeActions"

/** The product page with Effy's actions on it; the screen itself only shows. */
export function ProductPage({ productId }: { productId: string }) {
  const canManage = canManageProducts(useSessionRoles())
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <>
      {notice ? (
        <p role="status" className="ef-alert ef-alert--info text-sm">
          {notice}
        </p>
      ) : null}
      <ProductScreen
        productId={productId}
        actions={canManage ? (p) => <Actions product={p} onNotice={setNotice} /> : undefined}
        sizeAction={canManage ? (p, v) => <SizeActions product={p} variant={v} /> : undefined}
      />
    </>
  )
}

function Actions({ product, onNotice }: { product: BackOfficeProductDTO; onNotice: (m: string | null) => void }) {
  const [holding, setHolding] = useState(false)
  const [releasing, setReleasing] = useState(false)
  if (product.state === "archived") return null
  return (
    <>
      {product.effySettingUp ? (
        <Button asChild>
          <Link to="/products/$productId/finish" params={{ productId: product.productId }}>
            <PencilLine aria-hidden="true" />
            Finish it
          </Link>
        </Button>
      ) : null}
      {product.hold ? (
        <Button
          variant="outline"
          onClick={() => {
            onNotice(null)
            setReleasing(true)
          }}
        >
          <Undo2 aria-hidden="true" />
          Release
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            onNotice(null)
            setHolding(true)
          }}
        >
          <Hand aria-hidden="true" />
          Hold
        </Button>
      )}
      <HoldDialog product={product} open={holding} onOpenChange={setHolding} />
      <ReleaseDialog product={product} open={releasing} onOpenChange={setReleasing} onReleased={onNotice} />
    </>
  )
}
