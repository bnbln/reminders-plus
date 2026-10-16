# Split View auf Duo und iPad: behalten oder zurückstellen?

> **Entschieden am 16.10.2026: Option A, zurückgestellt.** Geparkter Stand: Branch `park/task-split-view`.

Stand 16.10.2026, Branch `codex/expo58-ios27-duo` an `c26efd4`. Nur Analyse, nichts geändert.

## Empfehlung

**Für dieses Release zurückstellen**: Aufgaben öffnen auf Duo und iPad wieder als normale Vollbild-Seite wie auf dem iPhone. Den heutigen Stand vorher auf einem Sicherungsbranch parken. Die Split-Ansicht danach neu aufbauen, und zwar auf Apples Container für das Duo (`ArrangementView`, iOS 27.1), statt die eigene Lösung weiter zu flicken.

Kurz begründet: Die Fehler, die du siehst, kommen aus der Bauart der jetzigen Lösung, nicht aus Details. Sie weiß nichts vom Falz und vom Buchmodus. Eine saubere Lösung dafür gibt es in SDK 58 zwar erst als SwiftUI-Baustein, der mit unseren React-Native-Listen aber noch nicht erprobt ist. Das ist ein eigenes Projekt, kein Release-Fix.

## Warum die jetzige Umsetzung so wirkt

Die Split-Ansicht ist selbst gebaut: zwei React-Native-Views nebeneinander in `components/tasks/task-workspace.ios.tsx` (76 Zeilen), kein nativer Split-Container.

| Was du siehst | Wahrscheinliche Ursache (aus dem Code gelesen, nicht auf dem Gerät reproduziert) |
|---|---|
| Im kleinen Modus ist der weiße Hintergrund vor dem Verlauf hart abgeschnitten, keine Rundung, kein Sheet-Rahmen | Unter 680 pt Breite, aber mit „regular“ Size Class (Duo innen hochkant = 669 pt, iPad schmale Fenster) zeigt der Workspace das Detail **eingebettet in voller Breite**: Radius 0, kein Innenabstand, weiße Fläche startet erst unter `headerHeight`, darüber bleibt der Verlauf (`task-workspace.ios.tsx:59-72`). Das ist weder Seite noch Sheet. |
| Seitenleisten nicht weiß | Das Detail steckt in `PagePane`, das um die Duo-Leiste einrückt. Die weiße Fläche endet an der Safe Area, darunter läuft der Home-Verlauf weiter. Eine echte Seite würde ihren Hintergrund unter die Leiste ziehen. |
| Verwirrende Navigation | `app/task/[id].tsx:12` leitet auf jedem „regular“ iOS-Gerät nach `/inbox?selectedTaskId=…` um. Ein Tipp in Heute auf dem Duo innen springt also in den Inbox-Tab und zeigt dort das Detail ohne Liste. Suche, Routinen, Assist und Widgets verlieren ihren Kontext. |
| Buchmodus nicht genutzt | Die Liste ist 40 % breit (300–420 pt), der Falz liegt bei der Hälfte (ca. 475 pt quer). Die Spaltengrenze liegt also nicht auf dem Falz, das Detail läuft über den Knick. Falz und Scharnier werden nirgends abgefragt (`docs/iphone-duo.md`, Punkt 7). |

Dazu kommen die offenen Punkte, die nur wegen des Splits existieren: Tastatur im eingebetteten Detail (`task-detail-content.tsx:756`), 680-pt-Grenze vs. 669 pt, Hinzufügen-Button in der linken Spalte, blaue Auswahl-Umrandung in der Liste. Alle fallen mit dem Zurückstellen weg.

## Was Apple für das Duo vorsieht

Aus der HIG „Designing for iPhone Duo“ und den Tech Talks:

- Das Duo sind **zwei Size Classes, keine Posen**: außen compact, innen regular. Keine festen Breiten oder Breakpoints (wir haben 680 pt).
- Für Liste/Detail ist eine **Split-Anordnung** richtig („main-detail … neither of them are ever obscured“). Apple: „You don't want just a stretched out iPhone app.“ Das spricht langfristig *für* einen Split.
- **Buchmodus:** Der Falz ist eine Teilungsregion, nur aktiv wenn angewinkelt. Inhalte bleiben in ihrer Hälfte, Bedienelemente rutschen in die untere Hälfte bzw. weg vom Falz. `ArrangementView` macht das automatisch.
- **Listen und Feeds weichen nicht aus**, sie scrollen einfach. Eine Vollbild-Liste ist also im Buchmodus in Ordnung.
- In einem Split nimmt **nur die Detail-Spalte an der senkrechten Leiste teil**. Sheets weichen dem Falz automatisch aus, eigene Overlays nicht.
- Ein Split muss beim häufigen Auf- und Zuklappen dieselbe Hierarchie behalten.

## Was Expo SDK 58 mitbringt

