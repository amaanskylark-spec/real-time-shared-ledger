# Money Tracker APK Build Guide

This project is prepared for Android APK packaging with Capacitor.

## 1) Build the web app

```bash
npm install
npm run build
```

## 2) Create the Android wrapper (first time only)

```bash
npx cap add android
```

## 3) Sync the latest web build into Android

```bash
npx cap sync android
```

## 4) Open Android Studio

```bash
npx cap open android
```

## 5) Generate the APK in Android Studio

Use one of these:
- **Build > Build Bundle(s) / APK(s) > Build APK(s)**
- or **Build > Generate Signed Bundle / APK** for a production APK

## Output location

Typical debug APK path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Typical release APK path:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Notes

- Firebase web SDK will continue to work inside the Capacitor WebView.
- If Google Sign-In requires a native Android setup later, that can be added separately.
- If you change the web app, rerun:

```bash
npm run build
npx cap sync android
```
