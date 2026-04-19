#!/bin/bash

# Build APK Script for Dex Scanner
echo "Step 1: Installing dependencies..."
npm install
echo "Step 2: Building web app..."
npm run build
echo "Step 3: Initializing Capacitor..."
npx cap init dex-scanner com.example.dexscanner || true
npx cap add android || true
echo "Step 4: Copying files to Android..."
npx cap copy android
echo "Step 5: Building APK..."
cd android
./gradlew assembleDebug
echo "✅ APK built successfully!"
echo "📱 APK location: android/app/build/outputs/apk/debug/app-debug.apk"