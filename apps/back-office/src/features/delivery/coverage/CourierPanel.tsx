import { useState } from "react"

import {
  courierEstimateSentence,
  type CourierBlocker,
  type CourierCollection,
  type CourierReachDTO,
  type CourierReachUpdateDTO,
} from "@effy/shared-types"
import { Button, Input, Label, RadioGroup, RadioGroupItem, Switch } from "@effy/design-system/ui"
import {
  Bone,
  Loading,
  SettingsList,
  SettingsPage,
  SettingsReadOnly,
  SettingsRow,
  SettingsSection,
} from "@effy/web-kit/patterns"

import { coverageError } from "../errorText"
import { useAddCourierExclusion, useRemoveCourierExclusion, useUpdateCourier } from "../queries"
import { CourierServicesPanel } from "./CourierServicesPanel"

const SECTION = {
  offer: {
    title: "Offering it",
    description:
      "An address that is not on Effy's list is offered courier delivery - everywhere in the country except the postcodes excluded below.",
  },
  route: {
    title: "How courier parcels reach the courier",
    description: "For new courier orders. Staff can change a single order until its first parcel leaves.",
  },
  services: {
    title: "Courier services",
    description:
      "The courier services Effy books. Checkout tells a courier customer the default's timeframe; each service's pickup days decide when a parcel at the hub is due out.",
  },
  excluded: {
    title: "Excluded postcodes",
    description: "Places courier delivery is never offered, with the reason. Changes save at once.",
  },
} as const

const BLOCKER_COPY: Record<CourierBlocker, string> = {
  no_fee_table: "Make a courier fee table active in Delivery › Pricing.",
  no_service: "Add a courier service below and make it the default.",
}

