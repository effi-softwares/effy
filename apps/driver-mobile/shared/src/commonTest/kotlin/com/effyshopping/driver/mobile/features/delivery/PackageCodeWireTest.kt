package com.effyshopping.driver.mobile.features.delivery

import com.effyshopping.driver.mobile.contract.DropPackageRef
import com.effyshopping.driver.mobile.core.http.effyJson
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** 089 — a package's label code arrives on the drop; a server without it still decodes. */
class PackageCodeWireTest {
    private val base = """"ref":"EFY-1","fromShopCount":1,"items":[],"summary":{"frozen":0,"chilled":0,"normal":1,"notRecorded":0}"""

    @Test fun a_package_decodes_with_and_without_its_code() {
        assertNull(effyJson.decodeFromString(DropPackageRef.serializer(), "{$base}").packageCode)
        assertEquals(
            "7K3Q9M",
            effyJson.decodeFromString(DropPackageRef.serializer(), """{$base,"packageCode":"7K3Q9M"}""").packageCode,
        )
    }
}
