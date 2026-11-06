import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/** Independent JDK X.509 field oracle for the Deno parser fixture tests. */
public final class ExtractX509OracleFixtures {
  private static final Base64.Encoder B64 = Base64.getEncoder();

  private static String b64(byte[] value) {
    return B64.encodeToString(value);
  }

  private static String json(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  private static byte[] unwrapOctet(byte[] value) throws IOException {
    if (value.length < 2 || (value[0] & 0xff) != 0x04) throw new IOException("Expected DER OCTET STRING");
    int offset = 1;
    int first = value[offset++] & 0xff;
    long length;
    if (first < 0x80) length = first;
    else {
      int count = first & 0x7f;
      if (count == 0 || count > 4 || offset + count > value.length) throw new IOException("Invalid DER length");
      if (value[offset] == 0) throw new IOException("Non-canonical DER length");
      length = 0;
      for (int i = 0; i < count; i++) length = (length << 8) | (value[offset++] & 0xff);
      if (length < 128) throw new IOException("Non-canonical DER length");
    }
    if (length != value.length - offset) throw new IOException("DER OCTET STRING length mismatch");
    return java.util.Arrays.copyOfRange(value, offset, value.length);
  }

  private static byte[] unsignedSerial(byte[] serial) {
    int offset = 0;
    while (offset < serial.length - 1 && serial[offset] == 0) offset++;
    return java.util.Arrays.copyOfRange(serial, offset, serial.length);
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
        Collection<? extends java.security.cert.Certificate> parsed;
        try (var input = Files.newInputStream(pem)) { parsed = factory.generateCertificates(input); }
        List<X509Certificate> chain = parsed.stream()
            .filter(X509Certificate.class::isInstance)
            .map(X509Certificate.class::cast)
            .toList();
        List<String> certs = new ArrayList<>();
        for (int certificateIndex = 0; certificateIndex < chain.size(); certificateIndex++) {
          X509Certificate cert = chain.get(certificateIndex);
          boolean signatureVerifiedByNext = false;
          if (certificateIndex + 1 < chain.size()) {
            try {
              cert.verify(chain.get(certificateIndex + 1).getPublicKey());
              signatureVerifiedByNext = true;
            } catch (Exception ignored) {
              signatureVerifiedByNext = false;
            }
          }
          byte[] signatureParameters = cert.getSigAlgParams();
          String signatureParametersJson = signatureParameters == null ? "null" : "\"" + b64(signatureParameters) + "\"";
          List<String> extensions = new ArrayList<>();
          var critical = cert.getCriticalExtensionOIDs();
          var nonCritical = cert.getNonCriticalExtensionOIDs();
          if (critical != null) for (String oid : critical) {
            byte[] value = cert.getExtensionValue(oid);
            extensions.add(String.format("{\"oid\":\"%s\",\"critical\":true,\"value\":\"%s\"}", oid, b64(unwrapOctet(value))));
          }
          if (nonCritical != null) for (String oid : nonCritical) {
            byte[] value = cert.getExtensionValue(oid);
            extensions.add(String.format("{\"oid\":\"%s\",\"critical\":false,\"value\":\"%s\"}", oid, b64(unwrapOctet(value))));
          }
          String extensionJson = "[" + String.join(",", extensions) + "]";
          byte[] serial = unsignedSerial(cert.getSerialNumber().toByteArray());
          certs.add(String.format(
              "{\"tbs\":\"%s\",\"serial\":\"%s\",\"signatureAlgorithmOid\":\"%s\",\"signatureAlgorithmParameters\":%s,\"signatureVerifiedByNext\":%s,\"issuer\":\"%s\",\"subject\":\"%s\",\"spki\":\"%s\",\"signature\":\"%s\",\"extensions\":%s}",
              b64(cert.getTBSCertificate()), b64(serial), cert.getSigAlgOID(), signatureParametersJson,
              signatureVerifiedByNext, b64(cert.getIssuerX500Principal().getEncoded()),
              b64(cert.getSubjectX500Principal().getEncoded()), b64(cert.getPublicKey().getEncoded()),
              b64(cert.getSignature()), extensionJson));
        }
        if (certs.isEmpty()) throw new IllegalStateException("No X.509 certs in " + pem);
        String source = json(root.relativize(pem).toString().replace('\\', '/'));
        records.add(String.format("{\"source\":\"%s\",\"certificates\":[%s]}", source, String.join(",", certs)));
      }
    }
    if (records.isEmpty()) throw new IllegalStateException("No X.509 fixtures found.");
    Files.createDirectories(output.getParent());
    Files.writeString(output, "[" + String.join(",", records) + "]\n");
    System.out.println("Extracted JDK X.509 oracle values for " + records.size() + " Android chains.");
  }
}
