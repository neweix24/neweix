package com.neweix.supreme.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * Creates a fresh Android Keystore key whose certificate chain carries the
 * server-provided Android Key Attestation challenge.
 *
 * This class deliberately does not decide whether an attestation is trusted.
 * The certificate chain must be verified by the server against Google's roots,
 * current revocation data, the expected app identity, and the one-time challenge.
 */
internal object SupremeKeyAttestation {
    private const val KEY_ALIAS = "com.neweix.supreme.attestation.v1"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"

    data class Material(
        val certificateChainBase64: List<String>,
    )

    /**
     * Generates a non-exportable P-256 signing key and returns its attestation
     * chain in leaf-to-root order, DER encoded and Base64 wrapped.
     *
     * A fresh key is generated for each challenge so a certificate from an
     * earlier registration cannot be replayed as a response to a new challenge.
     */
    @Synchronized
    fun create(challenge: ByteArray): Material {
        require(challenge.size in 32..128) {
            "The server attestation challenge must contain 32 to 128 bytes."
        }

        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        keyStore.deleteEntry(KEY_ALIAS)

        try {
            val generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                ANDROID_KEYSTORE,
            )
            val spec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setAttestationChallenge(challenge.copyOf())
                .setUserAuthenticationRequired(false)
                .build()

            generator.initialize(spec)
            generator.generateKeyPair()

            val chain = keyStore.getCertificateChain(KEY_ALIAS)
                ?: error("Android did not return an attestation certificate chain.")

            require(chain.size >= 2) {
                "A verifiable hardware attestation certificate chain is unavailable on this device."
            }

            return Material(
                certificateChainBase64 = chain.map { certificate ->
                    Base64.getEncoder().encodeToString(certificate.encoded)
                },
            )
        } catch (error: Exception) {
            keyStore.deleteEntry(KEY_ALIAS)
            throw error
        }
    }

    /** Removes the local attestation key when a device registration is reset. */
    @Synchronized
    fun delete() {
        KeyStore.getInstance(ANDROID_KEYSTORE).apply {
            load(null)
            deleteEntry(KEY_ALIAS)
        }
    }
}
