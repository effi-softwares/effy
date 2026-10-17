package com.effyshopping.driver.mobile.core.map

import com.effyshopping.driver.mobile.contract.RunMapDTO
import com.effyshopping.driver.mobile.contract.RunMapStopKind
import com.effyshopping.driver.mobile.contract.RunMapStopStatus

/** The wire's run map → the domain's. Exhaustive: a new kind on the wire must fail to compile here. */
internal fun RunMapDTO.toDomain(): RunMap = RunMap(
    stops = stops.map {
        RunMapStop(
            n = it.n?.toInt(),
            kind = when (it.kind) {
                RunMapStopKind.Shop -> RunMapStop.Kind.SHOP
                RunMapStopKind.Customer -> RunMapStop.Kind.CUSTOMER
                RunMapStopKind.Hub -> RunMapStop.Kind.HUB
            },
            status = when (it.status) {
                RunMapStopStatus.Done -> RunMapStop.Status.DONE
                RunMapStopStatus.Next -> RunMapStop.Status.NEXT
                RunMapStopStatus.Todo -> RunMapStop.Status.TODO
            },
            point = GeoPoint(it.point.lat, it.point.lng),
        )
    },
    hub = hub?.let { GeoPoint(it.lat, it.lng) },
)
