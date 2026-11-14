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
        versionCode = 21
        versionName = "0.13.1"
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
            // El APK que se publica es este (assembleRelease): no es de depuración, así que otra
            // app o una computadora por USB no pueden leer sus datos. Va firmado con la MISMA llave
            // con la que se han publicado todas las versiones (la de depuración de la computadora
            // donde se compila, ~/.android/debug.keystore): así se instala encima de la anterior
            // sin desinstalar. Sin ese archivo nadie puede publicar una actualización: hay que
            // guardar una copia. assembleDebug queda solo para probar en un teléfono.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    // La revisión "lint" de la versión publicable pide descargar otra herramienta; no se usa (así
    // el APK se compila también sin Internet, igual que el de depuración).
    lint {
        checkReleaseBuilds = false
    }
    compileOptions {
        // El núcleo compartido con el servidor usa Java 17 (records, switch, instanceof con patrón);
        // el "desugaring" trae a Android 7+ lo que le falta de la biblioteca de Java.
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    // La interfaz es la MISMA que sirve el servidor: se empaqueta tal cual desde el
    // proyecto web, así no hay dos interfaces que mantener.
    sourceSets {
        getByName("main") {
            assets.srcDir("../../app/src/main/resources/static")
            // El mismo núcleo que el servidor (modelo, CRDT y servicios): el teléfono puede ser el
            // servidor de la red con exactamente la misma lógica.
            java.srcDir("../../nucleo/src/main/java")
        }
    }
}

// Sin bibliotecas: Activity, WebView y el servidor propio usan solo lo que trae Android. Lo único
// extra es el "desugaring" de la biblioteca de Java (no agrega código de terceros a la app).
dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
