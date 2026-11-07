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

val releaseKeystorePath = providers.environmentVariable("SUPREME_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("SUPREME_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("SUPREME_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("SUPREME_KEY_PASSWORD").orNull
val releaseBuildRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

if (releaseBuildRequested) {
    require(!releaseKeystorePath.isNullOrBlank() && file(releaseKeystorePath).isFile) {
        "Release builds require SUPREME_KEYSTORE_PATH pointing to an existing keystore outside the repository."
    }
    require(!releaseKeystorePassword.isNullOrBlank()) {
        "Release builds require SUPREME_KEYSTORE_PASSWORD in the environment."
    }
    require(!releaseKeyAlias.isNullOrBlank()) {
        "Release builds require SUPREME_KEY_ALIAS in the environment."
    }
    require(!releaseKeyPassword.isNullOrBlank()) {
        "Release builds require SUPREME_KEY_PASSWORD in the environment."
    }
    require(!file(releaseKeystorePath!!).canonicalPath.startsWith(rootProject.projectDir.canonicalPath + File.separator)) {
        "Keep the production keystore outside the repository working tree."
    }
}

android {
    namespace = "com.neweix.supreme"
    compileSdk = 35

    signingConfigs {
        create("production") {
            if (!releaseKeystorePath.isNullOrBlank()) {
                storeFile = file(releaseKeystorePath)
            }
            storePassword = releaseKeystorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }

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

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("production")
            isMinifyEnabled = false
        }
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
