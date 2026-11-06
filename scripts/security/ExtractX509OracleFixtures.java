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


  private record Tlv(int tag, int start, int contentStart, int end) {}

  private static Tlv readTlv(byte[] der, int start, int boundary) throws IOException {
    if (start >= boundary) throw new IOException("Truncated DER tag");
    int tag = der[start] & 0xff;
    if ((tag & 0x1f) == 0x1f) throw new IOException("High-tag DER not expected in X.509 envelope");
    int offset = start + 1;
    if (offset >= boundary) throw new IOException("Truncated DER length");
    int first = der[offset++] & 0xff;
    long length;
    if (first < 0x80) length = first;
    else {
      int count = first & 0x7f;
      if (count == 0 || count > 4 || offset + count > boundary) throw new IOException("Invalid DER length");
      if (der[offset] == 0) throw new IOException("Non-canonical DER length");
      length = 0;
      for (int i = 0; i < count; i++) length = (length << 8) | (der[offset++] & 0xff);
      if (length < 128) throw new IOException("Non-canonical DER length");
    }
    long end = offset + length;
    if (end > boundary || end > Integer.MAX_VALUE) throw new IOException("DER value exceeds boundary");
    return new Tlv(tag, start, offset, (int) end);
  }

  private static List<Tlv> children(byte[] der, Tlv parent) throws IOException {
    List<Tlv> result = new ArrayList<>();
    int offset = parent.contentStart();
    while (offset < parent.end()) {
      Tlv child = readTlv(der, offset, parent.end());
      result.add(child);
      offset = child.end();
    }
    if (offset != parent.end()) throw new IOException("Malformed DER constructed value");
    return result;
  }

  private static String algorithmParameters(byte[] der, Tlv algorithm) throws IOException {
    if (algorithm.tag() != 0x30) throw new IOException("Expected AlgorithmIdentifier SEQUENCE");
    List<Tlv> fields = children(der, algorithm);
    if (fields.isEmpty() || fields.size() > 2 || fields.get(0).tag() != 0x06) {
      throw new IOException("Malformed AlgorithmIdentifier");
    }
    if (fields.size() == 1) return "null";
    Tlv parameter = fields.get(1);
    return "\"" + b64(java.util.Arrays.copyOfRange(der, parameter.start(), parameter.end())) + "\"";
  }

  private static String exactAlgorithmParameters(X509Certificate certificate, boolean inner) throws Exception {
    byte[] encoded = certificate.getEncoded();
    Tlv root = readTlv(encoded, 0, encoded.length);
    List<Tlv> certificateFields = children(encoded, root);
    if (root.tag() != 0x30 || certificateFields.size() != 3) throw new IOException("Malformed Certificate");
    if (!inner) return algorithmParameters(encoded, certificateFields.get(1));
    Tlv tbs = certificateFields.get(0);
    List<Tlv> tbsFields = children(encoded, tbs);
    int index = tbsFields.get(0).tag() == 0xa0 ? 1 : 0;
    index++; // serialNumber
    return algorithmParameters(encoded, tbsFields.get(index));
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
          String outerSignatureParametersJson = exactAlgorithmParameters(cert, false);
          String innerSignatureParametersJson = exactAlgorithmParameters(cert, true);
          if (!outerSignatureParametersJson.equals(innerSignatureParametersJson)) {
            throw new IllegalStateException("Inner/outer signature AlgorithmIdentifier parameters differ in " + pem);
          }
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
              "{\"tbs\":\"%s\",\"serial\":\"%s\",\"signatureAlgorithmOid\":\"%s\",\"outerSignatureAlgorithmParameters\":%s,\"innerSignatureAlgorithmParameters\":%s,\"signatureVerifiedByNext\":%s,\"issuer\":\"%s\",\"subject\":\"%s\",\"spki\":\"%s\",\"signature\":\"%s\",\"extensions\":%s}",
              b64(cert.getTBSCertificate()), b64(serial), cert.getSigAlgOID(), outerSignatureParametersJson,
              innerSignatureParametersJson, signatureVerifiedByNext, b64(cert.getIssuerX500Principal().getEncoded()),
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
