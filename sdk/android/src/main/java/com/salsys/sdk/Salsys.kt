package com.salsys.sdk

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Salsys Android SDK V1.
 *
 * The sourceKey is intentionally publishable. Never put a Salsys server-source
 * secret in an Android application. Authoritative commerce/payment/enrollment
 * facts belong on the trusted server Events API, not this SDK.
 */
data class SalsysConfig(
    val sourceKey: String,
    val baseUrl: String = "https://salsysos.com",
    val site: String? = null,
    val debug: Boolean = false,
)

object Salsys {
    private const val PREFS = "salsys_sdk_v1"
    private const val KEY_VISITOR = "visitor_id"
    private const val KEY_CONSENT = "consent"
    private const val KEY_QUEUE = "queue"
    private const val SDK_NAME = "salsys-android"
    private const val SDK_VERSION = "1.0.0"

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var appContext: Context
    private lateinit var prefs: SharedPreferences
    private lateinit var config: SalsysConfig
    private var initialized = false
    private var sessionId = randomId("s")
    private var ephemeralVisitorId = randomId("v")

    @Synchronized
    fun initialize(context: Context, configuration: SalsysConfig) {
        require(configuration.sourceKey.isNotBlank()) { "sourceKey is required" }
        appContext = context.applicationContext
        prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        config = configuration
        sessionId = randomId("s")
        ephemeralVisitorId = randomId("v")
        initialized = true
        flush()
    }

    fun newSession() {
        requireInitialized()
        sessionId = randomId("s")
    }

    fun visitorId(): String {
        requireInitialized()
        return persistentVisitorId() ?: ephemeralVisitorId
    }

    fun sessionId(): String {
        requireInitialized()
        return sessionId
    }

