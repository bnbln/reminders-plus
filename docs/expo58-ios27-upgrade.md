# Expo SDK 58 Beta und iOS 27.1

Stand: 19. September 2026. Lokaler Branch: `codex/expo58-ios27-duo`.
Es wurde nichts veröffentlicht oder gepusht.

## Basis

- Expo `58.0.0-preview.3`, React Native `0.88.0-rc.0`, React `19.2.3`.
- Die minimale iOS-Version steigt auf **16.4**. App und Pod-Ressourcen verwenden diese Grenze.
- CocoaPods bleibt aktiv; React Native und verfügbare Expo-Module werden vorkompiliert verwendet.
- Die Navigation verwendet die SDK-58-Exports von Expo Router. Bestehende Kalender-Aufrufe verwenden `expo-calendar/legacy`.
- Entfernte `StyleSheet.absoluteFillObject`-Aufrufe wurden durch `StyleSheet.absoluteFill` ersetzt.

SDK 58 führt den für das iOS-27-SDK benötigten Scene-Lifecycle ein:
[Beta-Ankündigung](https://expo.dev/changelog/sdk-58-beta),
[Scene-Migration](https://expo.fyi/ios-scene-lifecycle),
[Router-Migration](https://docs.expo.dev/router/migrate/sdk-57-to-58/).

## Native Anpassungen

`SceneDelegate.swift` erbt von `ExpoAppSceneDelegate`. Expo startet React Native im Fenster der Scene und übernimmt URL-Weiterleitung. Der AppDelegate liefert die React-Native-Factory und konfiguriert anschließend die vorhandenen Hintergrundfarben und die native Aufgaben-Zubehörleiste. Die bestehende CloudKit-Anbindung bleibt erhalten.

Der Podfile-Hook in `scripts/ios-pods-settings.rb` setzt auch Ressourcen-Targets auf mindestens 16.4. Die Hermes-Umschaltung läuft ausdrücklich bei jedem Build; sie prüft selbst die Build-Konfiguration. Die überprüften Xcode-27.1-Einstellungen sind im Hook hinterlegt. Der Config-Plugin `plugins/with-ios-pods-settings.js` hält den Hook bei einer Podfile-Generierung aufrecht.

Der vorhandene Patch für `@react-native-menu/menu` enthält zusätzlich den qualifizierten Import `<React/RCTBridge.h>`, der mit dem vorkompilierten React-Framework funktioniert.

**Der iOS-Ordner wird weiterhin gepflegt und eingecheckt.** Kein `expo prebuild --clean` auf diesem Checkout ausführen: Die umfangreichen eigenen AppDelegate-Anpassungen und deren Scene-Migration sind nicht vollständig durch Config-Plugins reproduzierbar. Das ist auch der verbleibende Config-Sync-Hinweis von Expo Doctor.

## Beta-Kompatibilität

`.npmrc` verwendet vorübergehend `legacy-peer-deps=true`: Die von Expo vorgegebene Reanimated-Version 4.6.0 schließt React Native 0.88 RC noch nicht in ihrer Peer-Spanne ein. Expo prüft die SDK-Versionen; der native Build wurde zusätzlich geprüft. Bei einer späteren Beta oder stabilen SDK-Version diese Ausnahme erneut prüfen.

`tsconfig.json` verwendet die von React Native angebotene Übergangsbedingung `react-native-legacy-deep-imports`, weil bestehende Bibliotheken noch ältere Typen verwenden. Diese Übergangslösung muss bei einem späteren React-Native-Upgrade entfernt werden.

## Installation und lokaler Build

```sh
npm ci
cd ios
pod install
cd ..
xcodebuild -workspace ios/reminds.xcworkspace -scheme reminds \
  -configuration Release \
  -destination 'platform=iOS Simulator,id=96867483-46CD-45A9-8601-5367AF0CB510' \
  -derivedDataPath /tmp/reminds-expo58-duo ONLY_ACTIVE_ARCH=YES build
```

**Simulator-Signierung eingeschaltet lassen.** Ein Test mit `CODE_SIGNING_ALLOWED=NO` stürzte beim Erzeugen des CloudKit-Containers ab, weil die simulierten iCloud-Entitlements fehlten. Der reguläre Simulator-Build enthält sie und startet erfolgreich.

## Verifiziert

- Release-Build mit Xcode 27.1 für den iPhone Duo unter iOS 27.1 erfolgreich.
- App installiert und gestartet; sichtbare Heute-Seite und Einstellungen über `reminds://settings` geprüft. Der Prozess blieb anschließend aktiv.
- TypeScript-Prüfung und `expo install --check` erfolgreich.
- iOS-JavaScript-Export erfolgreich; alle drei vorhandenen `patch-package`-Patches anwendbar.
- Die gemeldeten Deployment-Target- und Hermes-Ausgabe-Warnungen treten im finalen Build nicht mehr auf.
- Expo Doctor: 19 von 20 Prüfungen erfolgreich; verbleibender Hinweis betrifft den gepflegten nativen Ordner und App-Konfiguration.
- `npm run lint` bleibt mit **107 Fehlern und 61 Warnungen** offen. Die SDK-58-Lint-Konfiguration meldet unter anderem bestehende Ref-Zugriffe und synchrone State-Updates in Effects. Diese Codebereiche wurden durch das Upgrade nicht grundlegend umgebaut.

Lokale Screenshots: `.expo/qa/expo58-duo/home-ready.png` und `.expo/qa/expo58-duo/settings.png`.

## Noch zu prüfen

Der erfolgreiche Start ist keine vollständige Duo-Abnahme. Falten/Entfalten, Größenänderungen, Layout an den neuen Systemflächen, Task-Erstellung, Swipe/Drag-Gesten, Käufe, Kalender-Berechtigungen, tatsächlicher iCloud-Sync und ein physisches Gerät sind noch zu testen. Android wurde in diesem Upgrade nicht gebaut. Im Beta-Build bleiben Hinweise aus Abhängigkeiten bestehen, darunter die nicht unterstützte Accessibility-Rolle `search`.
