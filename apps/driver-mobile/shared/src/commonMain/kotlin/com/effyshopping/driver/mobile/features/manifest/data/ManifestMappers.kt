package com.effyshopping.driver.mobile.features.manifest.data

import com.effyshopping.driver.mobile.contract.ClassSummary as ClassSummaryDto
import com.effyshopping.driver.mobile.contract.ManifestLine as ManifestLineDto
import com.effyshopping.driver.mobile.contract.TemperatureClass as TemperatureClassDto
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine
import com.effyshopping.driver.mobile.features.manifest.domain.TemperatureClass

/**
 * Wire → domain for the manifest (065). One mapper for both the pickup and the drop.
 *
 * ⚠ The `when` is EXHAUSTIVE WITH NO `else`. A fifth class on the wire must fail to compile here
 * rather than fall through to Normal.
 */
internal fun TemperatureClassDto.toDomain(): TemperatureClass = when (this) {
    TemperatureClassDto.Frozen -> TemperatureClass.Frozen
    TemperatureClassDto.Chilled -> TemperatureClass.Chilled
    TemperatureClassDto.Normal -> TemperatureClass.Normal
    TemperatureClassDto.NotRecorded -> TemperatureClass.NotRecorded
}

internal fun ManifestLineDto.toDomain() = ManifestLine(
    name = name,
    qty = qty.toInt(),
    orderedQty = orderedQty.toInt(),
    included = included,
    temperatureClass = temperatureClass.toDomain(),
)

internal fun ClassSummaryDto.toDomain() = ClassSummary(
    frozen = frozen.toInt(),
    chilled = chilled.toInt(),
    normal = normal.toInt(),
    notRecorded = notRecorded.toInt(),
)
