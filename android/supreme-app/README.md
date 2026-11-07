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

## Build a production-signed release APK

The production keystore and passwords must remain under the owner's control and outside this repository. The build reads credentials only from environment variables; they are never written to source files, command-line arguments, build artifacts, or GitHub Actions.

Store the permanent production keystore somewhere outside the repository, for example `$HOME/.config/neweix/supreme/release.jks`, and restrict its filesystem permissions. Back up the keystore and passwords securely. Do not generate a new key for every release: Android updates must retain the same signing identity (or use a deliberately configured Play App Signing rotation).

Set these variables in your local shell without pasting the values into ChatGPT or committing them:

- `SUPREME_PRIVATE_PATH`: the private `/control-<48 hex>` path.
- `SUPREME_KEYSTORE_PATH`: absolute path to the external production keystore.
- `SUPREME_KEYSTORE_PASSWORD`: keystore password.
- `SUPREME_KEY_ALIAS`: production key alias.
- `SUPREME_KEY_PASSWORD`: key password.

Then run from the repository root:

```sh
bash scripts/security/build-supreme-release.sh
```

The script builds `android/supreme-app/app/build/outputs/apk/release/app-release.apk`, verifies its APK signature with Android `apksigner`, and prints the sole signer certificate's SHA-256 digest. The script refuses to use a keystore stored inside the repository. It does not upload the keystore or APK anywhere.

**Do not configure `SUPREME_ANDROID_SIGNING_CERT_SHA256` on Supabase from an unverified fingerprint.** Independently confirm that the release APK was signed by the permanent production key before adding the digest to the server allowlist. A debug signer is never acceptable.

## Security notes

- The app accepts only HTTPS navigation to `neweix.com` and `www.neweix.com`; other web links are handed to Android.
- File/content access and cleartext HTTP are disabled; TLS certificate errors are rejected.
- The private path is embedded in the APK at build time and can be extracted by someone reverse-engineering the APK. It is a discovery barrier only, not an authentication factor.
- The website must continue enforcing Supreme role authorization and AAL2 MFA on every protected page and API.
- Google OAuth and Cloudflare Turnstile behavior inside Android WebView still require device testing. Google may require external-browser OAuth handoff; do not treat this initial shell as release-ready until login and MFA flows are verified.
- Do not distribute a debug APK as a production release.

This project does not modify storefront routes or customer-facing navigation.

## Hardware-backed attestation client foundation

The Android app includes a native Android Keystore helper at `app/src/main/java/com/neweix/supreme/security/SupremeKeyAttestation.kt` and a native transport at `app/src/main/java/com/neweix/supreme/security/SupremeAttestationClient.kt`. The helper creates a fresh P-256 signing key for a server-provided, one-time challenge; the transport sends the leaf-first certificate chain and domain-separated proof of possession to the server verifier.

This client is not currently wired into login and does not grant access by itself. The server validates the complete chain against Google's current trust anchors, checks Google's revocation status, verifies the attestation challenge and `com.neweix.supreme` application identity (including the production signing-certificate digest), and enforces the hardware security and verified-boot policy. The native transport is a separate verification milestone, not a Supabase session.

Devices that cannot produce a qualifying attestation chain must not be silently downgraded to an unverified Supreme login once enforcement is enabled.

## Private Supreme-only navigation and temporary authentication lock

- The launcher opens only the private Supreme workspace entry. Main-frame navigation is restricted to the private workspace and the dedicated Supreme sign-in/MFA routes; storefront and shared customer/staff login routes are redirected back to the private entry.
- External web navigation is blocked inside the app. Telephone and email actions may still be handed to Android.
- Unauthenticated private-workspace requests are sent to `/auth/supreme-login`, not the shared staff login page.
- The shared `/auth/login` page rejects and signs out a Supreme role.
- **Supreme dashboard access is intentionally fail-closed (HTTP 503) until production signer identity, physical-device attestation, Supabase Edge Runtime validation, and attested-device session binding to the Supreme AAL2 session are complete.** The current private URL and WebView are not proof of an authentic app. Do not remove this lock based on User-Agent, package name, a custom header, or the private URL alone.
- The diamond emblem is the temporary app mark and can be replaced later without changing the application ID.

## Remote-first Supreme dashboard (permanent architecture requirement)

The Supreme Android app is a thin, stable native shell. All changeable dashboard experiences must be served by the NEWEIX web application on Cloudflare, not compiled into the APK.

### Changes that must not require an APK update

- Dashboard pages, layouts, navigation menus, cards, tables, forms, labels, icons delivered by the web app, and visual design.
- New or changed administrative workflows that can be implemented with the existing web platform and supported browser capabilities.
- Server-side business rules, feature availability, role/permission policy, dashboard configuration, and API-backed data.
- Remote feature flags and staged rollouts, provided authorization is enforced by the server for every protected operation.

After a Cloudflare deployment, the next app navigation/reload must load the current deployed Supreme web experience. The app should not bundle a second copy of dashboard pages or freeze feature definitions in native resources. Avoid long-lived WebView caches or service-worker caches that prevent deployed dashboard changes from appearing; provide a reliable refresh/revalidation strategy.

### Changes that may require an APK update

Only changes that genuinely need native Android capabilities or a change to the native shell may require a new APK—for example, Android Keystore/attestation implementation, native device permissions, WebView security/navigation policy, native push notifications, or a required Android SDK/target update.

### Security and compatibility rules

- Remote delivery does not bypass authentication: the server must enforce the Supreme role, AAL2 MFA, device authorization/attestation, and authorization on every API/action.
- Never implement security-critical permissions solely as hidden/disabled UI controls or client-side feature flags.
- Keep stable, versioned API contracts and backward-compatible server changes where possible, so a web deployment remains compatible with the installed shell.
- If a remote feature needs a new native bridge capability, the web app must detect shell capability/version and fail safely or show a clear minimum-app-version notice; do not silently assume the bridge exists.
- The native app must remain pinned to the approved NEWEIX origin and approved routes. Remote-first does not mean arbitrary remote URL or script execution.
- Cloudflare deployment updates the web-delivered experience; it does not automatically update the native APK binary.

**Acceptance criterion:** a dashboard-only feature or design change is implemented and deployed on Cloudflare and becomes available in the already-installed Supreme app after reload/reopen, with no APK rebuild or reinstall.
