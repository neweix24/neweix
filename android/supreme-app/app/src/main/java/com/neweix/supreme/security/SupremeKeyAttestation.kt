package com.neweix.supreme.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * Creates a fresh Android Keystore key whose certificate chain carries the
 * server-provided Android Key Attestation challenge.
 *
 * This class deliberately does not decide whether an attestation is trusted.
 * The certificate chain and proof signature must be verified by the server
 * against Google's roots, current revocation data, app identity and challenge.
 */
internal object SupremeKeyAttestation {
    private const val KEY_ALIAS = "com.neweix.supreme.attestation.v1"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val PROOF_DOMAIN = "NEWEIX-SUPREME-ATTESTATION-V1"

    data class Material(
        val certificateChainBase64: List<String>,
        val challengeProofBase64: String,
    )

    /**
     * Generates a non-exportable P-256 signing key and returns its attestation
     * chain in leaf-to-root order, plus a signature proving possession of the
     * attested private key for this exact server challenge.
     *
     * The proof payload is UTF-8:
     *   NEWEIX-SUPREME-ATTESTATION-V1\n<challenge UUID>\n<base64url challenge>
     *
     * The signature is SHA256withECDSA (ASN.1 DER encoded).
     */
    @Synchronized
    fun create(challengeId: String, challenge: ByteArray): Material {
        require(Regex("^[0-9a-fA-F-]{36}$").matches(challengeId)) {
            "The server attestation challenge ID is invalid."
        }
        require(challenge.size == 32) {
            "The server attestation challenge must contain exactly 32 bytes."
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

            val challengeEncoded = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(challenge)
            val proofPayload = "$PROOF_DOMAIN\n$challengeId\n$challengeEncoded"
                .toByteArray(StandardCharsets.UTF_8)

            val privateKey = keyStore.getKey(KEY_ALIAS, null) as? java.security.PrivateKey
                ?: error("Android Keystore did not return the attestation private key.")
            val signer = Signature.getInstance("SHA256withECDSA")
            signer.initSign(privateKey)
            signer.update(proofPayload)
            val proof = signer.sign()

            return Material(
                certificateChainBase64 = chain.map { certificate ->
                    Base64.getEncoder().encodeToString(certificate.encoded)
                },
                challengeProofBase64 = Base64.getEncoder().encodeToString(proof),
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
