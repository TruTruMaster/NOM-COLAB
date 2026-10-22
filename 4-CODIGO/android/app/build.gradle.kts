plugins {
    id("com.android.application")
}

android {
    namespace = "mx.wack.nom.android"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "mx.wack.nom"
        // Requerimientos de software: Android 7 (API 24) en adelante.
        minSdk = 24
        targetSdk = 37
        versionCode = 3
        versionName = "0.3.0"
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    // La interfaz es la MISMA que sirve el servidor: se empaqueta tal cual desde el
    // proyecto web, así no hay dos interfaces que mantener.
    sourceSets {
        getByName("main") {
            assets.srcDir("../../app/src/main/resources/static")
        }
    }
}

// Sin dependencias: Activity y WebView del sistema bastan (APK ligera).
