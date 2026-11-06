import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Extracts the inner Android KeyDescription DER from upstream PEM fixtures.
 * This is a fixture adapter only; it performs no certificate trust validation.
 */
public final class ExtractAndroidAttestationFixtures {
  private static final String OID = "1.3.6.1.4.1.11129.2.1.17";

  private static byte[] unwrapOctetString(byte[] encoded) throws IOException {
    if (encoded.length < 2 || (encoded[0] & 0xff) != 0x04) {
      throw new IOException("X.509 extension is not a DER OCTET STRING");
    }
    int offset = 1;
    int first = encoded[offset++] & 0xff;
    long length;
    if (first < 0x80) {
      length = first;
    } else {
      int count = first & 0x7f;
      if (count == 0 || count > 4 || offset + count > encoded.length) {
        throw new IOException("Invalid DER OCTET STRING length");
      }
      if (encoded[offset] == 0) throw new IOException("Non-canonical DER length");
      length = 0;
      for (int i = 0; i < count; i++) length = (length << 8) | (encoded[offset++] & 0xff);
      if (length < 0x80) throw new IOException("Non-canonical DER length");
    }
    if (length != encoded.length - offset) throw new IOException("DER OCTET STRING length mismatch");
    return java.util.Arrays.copyOfRange(encoded, offset, encoded.length);
  }

  private static String jsonEscape(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 2) throw new IllegalArgumentException("Usage: <upstream-root> <output-json>");
    Path root = Path.of(args[0]).toAbsolutePath().normalize();
    Path output = Path.of(args[1]).toAbsolutePath().normalize();
    CertificateFactory factory = CertificateFactory.getInstance("X.509");
    List<String> records = new ArrayList<>();

    try (Stream<Path> paths = Files.walk(root.resolve("testdata"))) {
      for (Path pem : paths.filter(p -> p.toString().endsWith(".pem"))
          .filter(p -> p.toString().matches(".*testdata/[^/]+/sdk[0-9]+/[^/]+\\.pem$"))
          .sorted(Comparator.naturalOrder()).toList()) {
        Collection<? extends Certificate> certificates;
        try (var input = Files.newInputStream(pem)) {
          certificates = factory.generateCertificates(input);
        }
        List<X509Certificate> x509Certificates = certificates.stream()
            .filter(X509Certificate.class::isInstance)
            .map(X509Certificate.class::cast)
            .toList();
        if (x509Certificates.isEmpty()) {
          throw new IllegalStateException("No X.509 certificates in " + pem);
        }
        X509Certificate leaf = x509Certificates.get(0);
        byte[] extension = leaf.getExtensionValue(OID);
        if (extension == null) {
          throw new IllegalStateException("Leaf certificate is missing Android attestation extension: " + pem);
        }
        for (int index = 1; index < x509Certificates.size(); index++) {
          if (x509Certificates.get(index).getExtensionValue(OID) != null) {
            throw new IllegalStateException("Non-leaf certificate contains an unexpected Android attestation extension: " + pem);
          }
        }
        byte[] innerDer = unwrapOctetString(extension);
        String source = root.relativize(pem).toString().replace('\\\\', '/');
        records.add("{\\"source\\":\\"" + jsonEscape(source) + "\\",\\"certificateIndex\\":0,\\"derBase64\\":\\"" + Base64.getEncoder().encodeToString(innerDer) + "\\"}");
      }
    }

    if (records.isEmpty()) throw new IllegalStateException("No Android key-attestation extensions found in upstream fixtures.");
    Files.createDirectories(output.getParent());
    Files.writeString(output, "[" + String.join(",", records) + "]\n");
    System.out.println("Extracted " + records.size() + " real Android KeyDescription fixture(s).");
  }
}
