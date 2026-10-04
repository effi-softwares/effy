package com.effyshopping.driver.mobile.features.manifest

import com.effyshopping.driver.mobile.contract.ClassSummary as ClassSummaryDto
import com.effyshopping.driver.mobile.contract.ManifestLine as ManifestLineDto
import com.effyshopping.driver.mobile.contract.TemperatureClass as TemperatureClassDto
import com.effyshopping.driver.mobile.features.manifest.data.toDomain
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine
import com.effyshopping.driver.mobile.features.manifest.domain.TemperatureClass
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** 065 — the manifest's wire mapping and the summary a driver reads without opening a package. */
class ManifestTest {
    private fun dto(cls: TemperatureClassDto, qty: Long = 1, ordered: Long = qty, included: Boolean = qty > 0) =
        ManifestLineDto(included = included, name = "Item", orderedQty = ordered, qty = qty, temperatureClass = cls)

    @Test
    fun `every wire class maps to its own domain class`() {
        assertEquals(TemperatureClass.Frozen, TemperatureClassDto.Frozen.toDomain())
        assertEquals(TemperatureClass.Chilled, TemperatureClassDto.Chilled.toDomain())
        assertEquals(TemperatureClass.Normal, TemperatureClassDto.Normal.toDomain())
    }

    /** SC-008 — a line sold before the class was recorded must never read as Normal. */
    @Test
    fun `not recorded stays not recorded - it is never Normal`() {
        val line = dto(TemperatureClassDto.NotRecorded).toDomain()
        assertEquals(TemperatureClass.NotRecorded, line.temperatureClass)
        assertEquals("Class not recorded", line.temperatureClass.label)
    }

    @Test
    fun `a line keeps what is in the bag and what was ordered`() {
        val line = dto(TemperatureClassDto.Chilled, qty = 1, ordered = 4).toDomain()
        assertEquals(ManifestLine("Item", 1, 4, true, TemperatureClass.Chilled), line)
        assertTrue(line.partSupplied)
    }

    @Test
    fun `a line the shop did not supply is not part-supplied - it is not included`() {
        val line = dto(TemperatureClassDto.Frozen, qty = 0, ordered = 2).toDomain()
        assertFalse(line.included)
        assertFalse(line.partSupplied)
    }

    @Test
    fun `the summary is the server's - mapped field for field`() {
        assertEquals(ClassSummary(2, 3, 6, 1), ClassSummaryDto(chilled = 3, frozen = 2, normal = 6, notRecorded = 1).toDomain())
    }

    /** FR-015 — a class with nothing in it is left out, not shown as zero. */
    @Test
    fun `only classes that are present are listed - cold first`() {
        val s = ClassSummary(frozen = 0, chilled = 3, normal = 6, notRecorded = 0)
        assertEquals(listOf(TemperatureClass.Chilled to 3, TemperatureClass.Normal to 6), s.present)
        assertEquals("3 chilled, 6 normal", s.spoken)
        assertTrue(s.hasCold)
    }

    @Test
    fun `a package of shelf goods carries no cold signal`() {
        val s = ClassSummary(frozen = 0, chilled = 0, normal = 4, notRecorded = 0)
        assertFalse(s.hasCold)
        assertEquals(4, s.total)
    }

    @Test
    fun `an empty package says so in words`() {
        assertEquals("no items", ClassSummary.Empty.spoken)
        assertEquals(0, ClassSummary.Empty.total)
    }
}
