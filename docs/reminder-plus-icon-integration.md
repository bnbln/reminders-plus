# Reminder+.icon Integration (Expo -> Xcode)

Diese Doku beschreibt exakt, wie `Reminder+.icon` in diesem Projekt eingebunden wurde und wie du es in einem anderen Expo-Projekt 1:1 replizierst.

## 1) Aktuelle Ist-Situation in diesem Repo

### Icon-Quellen
- Standard-Expo-Icon: `/Users/benediktschnupp/Dev/reminds/app.json:7`
  - `expo.icon = "./assets/images/icon.png"`
- Icon Composer Asset: `/Users/benediktschnupp/Dev/reminds/assets/Reminder+.icon/icon.json:1`
  - Zusätzliche Asset-Datei: `/Users/benediktschnupp/Dev/reminds/assets/Reminder+.icon/Assets/QQSubtract.svg`

### iOS-Zielartefakte (im generierten nativen Projekt)
- Kopiertes Icon Composer Bundle:
  - `/Users/benediktschnupp/Dev/reminds/ios/Reminder+.icon/icon.json:1`
  - `/Users/benediktschnupp/Dev/reminds/ios/Reminder+.icon/Assets/QQSubtract.svg`
- Xcode-Projekt-Referenzen:
  - `PBXFileReference` mit `lastKnownFileType = folder.iconcomposer.icon`:
    `/Users/benediktschnupp/Dev/reminds/ios/reminds.xcodeproj/project.pbxproj:32`
  - `Reminder+.icon` im App-Group-Tree:
    `/Users/benediktschnupp/Dev/reminds/ios/reminds.xcodeproj/project.pbxproj:59`
  - `Reminder+.icon in Resources`:
    `/Users/benediktschnupp/Dev/reminds/ios/reminds.xcodeproj/project.pbxproj:17`
    und `/Users/benediktschnupp/Dev/reminds/ios/reminds.xcodeproj/project.pbxproj:207`
  - App-Icon Name auf `Reminder+` gesetzt:
    `/Users/benediktschnupp/Dev/reminds/ios/reminds.xcodeproj/project.pbxproj:355`
    und `/Users/benediktschnupp/Dev/reminds/ios/reminds.xcodeproj/project.pbxproj:397`

### Wichtiger Hinweis zur Expo-Config
- In der aktuellen `app.json` ist das Custom-Plugin **nicht** registriert:
  `/Users/benediktschnupp/Dev/reminds/app.json:40`
- Das heißt: Die iOS-Einträge existieren aktuell im Repo, sind aber ohne Plugin nicht garantiert reproduzierbar bei `expo prebuild --clean`.

## 2) Mechanismus: Wie Expo es nach Xcode schreibt

Die eigentliche Expo->Xcode-Bruecke ist das Config Plugin:
- `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:1`

Das Plugin macht zwei Dinge:

1. Kopieren des `.icon`-Ordners in iOS
- Quelle:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:15`
- Ziel:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:16`
- Implementiert via `withDangerousMod`:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:11`

2. Patchen von `project.pbxproj`
- `PBXFileReference` mit Typ `folder.iconcomposer.icon`:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:39`
- `PBXBuildFile` fuer Resources:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:50`
- Einhaengen in Resource Build Phase:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:77`
- Setzen von `ASSETCATALOG_COMPILER_APPICON_NAME = "Reminder+"`:
  `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:96`
  und `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js:109`

## 3) 1:1 Replikation in anderem Expo-Projekt

## Schritt A: Dateien uebernehmen
- Kopiere den kompletten Ordner:
  - von: `/Users/benediktschnupp/Dev/reminds/assets/Reminder+.icon`
  - nach: `<dein-projekt>/assets/Reminder+.icon`
- Kopiere das Plugin:
  - von: `/Users/benediktschnupp/Dev/reminds/plugins/with-custom-icon.js`
  - nach: `<dein-projekt>/plugins/with-custom-icon.js`

## Schritt B: Plugin in Expo registrieren
In `<dein-projekt>/app.json` (oder `app.config.*`) unter `expo.plugins` ergaenzen:

```json
{
  "expo": {
    "plugins": [
      "./plugins/with-custom-icon"
    ]
  }
}
```

Wenn bereits Plugins vorhanden sind, nur den String zusaetzlich einfuegen.

## Schritt C: Native iOS-Dateien neu generieren
Im Zielprojekt:

```bash
npx expo prebuild --platform ios --clean
```

Danach wird erwartet:
- `<dein-projekt>/ios/Reminder+.icon/...` existiert
- `<dein-projekt>/ios/<app>.xcodeproj/project.pbxproj` enthaelt:
  - `Reminder+.icon`
  - `folder.iconcomposer.icon`
  - `ASSETCATALOG_COMPILER_APPICON_NAME = "Reminder+"`

## Schritt D: Verifikation

```bash
find ios -maxdepth 3 -name 'Reminder+.icon'
rg -n 'Reminder\\+\\.icon|folder\\.iconcomposer\\.icon|ASSETCATALOG_COMPILER_APPICON_NAME' ios/*.xcodeproj/project.pbxproj
```

## 4) Was parallel weiterhin gilt

- Das klassische Expo-Fallback-Icon (`expo.icon`) bleibt in `app.json` aktiv.
- In diesem Repo zeigt das native `AppIcon.appiconset` weiterhin auf PNG:
  `/Users/benediktschnupp/Dev/reminds/ios/reminds/Images.xcassets/AppIcon.appiconset/Contents.json:4`
- Fuer den exakten Nachbau von `Reminder+.icon` ist entscheidend, dass:
  1. der `.icon`-Ordner im iOS-Root liegt (`ios/Reminder+.icon`),
  2. `project.pbxproj` die Resource referenziert,
  3. `ASSETCATALOG_COMPILER_APPICON_NAME` auf `"Reminder+"` steht.