    fun consent(): Map<String, String> {
        requireInitialized()
        val raw = prefs.getString(KEY_CONSENT, null) ?: return emptyMap()
        return try {
            val json = JSONObject(raw)
            json.keys().asSequence().associateWith { json.optString(it) }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun setConsent(decisions: Map<String, String>, gpc: Boolean = false) {
        requireInitialized()
        val normalized = decisions
            .mapKeys { it.key.trim().lowercase() }
            .mapValues { it.value.trim().lowercase() }
            .filterKeys { it in setOf("analytics", "marketing", "advertising", "sale_sharing", "personalization") }
            .filterValues { it in setOf("granted", "denied", "withdrawn", "opted_out", "limited") }
            .toMutableMap()

        if (gpc) normalized["sale_sharing"] = "opted_out"
        prefs.edit().putString(KEY_CONSENT, JSONObject(normalized as Map<*, *>).toString()).apply()

        if (normalized["analytics"] == "granted" && persistentVisitorId() == null) {
            prefs.edit().putString(KEY_VISITOR, ephemeralVisitorId).apply()
        }
        if (normalized["analytics"] in setOf("denied", "withdrawn", "opted_out")) {
            prefs.edit().remove(KEY_VISITOR).remove(KEY_QUEUE).apply()
        }

        val body = JSONObject()
            .put("event_id", randomId("consent"))
            .put("visitor_id", visitorId())
            .put("platform", "android")
            .put("gpc", gpc)
            .put("occurred_at", isoNow())
            .put("decisions", JSONObject(normalized as Map<*, *>))

        post("/api/privacy/consent/client/v1", body) { ok ->
            if (ok && analyticsGranted()) flush()
        }
    }

    fun track(
        eventName: String,
        properties: Map<String, Any?> = emptyMap(),
        context: Map<String, Any?> = emptyMap(),
    ) {
        requireInitialized()
        val normalizedName = eventName.trim().lowercase()
        require(Regex("^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$").matches(normalizedName)) {
            "eventName must be namespace.event_name"
        }
        require(normalizedName.startsWith("app.")) {
            "Android publishable SDK accepts app.* telemetry only"
        }

        if (!analyticsGranted()) {
            debug("blocked by analytics consent: $normalizedName")
            return
        }

        val envelope = JSONObject()
            .put("event_id", randomId("evt"))
            .put("event_name", normalizedName)
            .put("schema_version", 1)
            .put("occurred_at", isoNow())
            .put("anonymous_visitor_id", visitorId())
            .put("session_key", sessionId)
            .put("site", config.site ?: JSONObject.NULL)
            .put("properties", JSONObject(sanitizeMap(properties)))
            .put(
                "context",
                JSONObject(sanitizeMap(context))
                    .put("platform", "android")
                    .put("app_package", appContext.packageName),
            )
            .put(
                "metadata",
                JSONObject()
                    .put(
                        "sdk",
                        JSONObject()
                            .put("name", SDK_NAME)
                            .put("version", SDK_VERSION)
                            .put("integration", "native_android"),
                    )
                    .put("platform", "android"),
            )

        enqueue(envelope)
        flush()
    }

    fun flush() {
        if (!initialized || !analyticsGranted()) return
        executor.execute {
            val queue = readQueue().toMutableList()
            if (queue.isEmpty()) return@execute

            val remaining = mutableListOf<JSONObject>()
            queue.forEach { event ->
                if (!postBlocking("/api/events/client/v1", event)) remaining.add(event)
            }
            writeQueue(remaining)
        }
    }

    private fun analyticsGranted(): Boolean = consent()["analytics"] == "granted"

    private fun persistentVisitorId(): String? =
        if (::prefs.isInitialized) prefs.getString(KEY_VISITOR, null) else null

    private fun enqueue(event: JSONObject) {
        val queue = readQueue().toMutableList()
        queue.add(event)
        writeQueue(queue.takeLast(100))
    }

    private fun readQueue(): List<JSONObject> {
        if (!::prefs.isInitialized) return emptyList()
        val raw = prefs.getString(KEY_QUEUE, null) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun writeQueue(queue: List<JSONObject>) {
        val array = JSONArray()
        queue.takeLast(100).forEach { array.put(it) }
        prefs.edit().putString(KEY_QUEUE, array.toString()).apply()
    }

    private fun post(path: String, body: JSONObject, callback: (Boolean) -> Unit) {
        executor.execute { callback(postBlocking(path, body)) }
    }

    private fun postBlocking(path: String, body: JSONObject): Boolean {
        return try {
            val endpoint = URL(config.baseUrl.trimEnd('/') + path)
            val connection = endpoint.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Salsys-Source-Key", config.sourceKey)
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            connection.disconnect()
            val ok = status in 200..299
            debug("POST $path -> $status")
            ok
        } catch (error: Exception) {
            debug("POST $path failed: ${error.message}")
            false
        }
    }

    private fun sanitizeMap(input: Map<String, Any?>): Map<String, Any?> {
        val forbidden = setOf(
            "email", "email_address", "phone", "phone_number", "mobile", "first_name",
            "last_name", "full_name", "name", "address", "street", "postal_code", "zip",
            "dob", "date_of_birth", "person_id", "lead_id", "customer_id", "user_id",
            "password", "authorization", "cookie", "secret", "token", "access_token",
            "refresh_token", "api_key", "ip", "ip_address",
        )
        return input.entries.take(100).associate { (rawKey, rawValue) ->
            val key = rawKey.take(120)
            key to if (key.lowercase() in forbidden) "[redacted]" else sanitizeValue(rawValue, 0)
        }
    }

    private fun sanitizeValue(value: Any?, depth: Int): Any? {
        if (depth > 6) return "[max_depth]"
        return when (value) {
            null, is Boolean, is Number -> value
            is String -> value.take(2000)
            is Map<*, *> -> sanitizeMap(
                value.entries
                    .filter { it.key is String }
                    .associate { it.key as String to it.value },
            )
            is Iterable<*> -> value.take(50).map { sanitizeValue(it, depth + 1) }
            else -> value.toString().take(1000)
        }
    }

    private fun requireInitialized() {
        check(initialized) { "Call Salsys.initialize(...) before using the SDK" }
    }

    private fun debug(message: String) {
        if (initialized && config.debug) android.util.Log.d("Salsys", message)
    }

    private fun randomId(prefix: String) = "${prefix}_${UUID.randomUUID()}"

    private fun isoNow(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
}
