# NEWEIX Supreme Android app

This Android app is a native shell around the existing Supreme workspace. It loads the existing website UI and keeps authentication, role checks, and MFA on the server. It does not create a second admin backend.

## Build requirements

- Android Studio with JDK 17 and Android SDK Platform 35, or a compatible Android Gradle environment.
- The private Supreme path configured on the Cloudflare Worker as `SUPREME_PRIVATE_PATH`.
- The same path supplied only to the local build environment; never commit it.

The path must match `/control-` followed by exactly 48 hexadecimal characters.

## Build a debug APK

From this directory, provide the secret without putting it in source control:

```sh
export SUPREME_PRIVATE_PATH='/control-<your-48-hex-character-secret>'
./gradlew :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

If you prefer not to export an environment variable, pass it as a Gradle property:

```sh
./gradlew :app:assembleDebug -PsupremePrivatePath='/control-<your-48-hex-character-secret>'
```

## Security notes

- The app accepts only HTTPS navigation to `neweix.com` and `www.neweix.com`; other web links are handed to Android.
- File/content access and cleartext HTTP are disabled; TLS certificate errors are rejected.
- The private path is embedded in the APK at build time and can be extracted by someone reverse-engineering the APK. It is a discovery barrier only, not an authentication factor.
- The website must continue enforcing Supreme role authorization and AAL2 MFA on every protected page and API.
- Google OAuth and Cloudflare Turnstile behavior inside Android WebView still require device testing. Google may require external-browser OAuth handoff; do not treat this initial shell as release-ready until login and MFA flows are verified.
- Do not distribute this debug APK as a production release.

This project does not modify storefront routes or customer-facing navigation.