- **`ArrangementView`** in `@expo/ui` (SwiftUI): primärer und sekundärer View, Stil `split` oder `overlay`, Mindest-/Idealbreiten. Laut Expo „der Container, den Apple für das Duo empfiehlt“. **Nur iOS 27.1+**, darunter rendern die Kinder ohne Container. Ob React-Native-Views (`RNHostView`) darin sauber funktionieren, dokumentiert Expo nicht. Apple warnt außerdem, keine Navigationscontainer hineinzulegen.
- **`NavigationSplitView`** in `@expo/ui`, zwei oder drei Spalten. Ebenfalls SwiftUI, ersetzt nicht den Expo-Router-Stack.
- **`expo-hinge`**: Scharnierwinkel und Zustand (`useHinge()`), iOS 27.1+. Apple empfiehlt das für Interaktionen und Effekte, nicht fürs Layout.
- **Expo Router 58 hat weiterhin keinen Split-Container.** `UISplitViewController`/`SplitHost` aus react-native-screens wird nicht erwähnt, bleibt also experimentell.
- `ToolbarItem` mit `visibilityPriority`, Button-Rolle `close`: Teile der „blockierten“ Punkte aus `docs/iphone-duo.md` (2, 3) sind über `Stack.Toolbar` jetzt erreichbar.

## Was iOS 27 betrifft

- Scene-Lifecycle ist Pflicht und iPhone-Apps sind **in der Größe veränderbar** (Split View mit zwei Apps auf dem Duo). Hochformat-Sperre greift dann ggf. nicht: Das Duo-Innendisplay lief im Simulator auch quer. Breiten können also beliebig sein, ein fester 680-pt-Schalter flackert beim Ziehen hin und her.
- Senkrechte Leisten kommen automatisch, solange System-Bars genutzt werden (bei uns: NativeTabs und nativer Stack, passt). Eigene Overlays (Aufgabe anlegen, Projekt anlegen/bearbeiten, Limit) bekommen keine Leiste und weichen dem Falz nicht aus.
- iOS 27.1: `verticalBarCompressionBehavior`, `preferredPlacement` für Sheets, Falz-/Scharnier-APIs.

## Optionen

| | A: Zurückstellen (empfohlen) | B: Jetzige Lösung reparieren | C: Neu auf ArrangementView |
|---|---|---|---|
| Was | Vollbild-Seiten überall, Split auf Sicherungsbranch | Hintergründe, Rundung, Redirect, Tastatur, 669 pt, Button fixen | Split mit Apples Container, Fallback Vollbild unter iOS 27.1 |
| Aufwand | klein, ca. 5 Dateien | mittel, viele Kanten | groß, erst Machbarkeitstest nötig |
| Buchmodus | Liste scrollt einfach, laut HIG ok | weiter nicht genutzt | vom System übernommen |
| Risiko fürs Release | gering, iPhone-Pfad ist erprobt | hoch, jede Pose und iPad-Fenstergröße neu testen | zu hoch für dieses Release |
| Fällt weg aus offenen Aufgaben | 5 Punkte | keine | später |

## Was das Zurückstellen konkret heißt

1. Sicherungsbranch vom jetzigen Stand anlegen, z. B. `park/task-split-view`.
2. `task-workspace.ios.tsx` auf einen dünnen Wrapper reduzieren, der **nur** die Filter- und Profil-Items in der Duo-Leiste setzt. Das macht er heute nebenbei mit (`unstable_headerLeftItems`) und muss bleiben.
3. Redirect in `app/task/[id].tsx` entfernen, Aufgaben öffnen überall über `/task/[id]`.
4. `useOpenTask` bleibt, fällt ohne Workspace-Kontext automatisch auf den Push zurück. `embedded` in `TaskDetailContent` kann für später bleiben oder raus.
5. Blaue Auswahl-Umrandung in `swipe-task-row.tsx` fällt mit weg.
6. Nicht anfassen: SDK 58, Scene-Lifecycle, Duo-Safe-Areas, native Sheet-Aktionen, `usePageDimensions` in den Listen.

Danach auf Duo (außen, innen hoch/quer, angewinkelt) und iPad prüfen: Aufgabe aus Heute, Inbox, Projekt, Suche, Routine, Widget öffnen und zurück.

## Danach, für ein späteres Release

Kleiner Machbarkeitstest: `ArrangementView` mit Stil `split` und zwei `RNHostView`s (Liste, Detail) auf dem Duo-Simulator. Wenn das trägt, liegt der Falz automatisch zwischen den Spalten, die Leiste gehört dem Detail und der Buchmodus funktioniert. Unter iOS 27.1 und auf dem iPad bis dahin Vollbild.

## Quellen

- [Expo SDK 58 Changelog](https://expo.dev/changelog/sdk-58)
- [Expo UI: ArrangementView (SDK 58)](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/arrangementview/)
- [Apple Tech Talk: Strike a pose with adaptive layouts on iPhone Duo](https://developer.apple.com/videos/play/tech-talks/111463/)
- [Apple Tech Talk: Design for iPhone Duo](https://developer.apple.com/videos/play/tech-talks/111466/)
- [Designing for iPhone Duo: What Moves, Splits, and Stays](https://blakecrosley.com/blog/designing-for-iphone-duo) (Zusammenfassung der HIG)
- [iOS 27.1: vertical bars, Split View, Dynamic Island](https://ecorpit.com/ios-27-1-split-view-dynamic-island-ui-changes-developers-2026/) (Drittanbieter)
