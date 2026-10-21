package com.effyshopping.driver.mobile.core.scan

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * 096 — the app's scan rule agrees with every row of `packages/shared-types/scan-rule.fixtures.json`
 * (embedded as [SCAN_RULE_FIXTURES]; `scan-rule.test.ts` checks the copy is that file). Outcome, code and
 * words — the same on every surface (FR-052).
 */
class ScanRuleFixtureTest {
    @Test fun agrees_with_every_row_of_the_shared_fixture() {
        val root = Json.parseToJsonElement(SCAN_RULE_FIXTURES).jsonObject
        val ctx = root.getValue("context").jsonObject
        val expected = ctx.getValue("expected").jsonArray.map { it.jsonObject }
        val context = ScanContext(
            expected = expected.map { it.getValue("code").jsonPrimitive.content }.toSet(),
            bags = expected.associate { it.getValue("code").jsonPrimitive.content to BagNumber(it.getValue("seq").jsonPrimitive.int, it.getValue("of").jsonPrimitive.int) },
            elsewhere = ctx.getValue("elsewhere").jsonObject.mapValues { it.value.jsonPrimitive.content },
            voided = ctx.getValue("voided").jsonArray.map { it.jsonPrimitive.content }.toSet(),
            cancelled = ctx.getValue("cancelled").jsonArray.map { it.jsonPrimitive.content }.toSet(),
        )
        val counted = ctx.getValue("counted").jsonArray.map { it.jsonPrimitive.content }.toSet()
        for (row in root.getValue("cases").jsonArray.map { it.jsonObject }) {
            val raw = row.getValue("raw").jsonPrimitive.content
            val typed = row.getValue("method").jsonPrimitive.content == "typed"
            val want = row.getValue("expect").jsonObject
            val outcome = ScanRule.judge(raw, context, counted, typed)
            val wantCode = want.getValue("code").let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(want.getValue("outcome").jsonPrimitive.content, ScanRule.wireOutcome(outcome), "outcome of ${'"'}$raw${'"'}")
            assertEquals(wantCode, ScanRule.codeOf(outcome), "code of ${'"'}$raw${'"'}")
            assertEquals(want.getValue("words").jsonPrimitive.content, ScanRule.words(outcome, context), "words of ${'"'}$raw${'"'}")
        }
    }
}
