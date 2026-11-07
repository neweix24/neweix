package com.neweix.supreme.security

import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Base64

/**
 * Native transport for the server-issued Supreme Android attestation challenge.
 *
 * This only proves app/device-key possession to the attestation verifier. A
 * successful result is NOT a Supabase session, login, role grant, or dashboard
 * authorization. Password and AAL2 MFA remain separate mandatory gates.
 */
internal object SupremeAttestationClient {
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 25_000
    private const val MAX_RESPONSE_BYTES = 16 * 1024
    private const val MAX_CERTIFICATES = 10
    private const val ORIGIN = "https://neweix.com"

    data class Verification(
        val securityLevel: String,
        val provisioningMethod: String,
        val proofOfPossessionVerified: Boolean,
    )

    /**
     * Performs challenge issuance, hardware-backed key creation, and server
     * verification. Call from a worker thread; never from the Android UI thread.
     */
    fun verifyDevice(): Verification {
        check(Looper.myLooper() != Looper.getMainLooper()) {
            "Supreme attestation must run off the main thread."
        }

        val challengeResponse = postJson("/api/supreme/attestation/challenge", null)
        if (challengeResponse.first != HttpURLConnection.HTTP_OK) {
            throw IllegalStateException("Supreme device challenge could not be issued.")
        }

        val challengeJson = JSONObject(challengeResponse.second)
        check(challengeJson.optBoolean("success", false)) {
            "Supreme device challenge response was invalid."
        }

        val challengeId = challengeJson.optString("challenge_id")
        require(UUID_V4.matches(challengeId)) {
            "Supreme device challenge ID was invalid."
        }

        val challengeEncoded = challengeJson.optString("challenge")
        require(challengeEncoded.isNotEmpty() && challengeEncoded.length <= 64) {
            "Supreme device challenge was invalid."
        }
        val challenge = Base64.getUrlDecoder().decode(challengeEncoded)
        require(challenge.size == 32 &&
            Base64.getUrlEncoder().withoutPadding().encodeToString(challenge) == challengeEncoded
        ) {
            "Supreme device challenge was not canonical."
        }

        val material = SupremeKeyAttestation.create(challengeId, challenge)
        require(material.certificateChainBase64.size in 2..MAX_CERTIFICATES) {
            "This device did not provide a usable Android attestation chain."
        }

        val certificateArray = JSONArray()
        material.certificateChainBase64.forEach { certificateArray.put(it) }
        val verifyPayload = JSONObject()
            .put("challenge_id", challengeId)
            .put("challenge", challengeEncoded)
            .put("certificate_chain", certificateArray)
            .put("proof_signature", material.challengeProofBase64)

        val verificationResponse = postJson(
            "/api/supreme/attestation/verify",
            verifyPayload.toString().toByteArray(StandardCharsets.UTF_8),
        )
        if (verificationResponse.first != HttpURLConnection.HTTP_OK) {
            throw IllegalStateException(
                "Supreme device verification was rejected (HTTP ${verificationResponse.first}).",
            )
        }

        val result = JSONObject(verificationResponse.second)
        check(result.optBoolean("verified", false)) {
            "Supreme device verification was not confirmed."
        }
        check(result.optBoolean("proof_of_possession_verified", false)) {
            "Supreme device key possession was not confirmed."
        }

        return Verification(
            securityLevel = result.optString("security_level", "unknown"),
            provisioningMethod = result.optString("provisioning_method", "unknown"),
            proofOfPossessionVerified = true,
        )
    }

    private fun postJson(path: String, body: ByteArray?): Pair<Int, String> {
        val url = URL(ORIGIN + path)
        require(url.protocol == "https" && url.host == "neweix.com" && url.port == -1) {
            "Supreme attestation endpoint origin is invalid."
        }

        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = false
            useCaches = false
            doInput = true
            doOutput = body != null
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-store")
            if (body != null) {
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setFixedLengthStreamingMode(body.size)
            }
        }

        try {
            if (body != null) {
                connection.outputStream.use { output -> output.write(body) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                ?: throw IllegalStateException("Supreme attestation endpoint returned no response.")
            val response = stream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(2048)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    require(total <= MAX_RESPONSE_BYTES) {
                        "Supreme attestation response was too large."
                    }
                    output.write(buffer, 0, count)
                }
                output.toString(StandardCharsets.UTF_8.name())
            }
            return status to response
        } finally {
            connection.disconnect()
        }
    }

    private val UUID_V4 = Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    )
}
