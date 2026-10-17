package com.effyshopping.driver.mobile.core.scan

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** A paired Bluetooth scanner types the label: `EFY1:5MQKVF`, then Enter (or Tab, or nothing). */
class KeyboardWedgeTest {
    private fun KeyboardWedge.typeAll(s: String): List<String> = s.mapNotNull { type(it) }

    @Test fun a_label_is_read_the_moment_it_is_whole() {
        val w = KeyboardWedge()
        assertEquals(listOf("EFY1:5MQKVF"), w.typeAll("EFY1:5MQKVF"))
        w.end() // the scanner's Enter, after the read: nothing more
        assertEquals(emptyList(), w.typeAll(""))
    }

    @Test fun two_labels_in_a_row_with_no_suffix_are_two_reads() {
        assertEquals(listOf("EFY1:5MQKVF", "EFY1:P2N8RT"), KeyboardWedge().typeAll("EFY1:5MQKVFEFY1:P2N8RT"))
    }

    @Test fun caps_lock_on_the_phone_does_not_lose_the_read() {
        assertEquals(listOf("EFY1:5MQKVF"), KeyboardWedge().typeAll("efy1:5mqkvf"))
    }

    @Test fun a_stray_key_before_the_scan_does_not_spoil_it() {
        assertEquals(listOf("EFY1:5MQKVF"), KeyboardWedge().typeAll("xx9EFY1:5MQKVF"))
    }

    @Test fun a_product_barcode_is_not_a_read() {
        assertEquals(emptyList(), KeyboardWedge().typeAll("9300633000123"))
    }

    @Test fun a_label_with_a_look_alike_character_is_not_a_read() {
        assertEquals(emptyList(), KeyboardWedge().typeAll("EFY1:5MQKV0"))
    }

    @Test fun enter_part_way_through_drops_what_was_typed() {
        val w = KeyboardWedge()
        assertEquals(emptyList(), w.typeAll("EFY1:5MQ"))
        w.end()
        assertEquals(emptyList(), w.typeAll("KVF"))
    }

    /** When a key event carries no character, the label's characters come from the key itself. */
    @Test fun a_key_with_no_character_still_types_the_label() {
        assertEquals('E', keyChar(androidx.compose.ui.input.key.Key.E, shift = false))
        assertEquals('1', keyChar(androidx.compose.ui.input.key.Key.One, shift = false))
        assertEquals(':', keyChar(androidx.compose.ui.input.key.Key.Semicolon, shift = true))
        assertNull(keyChar(androidx.compose.ui.input.key.Key.One, shift = true)) // "!" — not in a label
        assertNull(keyChar(androidx.compose.ui.input.key.Key.Back, shift = false))
    }

    @Test fun the_type_a_code_box_reads_a_scan_and_shows_its_code_while_it_types() {
        assertEquals("EFY1:5MQKVF", tokenIn("EFY1:5MQKVF"))
        assertNull(tokenIn("EFY1:5MQ"))
        assertEquals("5MQ", typedCode("EFY1:5MQ"))
        assertEquals("5MQKVF", typedCode("5mqkvf"))
        assertEquals("EFY", typedCode("EFY")) // a person typing a code that starts E-F-Y
    }
}
