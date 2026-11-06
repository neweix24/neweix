package com.android.keyattestation.verifier

import com.android.keyattestation.verifier.provider.KeyAttestationCertPath
import com.android.keyattestation.verifier.provider.KeyAttestationProvider
import com.android.keyattestation.verifier.provider.RevocationChecker
import com.android.keyattestation.verifier.testing.CertLists
import com.android.keyattestation.verifier.testing.Certs
import com.android.keyattestation.verifier.testing.Chains
import com.android.keyattestation.verifier.testing.FakeCalendar
import java.nio.file.Files
import java.nio.file.Path
import java.security.Security
import java.security.cert.CertPathValidator
import java.security.cert.PKIXParameters
import java.util.Base64
import java.util.Date
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Exports path-policy decisions from the pinned Google implementation together
 * with exact DER certificates, including synthetic validity edge cases.
 */
class PathPolicyReferenceFixtureTest {
  private data class Fixture(
    val name: String,
    val certificates: List<java.security.cert.X509Certificate>,
  )

  @Test
  fun exportPinnedPathPolicyFixtures() {
    val output = Path.of(
      System.getenv("SUPREME_PATH_POLICY_FIXTURE_INDEX")
        ?: error("Missing SUPREME_PATH_POLICY_FIXTURE_INDEX"),
    )
    Security.addProvider(KeyAttestationProvider())

    val fixtures = listOf(
      Fixture("factory_valid", CertLists.validFactoryProvisioned),
      Fixture("rkp_valid", CertLists.validRemotelyProvisioned),
      Fixture("factory_expired_intermediate_and_attestation", Chains.expiredFactoryProvisioned.certificatesWithAnchor),
      Fixture("rkp_expired_attestation", Chains.expiredRemotelyProvisioned.certificatesWithAnchor),
      Fixture("rkp_malformed_provisioning_info", CertLists.malformedProvisioningInfo),
      Fixture("expired_leaf", Chains.expiredLeaf.certificatesWithAnchor),
      Fixture("not_yet_valid_attestation", Chains.notYetValid.certificatesWithAnchor),
    )

    val referenceDate = Date.from(FakeCalendar.DEFAULT.now())
    val records = fixtures.map { fixture ->
      val path = KeyAttestationCertPath(fixture.certificates)
      val pathValid = try {
        val parameters = PKIXParameters(setOf(Certs.rootAnchor)).apply {
          date = referenceDate
          addCertPathChecker(RevocationChecker(emptySet()))
        }
        CertPathValidator.getInstance("KeyAttestation").validate(path, parameters)
        true
      } catch (_: java.security.cert.CertPathValidatorException) {
        false
      }

      val expectedProvisioningMethod = path.provisioningMethod().name
      val provisioningInfo = try {
        if (expectedProvisioningMethod == "REMOTELY_PROVISIONED") {
          com.android.keyattestation.verifier.ProvisioningInfoMap.parseFrom(path.attestationCert())
        } else {
          null
        }
      } catch (_: Exception) {
        null
      }
      val provisioningInfoValid =
        expectedProvisioningMethod != "REMOTELY_PROVISIONED" || provisioningInfo != null
      val valid = pathValid && provisioningInfoValid
      val chain = fixture.certificates.joinToString(",") { certificate ->
        "\"" + Base64.getEncoder().encodeToString(certificate.encoded) + "\""
      }
      val trustAnchor = Base64.getEncoder().encodeToString(Certs.root.encoded)
      assertEquals("Expected chain to terminate in the generated test root", Certs.root, fixture.certificates.last())
      val provisioningCount = provisioningInfo?.certificatesIssued?.toString() ?: "null"
      """{"name":"${fixture.name}","provisioningMethod":"${expectedProvisioningMethod}","valid":$valid,"provisioningInfoValid":$provisioningInfoValid,"provisioningCertificatesIssued":$provisioningCount,"validationTimeMs":${referenceDate.time},"certificatesBase64":[$chain],"trustAnchorBase64":"$trustAnchor"}"""
    }

    check(records.size == fixtures.size)
    Files.createDirectories(output.toAbsolutePath().parent)
    Files.writeString(output, records.joinToString(prefix = "[", postfix = "]", separator = ",") + "\n")
  }
}
