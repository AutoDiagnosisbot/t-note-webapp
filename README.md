# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Android OTP autofill

The Android auth flow uses SMS Retriever API and does not request `READ_SMS` or `RECEIVE_SMS`.

For autofill to work, the verification SMS must include:

- a 6-digit code;
- the app hash on a separate line at the end of the message.

Example:

```text
<#> Your T-Note code is 123456
FA+9qCX9VSu
```

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## сборка проекта

npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease


npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease


cd d:\projects\t-note-webapp
npm run android:device:dev



$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:APP_VARIANT='dev'

npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease

## Android Dev APK

Use this command for a dev APK build:

```powershell
npm run android:apk:dev
```

It prepares `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` and recreates `android/local.properties` automatically before running `assembleRelease`.

Use this command for a prod APK build:

```powershell
npm run android:apk:prod
```
