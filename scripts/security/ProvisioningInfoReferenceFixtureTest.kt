package com.android.keyattestation.verifier

import java.io.File
import java.io.FileInputStream
import java.nio.file.Files
import java.nio.file.Path
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs inside the pinned Google verifier project so expected RKP values come
 * from its own ProvisioningInfoMap parser, not from a second local CBOR parser.
 */
class ProvisioningInfoReferenceFixtureTest {
  @Test
  fun extractProvisioningInfoUsingUpstreamModel() {
    val root = File(System.getenv("SUPREME_UPSTREAM_TESTDATA") ?: error("Missing testdata root"))
    val output = Path.of(System.getenv("SUPREME_RKP_EXPECTED_INDEX") ?: error("Missing output path"))
    val factory = CertificateFactory.getInstance("X.509")
    val records = mutableListOf<String>()

    root.walkTopDown().filter { it.isFile && it.extension == "pem" }.forEach { pem ->
      val certificates = FileInputStream(pem).use { stream ->
        factory.generateCertificates(stream).filterIsInstance<X509Certificate>()
      }
      if (certificates.size < 2) return@forEach
      val attestationCertificate = certificates[1]
      if (attestationCertificate.getExtensionValue(ProvisioningInfoMap.OID.id) == null) return@forEach

      val parsed = ProvisioningInfoMap.parseFrom(attestationCertificate)
      val relative = root.toPath().relativize(pem.toPath()).toString().replace(File.separatorChar, '/')
      records += """{"source":"$relative","certificatesIssued":${parsed.certificatesIssued}}"""
    }

    assertTrue("Expected at least one real RKP provisioning extension", records.isNotEmpty())
    Files.writeString(output, records.joinToString(prefix = "[", postfix = "]"))
  }
}
