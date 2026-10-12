package com.effyshopping.driver.mobile.features.delivery.data

import com.effyshopping.driver.mobile.core.placeholder.Sourced
import com.effyshopping.driver.mobile.core.placeholder.decorative
import com.effyshopping.driver.mobile.core.placeholder.operational

/**
 * What the delivery and proof screens cannot honestly show (060 US2, FR-013…FR-017a).
 *
 * ⚠ Every entry here is a field the DESIGN has and this app refuses to invent. See
 * `CollectionPlaceholders` for why an omission still gets declared.
 */
object DeliveryPlaceholders {

    /** ⚠ Design: "ETA 12:41" on the drop card and the en-route sheet. */
    val dropEta: Sourced<Nothing?> = operational("A routing provider + address geocoding")

    /** ⚠ Design: "3.9 km" on the en-route sheet. */
    val dropDistance: Sourced<Nothing?> = operational("Address geocoding")

    /** The en-route map panel: neutral. Real cartography was built and removed (see `EffyMapCanvas`). */
    val mapPanel: Sourced<String> =
        decorative("map-pending", "A map renderer that runs under Xcode's debug build, and address geocoding for pins")

    /**
     * ⚠ Design: "geotagged Brunswick VIC" on a captured proof. No location capture is wired, and a
     * **wrong** geotag on a delivery record is evidence in a dispute — worse than none.
     */
    val photoGeotag: Sourced<Nothing?> = operational("Location capture + the location permission")

    /** ⚠ Design: flash and lens-flip controls. Neither capture path exposes either. */
    val cameraControls: Sourced<String> =
        decorative("", "Torch + lens selection on the live capture path")

    /**
     * ⚠ iOS has no live viewfinder; the screen shows a stand-in and hands off to the system camera.
     * Still an improvement — iOS had no photo proof at all before 060.
     */
    val iosLivePreview: Sourced<String> =
        decorative("system-camera", "A Swift AVFoundation bridge (research R8)")
}
