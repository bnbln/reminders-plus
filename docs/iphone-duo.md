# iPhone Duo

Stand: 25. September 2026. Branch: `codex/expo58-ios27-duo`.
Grundlage ist das Demo-Projekt „iPhone Duo Demo“ (SwiftUI, Xcode 27.2 Beta), die HIG-Seite „Designing for iPhone Duo“ vom 09.09.2026 und die UIKit-Header aus `iPhoneSimulator27.1.sdk`.

## Die vier Größen

| Pose | Punkt | Breite | Senkrechte Leiste |
|---|---|---|---|
| Außen, hoch | 466 × 678 | compact | ja |
| Außen, quer | 678 × 466 | compact | ja |
| Innen, hoch | 669 × 951 | regular | nein |
| Innen, quer | 951 × 669 | regular | ja |

Innen hoch liegt der Falz als waagerechte Region über der Mitte. Er ist nur aktiv, wenn das Gerät angewinkelt ist.

## Was bereits passt

- **Nur System-Bars.** Tabs laufen über `NativeTabs` (`UITabBarController`), Screens über den nativen Stack. Beide wandern von selbst in die senkrechte Leiste.
- **Such-Tab mit Rolle `search`** (iOS 26 und neuer).
- **Safe Area links und rechts.** `VerticalBarSafeArea` rückt Seiten um die Breite der Leiste ein. Hintergründe laufen trotzdem darunter.
- **Keine Gerätelogik.** Die Leiste wird über den Trait `verticalBarEdge` erkannt, nicht über Modell oder Bildschirmmaß.
- **Zustand überlebt das Falten.** Der Wrapper bleibt nach dem ersten Auftauchen der Leiste gemountet. Formulare und Scrollpositionen gehen beim Wechsel nicht verloren.
- **Filter und Profil** erscheinen in der Leiste als native Menüs mit Titel und Symbol.
- **Layouts rechnen mit der Seitenbreite** (`usePageDimensions`), nicht mit der Fensterbreite.

## In diesem Schritt geändert

| Bereich | Vorher | Jetzt |
|---|---|---|
| Size Class | nur Pixelbreiten | `RemindsVerticalBar` meldet zusätzlich die horizontale Size Class. Hook `useIsRegularWidth()`. Android: 600 dp. |
| Sheets: Datum, Ort, Emoji, Projekt, Routine, Neue Aufgabe | Close und Done als eigene Views, erscheinen nicht senkrecht | Mit senkrechter Leiste native Items mit Titel und Symbol: Close oben, Done direkt darunter (`prominent`). Gemeinsamer Hook `useSheetHeaderActions`. |
| Projekt-Detail | Bearbeiten als eigene View | Mit Leiste natives Item „Projekt bearbeiten“ mit Stift-Symbol |
| Assist | „Leeren“ als reiner Text, bleibt horizontal | Mit Leiste natives Item mit Papierkorb-Symbol |
| Projekte-Raster | immer 2 Spalten, innen 310 pt breite Kacheln | innen 4 Spalten, außen 2. Gerade Zahl, damit ein senkrechter Falz zwischen Kacheln liegt. |
| Status und Streaks | Kennzahlen immer 2 × 2 | innen alle vier in einer Reihe |
| Emoji-Picker | Spaltenzahl konnte ungerade sein | immer gerade |
| Übersetzungen | kein „Fertig“ | `common.done` in allen 25 Sprachen |

## Offene Abweichungen

Nach Aufwand und Wirkung sortiert. „Blockiert“ heißt: mit Expo SDK 58 Beta und react-native-screens 4.27 nicht ohne nativen Patch lösbar.

