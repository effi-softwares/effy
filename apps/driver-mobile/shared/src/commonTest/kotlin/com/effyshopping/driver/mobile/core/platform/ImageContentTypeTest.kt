package com.effyshopping.driver.mobile.core.platform

import kotlin.test.Test
import kotlin.test.assertEquals

class ImageContentTypeTest {
    @Test fun a_jpeg_is_sent_as_jpeg() {
        val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte())
        assertEquals("image/jpeg", imageContentType(jpeg))
    }

    @Test fun a_signature_png_is_sent_as_png() {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
        assertEquals("image/png", imageContentType(png))
    }
}
