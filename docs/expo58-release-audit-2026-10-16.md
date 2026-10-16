# Expo 58 Release-Abgleich – 16. Oktober 2026

Geprüfter Ausgangsstand: `901e138`. Zunächst erfolgte der Release-Vergleich in `/tmp/reminds-sdk58-final-audit`; native Simulator-Builds verwendeten einen eigenen DerivedData-Ordner. Auf anschließenden Wunsch werden die geprüften SDK-Versionen nun im Checkout gespeichert. UI-Korrekturen stehen in [offene-aufgaben.md](offene-aufgaben.md).

## Ergebnis des Release-Abgleichs

Expo SDK 58 wurde am 15. Oktober veröffentlicht. npm lieferte beim Abgleich Expo `58.0.13`, Router `58.0.22` und React Native `0.88.0`. Zu Beginn waren im Checkout noch Expo `58.0.3`, Router `58.0.13` und React Native `0.88.0-rc.3` installiert. `expo install --check` meldete 25 Abweichungen einschließlich React Native; Expo Doctor zählte 24 weitere Pakete und meldete außerdem den bekannten Hinweis zum manuell gepflegten nativen Projekt. Die Tabelle dokumentiert diesen Ausgangsvergleich; die empfohlenen Versionen werden anschließend gespeichert.

Besonders relevant für die Geräteprüfung:

| Paket | Installiert | Empfohlener Stand |
| --- | --- | --- |
| expo | 58.0.3 | ~58.0.13 |
| expo-router | 58.0.13 | ~58.0.22 |
| react-native | 0.88.0-rc.3 | 0.88.0 |
| react-native-screens | 4.28.0 | ~4.30.0 |
| react-native-safe-area-context | 5.9.1 | ~5.10.1 |
| react-native-gesture-handler | 3.2.1 | ~3.3.0 |
| react-native-reanimated | 4.7.0 | 4.7.1 |
| @expo/ui / expo-widgets | 58.0.12 | ~58.0.20 |
| @shopify/react-native-skia | 2.13.1 | 2.14.0 |

Die Release-Pakete wurden zunächst in der temporären Kopie installiert. Dort bestanden der Paketabgleich und die TypeScript-Prüfung mit den bisherigen Compilerbedingungen. Die generierten Routentypen wurden aus dem unveränderten Checkout übernommen, weil sie im Git-Archiv fehlen. Danach wurde die geprüfte Kombination auf Wunsch in den Checkout übernommen.

## Bisherige Anpassungen

| Anpassung | Bewertung zum Release |
| --- | --- |
| SceneDelegate + React-Native-Factory im AppDelegate | Entspricht dem Scene-Lifecycle von Expo 58. `super.scene` erstellt das Fenster; anschließend werden unsere Hintergründe und das UITabAccessory eingerichtet. |
| CloudKit und native Zubehörleiste | Weiterhin eigener nativer Code. Kein Clean-Prebuild: Die Config-Plugins können diese Integration nicht vollständig wiederherstellen. |
| Router-Imports | Die verwendeten `useHeaderHeight`- und `PlatformPressable`-Exports bestehen auch im offiziellen Router-58.0.22-Paket. Kein zusätzlicher Navigator notwendig. |
| Header-Erscheinungsbild | Router 58.0.20 aktiviert standardmäßig die native Header-Darstellung auf iOS 26+. Transparente Header und der manuelle `headerHeight`-Abstand im Workspace brauchen deshalb nach dem finalen nativen Update eine neue Sichtprüfung. |
| Native Tabs / Such-Tab | Stabile Imports über `expo-router/native-tabs`; Suche steht zuletzt und trägt unter iOS 26+ die Rolle `search`. Funktion im Simulator gesondert prüfen. |
| Duo-Traiterkennung | Verwendet `verticalBarEdge` und `systemTraitsAffectingVerticalBarEdge`, passend zum installierten iOS-27.1-SDK. Keine Modellnamenerkennung. |
| Safe Areas / native Header-Menüs | Grundansatz bleibt sinnvoll. Screens-SafeAreaView enthält in 4.30 weiterhin dieselben APIs. Der eigene Wrapper ist durch das Paketupdate nicht automatisch überflüssig. Zustandswechsel siehe Befund 2. |
| Seiten-/Spaltenmaße | `PagePane` liefert lokale Maße. Swipe-Zeilen und Drag-Liste verwenden inzwischen `usePageDimensions`; die entsprechende offene Notiz in `iphone-duo.md` ist überholt. |
| Day-Slider | Tatsächliche Alphamaske mit `MaskedView` und transparenten Randfarben vorhanden. |
| Modalhintergründe | Aufgabe anlegen und Projekt anlegen erweitern den Hintergrund hinter die Duo-Leiste. Bearbeiten und Projektlimit fehlen in dieser Angleichung. |
| Close / Done | Gemeinsamer `useSheetHeaderActions` setzt native Items bei aktiver Duo-Leiste und räumt die jeweils anderen Optionen auf. |
| Liste / Detail | Gemeinsamer UIKit-/Router-Rahmen bleibt erhalten; Spalten ab regular + 680 pt. Keyboard, öffentliche Aufgabenroute und tatsächliche Duo-Breite brauchen Korrektur bzw. Prüfung. |
| Kalender / Dateisystem | Verwenden die Legacy-APIs; der neue asynchrone `File.write()`-Vertrag betrifft diese Aufrufe nicht. |
| Benachrichtigungen | Eigener Foreground-Handler vorhanden; die neue automatische Anzeige ändert den gewählten Handler nicht. |
| @expo/ui-Layout | Widgets verwenden überwiegend explizite Abstände. Kein Wechsel auf einen zusätzlichen SwiftUI-Navigationsrahmen erforderlich. |
| Pod-/Hermes-Hook | Mindestziel 16.4 und Konfigurationswechsel-Hook bleiben nachvollziehbar. Paketupdate erfordert erneutes `pod install` und nativen Neubuild. |

## Konkrete Befunde

### 1. Ausgangspunkt: Release-Paketstand fehlte

Der für die Simulatorprüfung erzeugte native Build prüfte den früheren RC-Stand. Ein erfolgreicher Lauf ist keine Freigabe der finalen Paketkombination. Die empfohlenen Versionen und der aktualisierte Widget-Patch werden zum Abschluss gespeichert; anschließend bleibt ein nativer Neubuild mit erneuter Geräteprüfung erforderlich.

### 2. Erster Wechsel zu einer Duo-Leiste kann Formularzustand verlieren

`components/navigation/vertical-bar-safe-area.tsx:76` liefert zunächst direkt die Kinder und später einen neuen View-/SafeAreaView-Baum. `hasSeenVerticalBar` verhindert weitere Strukturwechsel nach der ersten Erkennung, schützt aber nicht den ersten Wechsel von einer Pose ohne Leiste zu einer Pose mit Leiste. React ersetzt dabei den bisherigen Unterbaum; lokaler Zustand eines offenen Formulars kann verloren gehen. Szenario: innen ohne Leiste starten, Eingabe beginnen, erstmals zum Außendisplay wechseln. Logisch nachgewiesen; genaue Interaktion noch im Simulator zu verifizieren. Der Wrapper sollte auf iOS von Anfang an strukturell stabil sein.

### 3. Eingebettetes Detail hat keinen Tastaturausgleich

`components/tasks/task-detail-content.tsx:756` entfernt den Tastaturspacer für `embedded`. Der umgebende Workspace verwendet weder KeyboardAvoidingView noch einen anderen Tastaturausgleich; der ScrollView aktiviert keine automatischen Keyboard-Insets. Das betrifft iPad, breites Duo und ein nach Größenwechsel kompaktes, weiterhin eingebettetes Detail. Besonders das Notizfeld unten kann von der Bildschirmtastatur verdeckt werden. `scrollToEnd` allein schafft keinen zusätzlichen Scrollraum. Native Laufzeitprüfung nötig.

### 4. Aufgabenroute verliert den bisherigen Listenkontext

`app/task/[id].tsx:12` leitet auf allen regular-breiten iOS-Geräten nach `/inbox?selectedTaskId=…` um. Suche, Routinen, Assist und Widget-Links verwenden diese Route. Dadurch kann etwa ein Suchtreffer statt neben den Suchergebnissen in der Inbox erscheinen; auf dem innen hochkant betriebenen Duo greift der Redirect auch dann, wenn der Workspace wegen der 680-pt-Grenze gar keine zwei Spalten zeigt. Die Weiterleitung sollte Herkunft und verfügbare Spaltenbreite berücksichtigen.

### 5. Modalhintergrund bei Projektbearbeitung und Limit unvollständig

`app/project/edit-modal.tsx:357` und `app/project/limit-modal.tsx:68` verwenden nur den lokalen `styles.backdrop`. Anders als die beiden Erstellungsmodals berücksichtigen sie `usePageInsets()` nicht. Mit aktivem Duo-Wrapper endet ihre Abdunklung an der sicheren Inhaltskante; hinter der Leiste bleibt das darunterliegende Bild anders als beim Anlegen sichtbar. Gleiche Hintergrundausdehnung auf alle transparenten Projektmodals anwenden.

### 6. Split-View-Grenze und Orientierung begrenzen Duo

Der Split setzt mindestens 680 pt nutzbare Breite voraus. Laut bestehender Gerätedokumentation hat das Duo innen hochkant 669 pt. Diese Pose zeigt deshalb nur das Detail statt Liste und Detail nebeneinander. Die native iPhone-Konfiguration enthält zwar nur Portrait und PortraitUpsideDown; das resizable Duo-Innendisplay zeigte die App im Simulator trotzdem quer. Aus Info.plist allein lässt sich daher keine Querformatsperre ableiten. Für ein durchgängiges Duo-Split-Erlebnis die tatsächliche Fensterbreite und Mindestbreiten beider Spalten prüfen.

## Patches und Beta-Ausnahmen

- Alle vier vorhandenen Patches lassen sich auf die aktualisierte temporäre Installation anwenden.
- `expo-widgets@58.0.20` verwendet upstream weiterhin UserDefaults. Unser atomarer App-Group-Dateispeicher ist nicht enthalten. Der Patch bleibt erhalten und wird jetzt als `expo-widgets+58.0.20.patch` ohne Versionswarnung angewendet; die betroffene Upstream-Datei war unverändert.
- Die Drag-/Swipe-Erweiterungen sind App-Verhalten und werden nicht durch den Expo-Release ersetzt.
- Der Menu-Patch bleibt anwendbar; sein nativer Import ist weiterhin relevant. Die entfernten eigenen Kontextmenü-Callbacks sollten bei Menü-/Keyboard-Prüfungen mit betrachtet werden.
- Ein Installations-Dry-Run der finalen Kombination mit `legacy-peer-deps=false` gelingt. Die alte Beta-Ausnahme in `.npmrc` kann bei der Migration entfallen.
- Die TypeScript-Ausnahme `react-native-legacy-deep-imports` bleibt vorerst nötig: Ein separater Prüflauf ohne sie erzeugt weiterhin Typfehler, unter anderem an nativen Event-Callbacks. Nicht einfach entfernen; Strict-API-Migration separat bearbeiten.

## Prüfstatus

- TypeScript im ursprünglichen Checkout: bestanden.
- `npm run lint`: 107 Fehler und 65 Warnungen; kein sauberer Ausgangsstand. Vor allem React-Compiler-/Hook-Regeln in bestehenden Komponenten. Nicht als durch den Release neu verursacht gewertet.
- Vollständiger zusätzlicher `eslint .`-Lauf: 119 Fehler, 68 Warnungen; dieser umfasst mehr Verzeichnisse als `expo lint`. Workspace und Safe-Area-Wrapper selbst haben dabei keine Lint-Befunde.
- Finalpakete in temporärer Kopie: Paketabgleich bestanden; alle Patches anwendbar; TypeScript mit bisherigen Bedingungen bestanden; Peer-Auflösung ohne Beta-Ausnahme bestanden.
- Strict-RN-TypeScript ohne Übergangsbedingung: 69 Typfehler.
- Finalpakete: iOS-JavaScript-Export bestanden; Expo Doctor 19/20 Prüfungen, allein der bekannte Hinweis zum gepflegten nativen Projekt bleibt.
- Nativer Release-Build einschließlich Widget-Erweiterung: bestanden, anschließend auch mit normaler Simulator-Signierung erfolgreich. Dabei wurden noch die RC-Abhängigkeiten des Ausgangsstands verwendet.
- Start und sichtbare Hauptansichten auf iPhone 17e (iOS 27.0), iPad Pro 11 M5 (iPadOS 27.0) und Duo (iOS 27.1) bestätigt. Duo innen quer: native Leiste, Filter, Profil und Hintergrund sichtbar. iPad: Aufgaben-Spaltendetail mit erhaltener Heute-Liste sichtbar; Notizfeld ließ sich fokussieren. Die Bildschirmtastatur war dabei nicht eingeblendet, daher kein Nachweis gegen den Keyboard-Befund.
- Device Hub reagierte teilweise mit Timeouts bzw. `noWindowsAvailable`; vollständige Tap-, Fold-, Such- und Tastaturfolgen sind offen. Bei `simctl openurl` erschien zudem ein Systemdialog; Screenshots vor dessen Bestätigung sind kein abgeschlossener Deep-Link-Nachweis.
- Neu gemeldete UI-Aufgabe: „Aufgabe hinzufügen“ bei geöffnetem Spaltendetail mittig unter der linken Liste positionieren. Noch nicht implementiert; in der Aufgabenliste erfasst.

### Anschließend gespeicherter Release-Stand

`package.json`, npm-Lockfile, `.npmrc` und der versionierte Widget-Patch wurden auf die geprüfte stabile Kombination umgestellt. Sauberes `npm ci` und alle vier Patches sind erfolgreich, ebenso TypeScript und `expo install --check` im tatsächlichen Checkout. Expo Doctor besteht 19/20 Prüfungen; allein der bisherige Config-Sync-Hinweis bleibt. CocoaPods musste den alten RC-Lockstand auflösen: `pod update --no-repo-update` installiert 130 Pods erfolgreich, und `Podfile.lock` stimmt mit `Pods/Manifest.lock` überein. Der neue native Build und die UI-Korrekturen bleiben gemäß dem letzten Nutzerauftrag offen.

Lokale Prüflogs: `.expo/qa/sdk58-release-2026-10-16/`.

## Quellen

- [Expo SDK 58 Release](https://expo.dev/changelog/sdk-58)
- [Expo Router 57 → 58](https://docs.expo.dev/router/migrate/sdk-57-to-58/)
- [Expo Scene-Lifecycle](https://expo.fyi/ios-scene-lifecycle)
- [Expo Router Changelog](https://github.com/expo/expo/blob/sdk-58/packages/expo-router/CHANGELOG.md)
- Offizielle npm-Pakete wurden lokal ausgepackt und mit den installierten Implementierungen verglichen.