1. **Nur Hochformat auf dem iPhone.** `UISupportedInterfaceOrientations` erlaubt auf dem iPhone kein Querformat. Damit fallen „Innen, quer“ und der angewinkelte Zustand aus, den das Figma-Kit nur quer zeigt. Entscheidung nötig: Querformat freigeben gilt für alle iPhones. Danach sind alle Screens quer zu prüfen, vor allem das Projekt-Board und die Aufgabenerstellung.
2. **Close und Done ohne Rolle.** *Blockiert.* react-native-screens kennt weder `cancellationAction` noch `pinnedTrailingGroup`. Close liegt links, Done rechts. Die Reihenfolge stimmt, aber Done ist nicht gegen das Überlaufmenü gesichert. Lösung: Patch, der Done in `UINavigationItem.pinnedTrailingGroup` legt.
3. **Kompression und Priorität.** *Blockiert.* `verticalBarCompressionBehavior` (iOS 27.1) und `UIBarButtonItem.visibilityPriority` (iOS 27) sind nicht erreichbar. Aufgabenlastige Screens wie Projekt-Detail sollten die Toolbar behalten und die Tab Bar minimieren. Außen quer ist das am deutlichsten.
4. **Eigene Overlays statt Sheets.** Aufgabe anlegen, Projekt anlegen, bearbeiten und Limit sind `transparentModal` mit eigener Karte. Sie weichen dem Falz nicht aus und haben keine Leiste. Sie sitzen unten an der Tastatur, angewinkelt also in der unteren Hälfte. Das funktioniert, solange die Karte nicht über den Falz wächst. Langfristig `formSheet` verwenden.
5. **Liste und Detail nebeneinander.** Die HIG erlaubt innen eine zusätzliche Ebene, etwa Projekte links, Projekt rechts. Expo Router 58 hat dafür keinen Container. react-native-screens bringt `SplitHost` (`UISplitViewController`) nur als experimentelle „gamma“-Komponente mit. Erst angehen, wenn Expo Router ihn anbietet.
6. **Projekt-Board innen.** Unter 768 pt gilt das Handy-Layout: eine 522 pt breite Spalte mit angeschnittenen Nachbarn. Drei Spalten wären innen je rund 200 pt schmal. Vorschlag zum Abstimmen: innen zwei Spalten sichtbar, die dritte per Wischen.
7. **Falz und Scharnier.** `RemindsVerticalBar` meldet die aktive Teilungsregion (`-[UIView reservedRegionsOfKind:]` mit `divisionRegionKind`) als `fold` an JS, Hook `useFoldRegion()`. Aktiv ist sie nur im Buchmodus (angewinkelt). Ganz flach aufgeklappt gibt es keinen Falz, auch nicht im Querformat. Ein Posenwechsel ändert keinen Trait, deshalb stößt ein `UIHingeInteraction` am Fenster die Meldung an. Layouts fragen den Falz ab, nicht Hoch- oder Querformat. Nutzer: Aufgabe-anlegen-Overlay.
8. **Sheet-Platzierung und Small Detent.** `preferredPlacement` (iOS 27) ist in react-native-screens nicht erreichbar. Die Sheets nutzen die Systemvorgabe. Das reicht, solange nur Hochformat erlaubt ist.
9. **Aufgaben-Zubehör an der Tab Bar.** Der `UITabAccessory` (Plus-Button) ist in der senkrechten Leiste nicht geprüft. Die HIG sagt dazu nichts.
10. **Swipe-Zeilen.** `swipe-task-row` und `task-swipe-draggable-list` rechnen mit der Fensterbreite. Mit Leiste ist die Zeile 48 pt schmaler. Die Schwellen fallen etwas zu groß aus, funktional unkritisch.

## Prüfen im Simulator

Build wie in `docs/expo58-ios27-upgrade.md`. Posen wechselt man im Device Hub. Pro Pose:

- Heute, Inbox, Projekte, Suche: Filter und Profil in der Leiste, Inhalt nicht unter der Leiste.
- Aufgabe öffnen, Datum-Sheet: Close oben, Done darunter. Beides tippen.
- Emoji-Sheet: Raster mit gerader Spaltenzahl.
- Projekte: 2 Spalten außen, 4 innen. Kachel ziehen und umsortieren.
- Status und Streaks: Kacheln innen in einer Reihe.
- Text in einem Sheet eingeben, dann falten: Text und Fokus bleiben.
