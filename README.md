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

## iOS Cloud Sync (CloudKit)

CloudKit custom record types must exist in the **Production** schema for TestFlight/App Store builds.

1. Run a dev build on a real device and trigger Cloud Sync once to create the development schema.
2. Open CloudKit Dashboard for your container (`iCloud.<bundleIdentifier>`).
3. Deploy record type `RemindsSyncSnapshot` (and its fields) from Development to Production.

If Production schema is missing, the app now falls back to iCloud key-value sync so devices can still exchange snapshots. This fallback has a stricter payload limit than CloudKit and should be treated as temporary until the schema is deployed.

Important: iCloud entitlements are managed via `plugins/with-ios-cloud-sync.js` (CloudKit container + iCloud key-value store identifier). Do not rely on manual Xcode capability toggles only, because they can be reset by `expo prebuild`.

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

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