export function CourierPanel({ courier, canManage }: { courier: CourierReachDTO; canManage: boolean }) {
  const update = useUpdateCourier()
  const addExclusion = useAddCourierExclusion()
  const removeExclusion = useRemoveCourierExclusion()
  const [postcode, setPostcode] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function change(c: CourierReachUpdateDTO) {
    setError(null)
    try {
      await update.mutateAsync(c)
    } catch (err) {
      setError(coverageError(err))
    }
  }

  async function exclude(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addExclusion.mutateAsync({ postcode: postcode.trim(), reason: reason.trim() })
      setPostcode("")
      setReason("")
    } catch (err) {
      setError(coverageError(err))
    }
  }

  async function include(pc: string) {
    setError(null)
    try {
      await removeExclusion.mutateAsync(pc)
    } catch (err) {
      setError(coverageError(err))
    }
  }

  // On needs a price and an estimate. Off is always allowed.
  const locked = !courier.offered && courier.blockedBy.length > 0

  return (
    <SettingsPage>
      {canManage ? null : (
        <SettingsReadOnly>Only an administrator or manager can change courier delivery.</SettingsReadOnly>
      )}
      <SettingsSection {...SECTION.offer}>
        <SettingsList>
          <SettingsRow
            tour="courier-setup.switch"
            htmlFor="courier-offered"
            label="Offer courier delivery"
            hint={
              locked ? (
                <span data-testid="courier-locked">
                  Before it can be switched on:{" "}
                  {courier.blockedBy.map((b, i) => (
                    <span key={b}>
                      {i > 0 ? " " : null}
                      {BLOCKER_COPY[b]}
                    </span>
                  ))}
                </span>
              ) : (
                "Changes save at once."
              )
            }
          >
            <Switch
              id="courier-offered"
              checked={courier.offered}
              disabled={!canManage || locked || update.isPending}
              onCheckedChange={(v) => void change({ offered: v })}
            />
          </SettingsRow>
          <SettingsRow
            label="What a courier customer is told"
            hint={
              <span data-testid="courier-estimate-preview">
                {courier.defaultService ? (
                  <>
                    “{courierEstimateSentence(courier.defaultService.estimateText)}” - the timeframe of{" "}
                    {courier.defaultService.label}, the default service. An order keeps the estimate it was sold.
                  </>
                ) : (
                  "Nothing yet - checkout tells a courier customer the default courier service's timeframe."
                )}
              </span>
            }
          />
          <SettingsRow
            htmlFor="courier-no-windows"
            label="Offer courier when no delivery window is available"
            hint="For an address Effy delivers to, when every window on every offered day is closed or taken. Off: the customer is told there are no windows and cannot pay."
          >
            <Switch
              id="courier-no-windows"
              checked={courier.whenNoWindows}
              disabled={!canManage || update.isPending}
              onCheckedChange={(v) => void change({ whenNoWindows: v })}
            />
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection tour="courier-setup.route" {...SECTION.route}>
        <RadioGroup
          aria-label="How courier parcels reach the courier"
          value={courier.collectionDefault}
          disabled={!canManage || update.isPending}
          onValueChange={(v) => void change({ collectionDefault: v as CourierCollection })}
          className="gap-0"
        >
          <SettingsList>
            <label className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3">
              <RadioGroupItem value="hub" aria-label="Via the hub" className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">Via the hub</span>
                <span className="text-sm text-muted-foreground">
                  Effy's drivers collect from suppliers, and the hub hands parcels to the courier.
                </span>
              </span>
            </label>
            <label className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3">
              <RadioGroupItem value="supplier" aria-label="Pickup from the supplier" className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">Pickup from the supplier</span>
                <span className="text-sm text-muted-foreground">
                  The courier collects each parcel from the supplier that packed it.
                </span>
              </span>
            </label>
          </SettingsList>
        </RadioGroup>
      </SettingsSection>

      <SettingsSection {...SECTION.services}>
        <CourierServicesPanel canManage={canManage} />
      </SettingsSection>

      <SettingsSection tour="courier-setup.excluded" {...SECTION.excluded}>
        {courier.exclusions.length === 0 ? (
          <SettingsList>
            <SettingsRow label="None" hint="Courier delivery would be offered everywhere off Effy's list." />
          </SettingsList>
        ) : (
          <div data-testid="courier-exclusions">
            <SettingsList>
              {courier.exclusions.map((x) => (
                <SettingsRow
                  key={x.postcode}
                  label={
                    <>
                      <span className="font-mono tabular-nums">{x.postcode}</span>{" "}
                      <span className="font-normal text-muted-foreground">{x.places.slice(0, 3).join(", ")}</span>
                    </>
                  }
                  hint={x.reason}
                >
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={removeExclusion.isPending}
                      onClick={() => void include(x.postcode)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </SettingsRow>
              ))}
            </SettingsList>
          </div>
        )}

        {canManage ? (
          <form onSubmit={exclude} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="exclude-postcode">Postcode</Label>
              <Input
                id="exclude-postcode"
                className="w-28"
                inputMode="numeric"
                placeholder="7255"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
            </div>
            <div className="grid min-w-48 flex-1 gap-2">
              <Label htmlFor="exclude-reason">Why</Label>
              <Input
                id="exclude-reason"
                placeholder="No chilled courier service"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={addExclusion.isPending || postcode.trim().length !== 4 || reason.trim().length < 3}
            >
              Exclude
            </Button>
          </form>
        ) : null}
      </SettingsSection>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsPage>
  )
}

/** The page while coverage reads: its fixed sections and words, a bone for each setting. */
export function CourierPanelSkeleton() {
  return (
    <Loading>
      <SettingsPage>
        <SettingsSection {...SECTION.offer}>
          <SettingsList>
            <SettingsRow label="Offer courier delivery">
              <Bone className="h-5 w-9 rounded-full" />
            </SettingsRow>
            <SettingsRow
              label="What a courier customer is told"
              hint={<Bone kind="small" className="w-full max-w-xl" />}
            />
            <SettingsRow label="Offer courier when no delivery window is available">
              <Bone className="h-5 w-9 rounded-full" />
            </SettingsRow>
          </SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.route}>
          <SettingsList>
            <SettingsRow label="Via the hub" />
            <SettingsRow label="Pickup from the supplier" />
          </SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}
