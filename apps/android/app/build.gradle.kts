plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.qalarc.repswithfriends"
    compileSdk = 34

    defaultConfig {
        // NOTE: no .debug applicationIdSuffix — the phone install/launch path
        // expects the exact package com.qalarc.repswithfriends.
        applicationId = "com.qalarc.repswithfriends"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // No Compose, no AndroidX — a plain android.app.Activity + framework
    // Material dark theme + WebView keeps the dependency graph empty.
    buildFeatures { compose = false }
}

dependencies {
    // Deliberately empty: zero external deps => fastest, most reliable build.
}
