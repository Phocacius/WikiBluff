package de.thorstenhack.wikibluff

import org.json.JSONException
import org.json.JSONObject

fun JSONObject.getOptionalString(name: String): String? {
    if (!has(name)) return null
    return try {
        getString(name)
    } catch (e: JSONException) {
        null
    }
}