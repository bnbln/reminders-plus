# Expo SDK 58 Beta und iOS 27.1

Historischer Stand: 19. September 2026. Aktualisierung vom 3. Oktober unten. Lokaler Branch: `codex/expo58-ios27-duo`.
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


## Aktualisierung 3. Oktober 2026

Expo auf 58.0.3 und alle durch `bundledNativeModules.json` vorgegebenen Pakete gemeinsam aktualisiert: React 19.3.0, React Native 0.88.0-rc.3, Router ~58.0.13, UI und Widgets ~58.0.12, Screens ~4.28.0, Reanimated 4.7.0 und Worklets 0.13.0. `package.json`, npm-Lockfile und Pods-Lockfile wurden gemeinsam aktualisiert. Kein Clean-Prebuild; eigene iOS-Integration erhalten.

Der Widget-Persistenzpatch ist auf `patches/expo-widgets+58.0.12.patch` übertragen: atomare App-Group-Dateien mit UserDefaults-Fallback. Upstream nutzt weiter UserDefaults, daher bleibt der Patch nötig. Alle vier Patches lassen sich mit `npx patch-package --error-on-fail` anwenden. Eine neue Frame-Überladung in Expo UI erforderte getrennte Breiten-/Höhenmodifikatoren im Streak-Widget.

`legacy-peer-deps=true` bleibt nötig: ein Installations-Dry-Run ohne Ausnahme scheitert an der React-Native-Prerelease-Version in der Peer-Auflösung, unter anderem bei `@react-native-ai/apple`. Die TypeScript-Bedingung `react-native-legacy-deep-imports` bleibt wegen bestehender Bibliothekstypen nötig; Entfernen wurde geprüft und nicht übernommen. Der alte Metro-Prozess wurde mit `--clear` neu gestartet. Ein alter Development Client benötigt wegen der geänderten nativen Worklets-Version einen Neubuild; Cache-Leeren allein ersetzt diesen nicht.

Prüfung: Expo-Abhängigkeiten aktuell; TypeScript erfolgreich; iOS-/Android-JS-Export erfolgreich; Release-iOS-Build einschließlich Widget-Target erfolgreich. Expo Doctor besteht 19 von 20 Prüfungen: die verbleibende Warnung betrifft die bewusst manuell gepflegte native Konfiguration. Vollständiger Repository-Lint hat bekannte Altbefunde; gezielter Lint der neuen Workspace-Dateien hat keine Fehler. Simulator-Details siehe [task-split-view-implementation.md](task-split-view-implementation.md).

58.0.3 liegt bei npm unter `next`, während `latest` weiterhin 57.0.26 ist (live geprüft am 3. Oktober). React Native bleibt RC. Dieses Update wird deshalb nicht als vollständig stabile SDK-Kombination bezeichnet.

## Aktualisierung 16. Oktober 2026: offizieller Release

Expo SDK 58 wurde am 15. Oktober veröffentlicht. Die final geprüfte Kombination wird jetzt im Checkout gespeichert: Expo `~58.0.13`, React Native `0.88.0`, Router `~58.0.22`, Screens `~4.30.0`, Safe Area Context `~5.10.1`, Gesture Handler `~3.3.0`, Reanimated `4.7.1` sowie UI/Widgets `~58.0.20`. Die weiteren Expo-Pakete folgen dem SDK-Abgleich; React bleibt `19.3.0`.

Die Peer-Auflösung funktioniert ohne die Beta-Ausnahme; `.npmrc` setzt nun `legacy-peer-deps=false`. Der weiterhin nötige Widget-Speicherpatch ist als `patches/expo-widgets+58.0.20.patch` gespeichert. Die RN-TypeScript-Übergangsbedingung bleibt: Ohne sie scheitert die Prüfung weiterhin mit 69 Typfehlern.

Die finale Paketkombination bestand in einer temporären Kopie Paketabgleich, Patch-Anwendung, TypeScript und iOS-JavaScript-Export; Expo Doctor meldete allein den bekannten Hinweis zum manuell gepflegten nativen Projekt. Der zuvor erfolgreich gebaute und auf drei Simulatoren gestartete native Stand verwendete noch die älteren RC-Pakete. Ein neuer nativer Build mit den aktualisierten Pods und die vollständige Interaktionsprüfung bleiben separat offen.

Im Checkout anschließend verifiziert: sauberes `npm ci` ohne Peer-Ausnahme, alle vier Patches ohne Versionswarnung, TypeScript und Expo-Paketabgleich erfolgreich. Der native Lockstand wurde mit `pod update --no-repo-update` aufgelöst; Installation aller 130 Pods erfolgreich, `Podfile.lock` und `Pods/Manifest.lock` identisch. Expo Doctor steht bei 19/20 mit dem bekannten Config-Sync-Hinweis. Eigenen AppDelegate, SceneDelegate und Bridges unverändert erhalten; kein Prebuild durchgeführt.

Ausführlicher [Release-Abgleich](expo58-release-audit-2026-10-16.md), priorisierte [offene Aufgaben](offene-aufgaben.md). Die zuletzt gewünschte Zentrierung von „Aufgabe hinzufügen“ unter der linken Liste ist dort als nächste UI-Aufgabe erfasst.
