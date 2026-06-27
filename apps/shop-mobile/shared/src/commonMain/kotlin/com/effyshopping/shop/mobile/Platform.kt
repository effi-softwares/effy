package com.effyshopping.shop.mobile

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform