package com.effyshopping.driver.mobile.features.delivery

import com.effyshopping.driver.mobile.contract.DropPackageRef
import com.effyshopping.driver.mobile.core.http.effyJson
import kotlin.test.Test
import kotlin.test.assertEquals

/** 089 — a package's label code and its bags arrive on the drop. */
class PackageCodeWireTest {
    private val base = """"ref":"EFY-1","fromShopCount":1,"items":[],"summary":{"frozen":0,"chilled":0,"normal":1,"notRecorded":0}"""

    @Test fun a_package_decodes_its_code_and_bags() {
        val pkg = effyJson.decodeFromString(
            DropPackageRef.serializer(),
            """{$base,"packageCode":"7K3Q9M","parcels":[{"parcelId":"p1","code":"7K3Q9M","seq":1,"of":1,"zone":"ambient"}]}""",
        )
        assertEquals("7K3Q9M", pkg.packageCode)
        assertEquals(listOf("7K3Q9M"), pkg.parcels.map { it.code })
    }
}
