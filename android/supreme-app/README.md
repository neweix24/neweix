# NEWEIX Supreme Android app

This Android app is a native shell around the existing Supreme workspace. It loads the existing website UI and keeps authentication, role checks, and MFA on the server. It does not create a second admin backend.

## Build requirements

- Android Studio with JDK 17 and Android SDK Platform 35, or Gradle 8.9+ with the Android SDK installed. Open this directory in Android Studio if Gradle is not installed on your device.
- The private Supreme path configured on the Cloudflare Worker as `SUPREME_PRIVATE_PATH`.
- The same path supplied only to the local build environment; never commit it.

The path must match `/control-` followed by exactly 48 hexadecimal characters.

## Build a debug APK

From this directory, provide the secret without putting it in source control:

```sh
export SUPREME_PRIVATE_PATH='/control-<your-48-hex-character-secret>'
gradle :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

If you prefer not to export an environment variable, pass it as a Gradle property:

```sh
gradle :app:assembleDebug -PsupremePrivatePath='/control-<your-48-hex-character-secret>'
```

## Security notes

- The app accepts only HTTPS navigation to `neweix.com` and `www.neweix.com`; other web links are handed to Android.
- File/content access and cleartext HTTP are disabled; TLS certificate errors are rejected.
- The private path is embedded in the APK at build time and can be extracted by someone reverse-engineering the APK. It is a discovery barrier only, not an authentication factor.
- The website must continue enforcing Supreme role authorization and AAL2 MFA on every protected page and API.
- Google OAuth and Cloudflare Turnstile behavior inside Android WebView still require device testing. Google may require external-browser OAuth handoff; do not treat this initial shell as release-ready until login and MFA flows are verified.
- Do not distribute this debug APK as a production release.

This project does not modify storefront routes or customer-facing navigation.

## Hardware-backed attestation client foundation

The Android app includes a native Android Keystore helper at `app/src/main/java/com/neweix/supreme/security/SupremeKeyAttestation.kt`. It creates a fresh P-256 signing key for a server-provided, one-time challenge and returns the certificate chain in leaf-to-root DER/Base64 form.

This is only the Android-side key-generation primitive. It is not currently wired into login and does not grant access by itself. The server must validate the complete chain against Google's current trust anchors, check Google's revocation status, verify the attestation challenge and `com.neweix.supreme` application identity (including the production signing-certificate digest), and enforce the required hardware security and verified-boot policy. Until that verifier and its replay-resistant challenge store are deployed and tested, existing server-side role and MFA checks remain authoritative.

Devices that cannot produce a qualifying attestation chain must not be silently downgraded to an unverified Supreme login once enforcement is enabled.


## Private Supreme-only navigation and temporary authentication lock

- The launcher opens only the private Supreme workspace entry. Main-frame navigation is restricted to the private workspace and the dedicated Supreme sign-in/MFA routes; storefront and shared customer/staff login routes are redirected back to the private entry.
- External web navigation is blocked inside the app. Telephone and email actions may still be handed to Android.
- Unauthenticated private-workspace requests are sent to `/auth/supreme-login`, not the shared staff login page.
- The shared `/auth/login` page rejects and signs out a Supreme role.
- **Supreme dashboard access is intentionally fail-closed (HTTP 503) until the complete server-side Android Key Attestation verifier is integrated.** The current private URL and WebView are not proof of an authentic app. Do not remove this lock based on User-Agent, package name, a custom header, or the private URL alone.
- The diamond emblem is the temporary app mark and can be replaced later without changing the application ID.
