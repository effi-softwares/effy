package com.effyshopping.customer.mobile

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform