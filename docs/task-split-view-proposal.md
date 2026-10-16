> Überholt: Der zusätzliche SwiftUI-Navigationscontainer wurde nach der visuellen Prüfung verworfen. Der aktuelle Aufbau ist in `task-split-view-implementation.md` beschrieben.

# Aufgaben als native Liste–Detail-Ansicht

Stand: 3. Oktober 2026. Ursprüngliches Konzept und Quellenprüfung. Die Umsetzung und ihre aktuelle Prüfung sind in [task-split-view-implementation.md](task-split-view-implementation.md) dokumentiert. Die unten genannten Ausgangsversionen beschreiben den Zustand vor dem Update.

## Empfohlene Lösung

Ein zweispaltiger SwiftUI-Container über `NavigationSplitView` aus `@expo/ui/swift-ui`. Die Komponente ist bereits im installierten `@expo/ui` 58.0.3 enthalten. Liste und Detail werden über `RNHostView` eingebettet; der vorhandene Aufgaben-Store bleibt die gemeinsame Datenquelle. `Host` kommt aus dem universellen `@expo/ui`-Entrypoint. Die iOS-Komponente liegt außerhalb des Router-Verzeichnisses, beispielsweise unter `components/tasks/task-workspace.ios.tsx`, mit einer normalen Fallback-Komponente für andere Plattformen.

Das ist ein technisch belegter Kandidat, keine Zusage, dass verschachtelte native Tabs, Header und Gesten ohne Anpassungen funktionieren. Diese Kombination muss ein kleiner iOS-Prototyp zuerst belegen.

```text
Vorhandene globale Navigation / native Tabs
  Aufgabenbereich: Host
    NavigationSplitView
      Sidebar: RNHostView → Aufgabenliste
      Detail:  RNHostView → ausgewählter Aufgaben-Editor / Leerzustand
```

Im ersten Prototyp liegt dieser Container innerhalb eines Aufgaben-Tabs. Sein vorhandener Stack-Header darf nicht zusätzlich zu den SwiftUI-Spaltenheadern erscheinen. Native Tabs bleiben außen; die Darstellung ihrer Duo-Leiste und der Plus-Zubehörleiste ist ein ausdrücklicher Prüfpunkt. Erst nach dieser Prüfung auf Heute, Inbox, Archiv und Projektaufgaben ausweiten.

## Sichtbares Verhalten

- Aufgeklapptes Duo und ausreichend breites iPad-Fenster: Liste links, Editor rechts. Ein Tipp markiert die Zeile und tauscht nur den rechten Inhalt aus. Links bleiben Scrollposition, Filter und eingeklappte Abschnitte erhalten.
- Die Liste ist schmaler als der Editor. Systemseitige Spaltenbreiten und adaptive Layoutvorschläge verwenden; keine 50/50-Aufteilung oder Erkennung anhand des Gerätenamens. Auf Duo muss die Teilung in allen Posen zur reservierten Faltregion passen; das wird nativ geprüft.
- Ohne Auswahl zeigt rechts ein ruhiger Leerzustand „Aufgabe auswählen“. Der Plus-Button bleibt der Liste zugeordnet.
- Schmaler iPad-Modus und Duo-Außendisplay: eine Spalte mit Liste → Detail und systemischem Zurück. Auswahl beim Falten erhalten. Die bestehende kompakte Route bleibt zunächst Fallback, bis das native Collapse-Verhalten geprüft ist.
- Der Editor bekommt einen kompakteren Kopf mit Emoji und editierbarem Titel. Datum, Routine, Ort und Projekt ordnen sich nach der tatsächlichen Spaltenbreite an. Unteraufgaben und Notizen bleiben darunter unabhängig scrollbar.
- Globale Navigation bleibt in der nativen Tab-/Seitenleiste. Filter und Profil gehören zur Liste; Aufgabenaktionen zum Detail. Kein Zurück-Pfeil im breiten Detail, der die ganze Liste verlässt.
- Datum, Projekt und Routine zunächst als bestehende Form-Sheets weiterverwenden; ein zur rechten Spalte verankerter Popover ist eine spätere Option und muss mit RN-Eingaben geprüft werden.
- Hintergrund darf hinter der Systemleiste liegen; Eingaben und Aktionen respektieren die Safe Areas der jeweiligen Spalte.

## Warum der aktuelle Klick die Liste verdrängt

`app/(tabs)/inbox/index.tsx` und `app/(tabs)/home/index.tsx` rufen `router.push('/task/[id]')` auf. Die Detailroute ist im Root-Stack in `app/_layout.tsx` registriert und liegt damit über den Tabs. Für die breite Darstellung muss aus diesem Push eine Auswahl innerhalb des Aufgabenbereichs werden.

`app/task/[id].tsx` ist derzeit gleichzeitig Editor und Navigations-Screen: lokale Route-ID, `Stack.Screen`, `useHeaderHeight`, Picker-Pushes und `router.back()` sind miteinander verbunden. Die Route lässt sich deshalb nicht unverändert als rechte Spalte rendern.

## Integrationsschritte

1. Einen gemeinsamen `TaskDetailContent` extrahieren. Übergaben: `taskId`, Präsentationsart und Aktionen für Zurück/Schließen/Picker. Der kompakte Router-Screen und die breite Detailspalte benutzen denselben Editor. `Stack.Screen` und Header-Höhen bleiben beim Route-Wrapper.
2. Auswahl im Aufgabenbereich speichern: `selectedTaskId` und Herkunft der Liste. `openTask(id)` wählt breit die Aufgabe und nutzt kompakt die bestehende Route. Beim Löschen Auswahl sicher leeren; bei Erledigen ein definiertes Verhalten vorsehen, auch wenn die Zeile aus dem aktuellen Filter verschwindet.
3. Den SwiftUI-Container mit Inbox und echtem Editor prototypisieren. `columnVisibility` zunächst systemisch verwalten lassen. Falls kontrolliert, `onColumnVisibilityChange` zurück in State übernehmen. Für `preferredCompactColumn` ebenfalls den nativen Rückkanal beachten, damit die App den systemischen Zurück-Wechsel nicht überschreibt.
4. Vorhandene native Traits verwenden: `RemindsVerticalBar` liefert schon `isRegularWidth`. Die senkrechte Leiste allein ist kein Kriterium für zwei Spalten. Native Container entscheiden über Kollaps; Größenklassen steuern begleitende Darstellung.
5. `usePageInsets()` auf die jeweilige Spalte beziehen. Heute-Layouts, Swipe-/Drag-Breiten und Detail-Kacheln dürfen nicht weiter die volle Fensterbreite annehmen. Tastatur-Abstände im Editor spaltenbezogen prüfen.
6. Alle Task-Einstiege vereinheitlichen: Inbox, Heute, Archiv, Projekt sowie Assistenz. Externe `/task/[id]`-Links bleiben gültig; sie benötigen eine definierte Liste als Herkunft (beispielsweise Inbox). Routenzustand und Auswahl dürfen sich beim Falten nicht widersprechen.

## Alternative: Expo Router SplitView

`expo-router/unstable-split-view` verwendet native System-Split-Views und ist ebenfalls installiert. In SDK 58 ist es laut Dokumentation weiterhin **Alpha** und nicht produktionsreif. Es muss an die Root-Layout-Ebene, darf nicht in einen anderen nativen Navigator eingesetzt werden und bietet eingeschränkte Header-Anpassung. Die installierte Implementierung prüft diese Verschachtelung tatsächlich und wirft einen Fehler.

Für Reminds würde das einen größeren Umbau des Root-Stacks, der Tabs und der Modals bedeuten. Deshalb zuerst den lokal begrenzten Expo-UI-Prototyp prüfen. Falls dessen native Einbettung scheitert, den Root-Split als zweite Variante evaluieren. Ein selbst gebautes Flexbox-Split ist möglich, übernimmt aber Collapse, Faltregion und Navigation nicht automatisch.

## Expo: aktueller Stand und sinnvoller Update-Weg

Live geprüft über npm am 3. Oktober 2026:

| Paket | Installiert | Vorgabe aus Expo 58.0.3 |
| --- | --- | --- |
| Expo | 58.0.0-preview.3 | 58.0.3 |
| React | 19.2.3 | 19.3.0 |
| React Native | 0.88.0-rc.0 | 0.88.0-rc.3 |
| Expo Router | 58.0.4 | ~58.0.13 |
| Expo UI | 58.0.3 | ~58.0.12 |
| Expo Widgets | 58.0.3 | ~58.0.12 |
| React Native Screens | 4.27.0 | ~4.28.0 |
| Reanimated | 4.6.0 | 4.7.0 |
| Worklets | 0.12.2 | 0.13.0 |

Quelle für die Zielkombination: `package/bundledNativeModules.json` aus dem veröffentlichten Expo-58.0.3-Tarball, nicht einzeln geratene Paketversionen.

**58.0.3 liegt unter `next`, während `latest` noch 57.0.26 ist.** React Native 0.88.0 ist noch nicht veröffentlicht; `next` steht auf 0.88.0-rc.3. Ein Update auf 58.0.3 verlässt die alte Preview-Paketversion, bleibt aber auf einer Vorab-Kombination. Weniger „preview“ im Namen ist kein Beleg für vollständige Stabilität. Expo stellt SDK 58 in der derzeit gefundenen Ankündigung weiterhin als Beta vor.

Empfehlung: innerhalb SDK 58 auf die aktuelle kompatible Kombination aktualisieren und nativ prüfen. Das passt besser zur vorhandenen iOS-27-/Scene-Integration als ein Rückbau auf SDK 57. SDK 57 ist der derzeitige `latest`-Kanal; ein Downgrade wäre ein eigenständiger Migrationsschritt, dessen Duo-Funktionalität nicht belegt ist.

Geplante Befehle, in diesem Konzept **nicht ausgeführt**:

```sh
npx expo install expo@58.0.3
npx expo install --fix
npx expo-doctor
npx expo install --check
```

Vor Installation den Widget-Patch `patches/expo-widgets+58.0.3.patch` auf die Zielversion übertragen oder seine Funktion als upstream behoben nachweisen. Er ändert die gemeinsame Persistenz von App und Widget; bloßes Entfernen wäre keine belastbare Migration. Die übrigen drei Patches ebenfalls prüfen. Danach Pods aktualisieren, TypeScript und iOS-Export prüfen und App **sowie Widget-Target** bauen und starten. Peer-Dependency- und Deep-Import-Ausnahmen aus dem früheren Upgrade erneut prüfen.

Kein `prebuild --clean`: Der eingecheckte iOS-Ordner enthält eigene Scene-/AppDelegate-Anpassungen; die vorhandene Projektdokumentation beschreibt ausdrücklich, dass diese noch nicht vollständig durch Plugins reproduzierbar sind. Vorhandene uncommittete Änderungen erhalten.

## Abnahme, bevor die Lösung als fertig gilt

Inbox und Heute auf iPad breit/schmal sowie Duo innen flach/angewinkelt und außen prüfen. Aufgabe A → B wechseln, links scrollen, Notizen und Unteraufgaben bearbeiten, Picker öffnen/schließen, Aufgabe erledigen/löschen, Tab wechseln und Deep Link öffnen. Beim Falten müssen Auswahl, Editorinhalt und Navigation erhalten bleiben. Swipe und Drag dürfen nur die Liste betreffen. Light/Dark Mode, große Schrift, Tastatur und systemische Leiste separat prüfen. Erfolgreicher Build allein ist keine Layout-Abnahme.

## Quellen

- [Expo Router SplitView: Status und Einschränkungen](https://docs.expo.dev/versions/v58.0.0/sdk/router/split-view/)
- [Expo UI SwiftUI](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/)
- [NavigationSplitView: Expo-Quellcode und API](https://github.com/expo/expo/blob/main/packages/expo-ui/src/swift-ui/NavigationSplitView/index.tsx)
- [Apple: adaptive Duo-Layouts, Antwort eines DTS Engineers](https://developer.apple.com/forums/thread/847877)
- [Expo SDK 58 Beta](https://expo.dev/changelog/sdk-58-beta)
- [Expo npm-Paket und Versionen](https://www.npmjs.com/package/expo?activeTab=versions)
- [Expo 58.0.3 Paketarchiv](https://registry.npmjs.org/expo/-/expo-58.0.3.tgz)
- Lokal geprüft: `package.json`, installierte TypeScript-/Swift-Quellen, `app/_layout.tsx`, `app/task/[id].tsx`, `RemindsVerticalBar.m`, `docs/expo58-ios27-upgrade.md`.
