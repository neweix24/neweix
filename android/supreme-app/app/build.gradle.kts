plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val supremePrivatePath = providers.gradleProperty("supremePrivatePath")
    .orElse(providers.environmentVariable("SUPREME_PRIVATE_PATH"))
    .orNull
    ?: ""

require(Regex("^/control-[A-Fa-f0-9]{48}$").matches(supremePrivatePath)) {
    "Set SUPREME_PRIVATE_PATH (or -PsupremePrivatePath) to the private /control-<48 hex chars> path before building."
}

android {
    namespace = "com.neweix.supreme"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.neweix.supreme"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1"

        buildConfigField("String", "SITE_ORIGIN", "\"https://neweix.com\"")
        buildConfigField("String", "SUPREME_PRIVATE_PATH", "\"$supremePrivatePath\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.biometric:biometric:1.1.0")
}
