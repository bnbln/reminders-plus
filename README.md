<div align="center">

<img src="docs/images/app-icon.png" width="144" height="144" alt="Reminders+ app icon">

# Reminders+

**One task a day. Tasks, routines and streaks in one calm app.**

[![App Store](https://img.shields.io/badge/App%20Store-Download-0068D9?logo=appstore&logoColor=white)](https://apps.apple.com/us/app/reminders/id6758573672)
![Version](https://img.shields.io/badge/Version-1.0.6-0068D9)
![Platform](https://img.shields.io/badge/iOS%20%C2%B7%20iPadOS-16.4%2B-000?logo=apple)
![Expo](https://img.shields.io/badge/Expo%20SDK-58-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=black)
![Languages](https://img.shields.io/badge/Languages-25-238A5D)
![Privacy](https://img.shields.io/badge/Tracking-none-238A5D)

[Website](https://github.com/bnbln/reminders-plus-landingpage) · [Widgets](docs/ios-widgets.md) · [Accessibility](docs/accessibility-ios.md) · [iPhone Duo](docs/iphone-duo.md) · [Open tasks](docs/offene-aufgaben.md) · [Development](#development)

</div>

## About

Reminders+ is a task and routine app built around consistency rather than endless to-do lists. The idea is simple: complete at least one task every day and watch your streak grow. Tasks, routines and projects live in a single list that you control with swipes and drag and drop. There is no account to create, and your data stays on your device.

### Features

- 🔥 **Daily streaks.** Completing one task a day keeps your streak alive, with an activity history, your personal best and your longest run.
- ✅ **Tasks and routines.** Due today, this week, or repeating anywhere from hourly to yearly, including weekdays or weekends only. Add a location, a project, an emoji style and notes.
- 👆 **Swipe and drag.** Swipe right to complete, swipe left to delete, and drag to reorder or move a task to another day.
- 🗂️ **Projects.** Group tasks by area of your life, with up to 4 projects for free.
- 🧩 **Widgets.** Your streak and “Today” on the Home Screen and Lock Screen, with tasks you can check off right from the widget.
- 📥 **Import from Apple apps.** Bring in reminders from Apple Reminders and events from Apple Calendar as tasks.
- 🎨 **Make it yours.** Light and dark mode, accent colors, and an app icon that matches the color you pick.
- 🌍 **25 languages.** Arabic, Chinese, Czech, Danish, Dutch, English, Finnish, French, German, Greek, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Romanian, Russian, Spanish, Swedish, Turkish, Ukrainian and Vietnamese.
- 📱 **iPhone, iPad and iPhone Duo.** Native tabs and navigation that adapt to every screen size.

### Reminders+ Plus

The app is free, and that includes streaks, routines, widgets and data export. Plus is available as a monthly subscription or a one-time lifetime purchase through the App Store, and adds:

- **AI assistant.** Create, find and reschedule tasks in plain language, powered on-device by Apple Intelligence (Foundation Models).
- **Unlimited projects** beyond the free 4.
- **iCloud sync** between iPhone and iPad through your own iCloud account.

### Privacy

No analytics, no ads, no account and no server of our own. Tasks are stored on the device, and the optional sync runs through CloudKit in the user’s own iCloud account. The privacy manifest declares no collected data. You can export all of your data as JSON at any time, free of charge.

---

## Development

### Requirements

- Node.js and npm
- Xcode with the iOS SDK, plus CocoaPods
- For Android: Android Studio (the Android build runs without the assistant and iCloud sync)

### Setup

```bash
npm install          # also applies the patches in patches/
npm run ios          # dev build in the Simulator
npm run ios:device   # dev build on a connected device
```

Other scripts: `npm start` (Metro), `npm run android`, `npm run lint`.

> [!IMPORTANT]
> Native settings such as iCloud entitlements, app icons and Pod settings come from the config plugins in `plugins/`. Don’t change them only in Xcode, because `expo prebuild` will reset them.

### iCloud sync (CloudKit)

Custom CloudKit record types must exist in the **Production** schema for TestFlight and App Store builds.

1. Run a dev build on a physical device and trigger Cloud Sync once to create the Development schema.
2. Open the CloudKit Dashboard for the container (`iCloud.<bundleIdentifier>`).
3. Deploy the `RemindsSyncSnapshot` record type and its fields from Development to Production.

If the Production schema is missing, the app falls back to the iCloud key-value store. It has a much smaller size limit and is meant only as a stopgap. Entitlements are managed by `plugins/with-ios-cloud-sync.js`.

### Project structure

| Path | Contents |
|---|---|
| `app/` | Screens built with Expo Router: `(tabs)/` (Today, Inbox, Projects in `explore/`, Routines, Search, Assistant), `task/` and `project/` (detail views and modals), `plus.tsx`, `settings.tsx`, `cloud-sync.tsx`, `assist.tsx` |
| `components/` | UI building blocks: the task list with swipe and drag (`tasks/`), navigation, search, settings, the streak celebration and widget sync |
| `context/` | State: tasks, settings, Plus, filters and the snackbar |
| `widgets/` | Streak and Today widgets built with `expo-widgets` ([docs](docs/ios-widgets.md)) |
| `modules/` | Custom native modules: `app-icon` (accent-colored icons) and `assist-llm` (Foundation Models) |
| `services/`, `storage/`, `notifications/` | iCloud sync, local storage and notifications |
| `i18n/locales/` | Translations for 25 languages |
| `plugins/` | Config plugins for iCloud, app icons, Pods and the Android app name |
| `patches/` | `patch-package` patches for third-party libraries |
| `docs/` | Concepts, audits and open tasks |

### Documentation

- [Open tasks](docs/offene-aufgaben.md)
- [iOS widgets](docs/ios-widgets.md)
- [Accessibility on iOS](docs/accessibility-ios.md)
- [iPhone Duo](docs/iphone-duo.md)
- [Upgrading to Expo 58 and iOS 27](docs/expo58-ios27-upgrade.md)
- [UX/UI schema](docs/reminds-ux-ui-schema.md)

---

<sub>The landing page lives in [bnbln/reminders-plus-landingpage](https://github.com/bnbln/reminders-plus-landingpage).</sub>
